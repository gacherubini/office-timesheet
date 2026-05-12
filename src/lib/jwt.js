import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET
if (!SECRET) throw new Error('JWT_SECRET não configurada.')

const EXPIRES_IN = '7d'

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    SECRET,
    { expiresIn: EXPIRES_IN, algorithm: 'HS256' },
  )
}

export function verifyAccessToken(token) {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] })
}
