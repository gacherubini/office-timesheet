import { authClient, adminClient } from '../lib/supabase.js'

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token ausente.' })
    }

    const accessToken = authHeader.replace('Bearer ', '').trim()

    const { data, error } = await authClient.auth.getUser(accessToken)

    if (error || !data?.user) {
      return res.status(401).json({ error: 'Token inválido.' })
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, name, email, role, is_active, deleted_at, position, birth_date, phone, avatar_url')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile) {
      return res.status(403).json({ error: 'Perfil não encontrado.' })
    }

    if (profile.deleted_at) {
      return res.status(403).json({ error: 'Usuário deletado.' })
    }

    if (!profile.is_active) {
      return res.status(403).json({ error: 'Usuário inativo.' })
    }

    req.accessToken = accessToken
    req.authUser = data.user
    req.profile = profile

    next()
  } catch (err) {
    return res.status(500).json({ error: 'Erro interno na autenticação.' })
  }
}
