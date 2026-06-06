import crypto from 'crypto'

// Cifra simétrica para segredos em repouso (ex.: URL secreta da agenda iCal).
// AES-256-GCM. A chave vem de CALENDAR_ENC_KEY (qualquer string) e é derivada
// pra 32 bytes via SHA-256. Formato de saída: base64( iv(12) | tag(16) | ct ).

function getKey() {
  const secret = process.env.CALENDAR_ENC_KEY
  if (!secret) return null
  return crypto.createHash('sha256').update(String(secret)).digest()
}

// Lança se a env não estiver configurada — o chamador deve tratar (503).
export function isCryptoConfigured() {
  return Boolean(process.env.CALENDAR_ENC_KEY)
}

export function encrypt(plain) {
  const key = getKey()
  if (!key) throw new Error('CALENDAR_ENC_KEY não configurada.')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decrypt(blob) {
  const key = getKey()
  if (!key) throw new Error('CALENDAR_ENC_KEY não configurada.')
  const raw = Buffer.from(String(blob), 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ct = raw.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
