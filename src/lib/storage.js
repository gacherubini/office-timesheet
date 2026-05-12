import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const BUCKET = process.env.BUCKET_NAME
const ENDPOINT = process.env.AWS_ENDPOINT_URL_S3

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: ENDPOINT,
  forcePathStyle: true,
})

function buildKey(prefix, mimetype) {
  const ext = mimetype?.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin'
  return `${prefix}/${randomUUID()}.${ext}`
}

export async function uploadFile(prefix, { buffer, mimetype }) {
  if (!BUCKET) throw new Error('BUCKET_NAME não configurada.')
  const key = buildKey(prefix, mimetype)
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
  if (!BUCKET || !key) return
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } catch (err) {
    console.error(`Falha ao deletar ${key}:`, err.message)
  }
}

export function getPublicUrl(key) {
  if (!BUCKET || !key) return null
  // Domínio público canônico do Tigris (requer bucket configurado como public)
  return `https://${BUCKET}.t3.tigrisfiles.io/${key}`
}

export function extractKeyFromUrl(url) {
  if (!url || !BUCKET) return null
  // Formato novo (público)
  const newPrefix = `https://${BUCKET}.t3.tigrisfiles.io/`
  if (url.startsWith(newPrefix)) return url.slice(newPrefix.length)
  // Formato antigo (path-style do endpoint S3) — mantém compat com URLs já gravadas
  if (ENDPOINT) {
    const oldPrefix = `${ENDPOINT.replace(/\/$/, '')}/${BUCKET}/`
    if (url.startsWith(oldPrefix)) return url.slice(oldPrefix.length)
  }
  return null
}
