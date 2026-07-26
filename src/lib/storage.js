import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { logger } from './logger.js'

const BUCKET = process.env.BUCKET_NAME
const ENDPOINT = process.env.AWS_ENDPOINT_URL_S3

// Fallback local: quando BUCKET não está configurado (dev sem S3),
// grava em src/uploads e devolve URL /api/uploads/... (Vite proxy → API).
const LOCAL_DIR = path.resolve(process.cwd(), 'uploads')
const LOCAL_URL_PREFIX = '/api/uploads/'
const USE_LOCAL = !BUCKET

export const localUploadsDir = LOCAL_DIR

const s3 = USE_LOCAL
  ? null
  : new S3Client({
      region: process.env.AWS_REGION || 'auto',
      endpoint: ENDPOINT,
      forcePathStyle: true,
    })

function buildKey(prefix, mimetype) {
  const ext = mimetype?.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'
  return `${prefix}/${randomUUID()}.${ext}`
}

export async function uploadFile(prefix, { buffer, mimetype }) {
  const key = buildKey(prefix, mimetype)

  if (USE_LOCAL) {
    const filePath = path.join(LOCAL_DIR, key)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, buffer)
    return { key, url: `${LOCAL_URL_PREFIX}${key}` }
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    ACL: 'public-read',
  }))
  return { key, url: getPublicUrl(key) }
}

export async function deleteFile(key) {
  if (!key) return

  if (USE_LOCAL) {
    try {
      await unlink(path.join(LOCAL_DIR, key))
    } catch (err) {
      if (err.code !== 'ENOENT') logger.error({ key, err: { message: err.message } }, 'Falha ao deletar arquivo local')
    }
    return
  }

  if (!BUCKET) return
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch (err) {
    logger.error({ key, err: { message: err.message } }, 'Falha ao deletar arquivo')
  }
}

export function getPublicUrl(key) {
  if (!key) return null
  if (USE_LOCAL) return `${LOCAL_URL_PREFIX}${key}`
  return `https://${BUCKET}.fly.storage.tigris.dev/${key}`
}

export function extractKeyFromUrl(url) {
  if (!url) return null

  if (url.startsWith(LOCAL_URL_PREFIX)) return url.slice(LOCAL_URL_PREFIX.length)

  if (!BUCKET) return null
  const currentPrefix = `https://${BUCKET}.fly.storage.tigris.dev/`
  if (url.startsWith(currentPrefix)) return url.slice(currentPrefix.length)
  const legacyTigrisPrefix = `https://${BUCKET}.t3.tigrisfiles.io/`
  if (url.startsWith(legacyTigrisPrefix)) return url.slice(legacyTigrisPrefix.length)
  if (ENDPOINT) {
    const oldPrefix = `${ENDPOINT.replace(/\/$/, '')}/${BUCKET}/`
    if (url.startsWith(oldPrefix)) return url.slice(oldPrefix.length)
  }
  return null
}
