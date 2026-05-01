import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { createUserClient, adminClient } from '../lib/supabase.js'

const router = Router()

function calculateDurationMinutes(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
}

function calculateCostSnapshot(durationMinutes, hourlyRate) {
  return Number(((durationMinutes / 60) * (Number(hourlyRate) || 0)).toFixed(2))
}

async function enrichChangeRequests(requests) {
  const rows = requests || []
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((request) => request.user_id).filter(Boolean))]
  const entryIds = [...new Set(rows.map((request) => request.time_entry_id).filter(Boolean))]
  const requestedProjectIds = [...new Set(rows.map((request) => request.requested_project_id).filter(Boolean))]

  const [
    { data: profiles, error: profilesError },
    { data: entries, error: entriesError },
    { data: requestedProjects, error: projectsError },
  ] = await Promise.all([
    userIds.length
      ? adminClient.from('profiles').select('id, name, email, position, avatar_url').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    entryIds.length
      ? adminClient
        .from('time_entries')
        .select('id, user_id, project_id, started_at, ended_at, duration_minutes, cost_snapshot, status, projects(name, client)')
        .in('id', entryIds)
      : Promise.resolve({ data: [], error: null }),
    requestedProjectIds.length
      ? adminClient.from('projects').select('id, name, client').in('id', requestedProjectIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const firstError = profilesError || entriesError || projectsError
  if (firstError) throw firstError

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))
  const entryMap = new Map((entries || []).map((entry) => [entry.id, entry]))
  const requestedProjectMap = new Map((requestedProjects || []).map((project) => [project.id, project]))

  return rows.map((request) => ({
    ...request,
    profile: profileMap.get(request.user_id) || null,
    time_entry: entryMap.get(request.time_entry_id) || null,
    requested_project: requestedProjectMap.get(request.requested_project_id) || null,
  }))
}

router.post('/time-entries/start', requireAuth, async (req, res) => {
  const { projectId } = req.body

  if (!projectId) {
    return res.status(400).json({ error: 'projectId é obrigatório.' })
  }

  const userClient = createUserClient(req.accessToken)
  const userId = req.profile.id

  const { data: project, error: projectError } = await userClient
    .from('projects')
    .select('id, status')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return res.status(404).json({ error: 'Projeto não encontrado.' })
  }

  if (project.status !== 'active') {
    return res.status(400).json({ error: 'Projeto não está ativo.' })
  }

  const { data: openEntry, error: openEntryError } = await userClient
    .from('time_entries')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['running', 'paused'])
    .maybeSingle()

  if (openEntryError) {
    return res.status(400).json({ error: openEntryError.message })
  }

  if (openEntry) {
    return res.status(409).json({ error: 'Já existe um apontamento aberto.' })
  }

  const { data, error } = await userClient
    .from('time_entries')
    .insert([
      {
        user_id: userId,
        project_id: projectId,
        started_at: new Date().toISOString(),
        status: 'running',
      },
    ])
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(201).json(data)
})

// ─── PAUSE ────────────────────────────────────────────────────────────
router.post('/time-entries/pause', requireAuth, async (req, res) => {
  const userClient = createUserClient(req.accessToken)
  const userId = req.profile.id

  // Busca apontamento running do usuário
  const { data: entry, error: entryError } = await userClient
    .from('time_entries')
    .select('id, status')
    .eq('user_id', userId)
    .eq('status', 'running')
    .maybeSingle()

  if (entryError) {
    return res.status(400).json({ error: entryError.message })
  }

  if (!entry) {
    return res.status(404).json({ error: 'Nenhum apontamento em andamento.' })
  }

  const now = new Date().toISOString()

  // Cria registro de pausa
  const { error: pauseError } = await userClient
    .from('time_entry_pauses')
    .insert([{ time_entry_id: entry.id, paused_at: now }])

  if (pauseError) {
    return res.status(400).json({ error: pauseError.message })
  }

  // Atualiza status do apontamento para paused
  const { data: updated, error: updateError } = await userClient
    .from('time_entries')
    .update({ status: 'paused' })
    .eq('id', entry.id)
    .select()
    .single()

  if (updateError) {
    return res.status(400).json({ error: updateError.message })
  }

  return res.json(updated)
})

// ─── RESUME ───────────────────────────────────────────────────────────
router.post('/time-entries/resume', requireAuth, async (req, res) => {
  const userClient = createUserClient(req.accessToken)
  const userId = req.profile.id

  // Busca apontamento pausado do usuário
  const { data: entry, error: entryError } = await userClient
    .from('time_entries')
    .select('id, status')
    .eq('user_id', userId)
    .eq('status', 'paused')
    .maybeSingle()

  if (entryError) {
    return res.status(400).json({ error: entryError.message })
  }

  if (!entry) {
    return res.status(404).json({ error: 'Nenhum apontamento pausado.' })
  }

  const now = new Date().toISOString()

  // Fecha a pausa aberta (a que não tem resumed_at)
  const { error: resumeError } = await userClient
    .from('time_entry_pauses')
    .update({ resumed_at: now })
    .eq('time_entry_id', entry.id)
    .is('resumed_at', null)

  if (resumeError) {
    return res.status(400).json({ error: resumeError.message })
  }

  // Volta status para running
  const { data: updated, error: updateError } = await userClient
    .from('time_entries')
    .update({ status: 'running' })
    .eq('id', entry.id)
    .select()
    .single()

  if (updateError) {
    return res.status(400).json({ error: updateError.message })
  }

  return res.json(updated)
})

// ─── STOP ─────────────────────────────────────────────────────────────
router.post('/time-entries/stop', requireAuth, async (req, res) => {
  const userClient = createUserClient(req.accessToken)
  const userId = req.profile.id

  // Busca apontamento aberto (running ou paused)
  const { data: entry, error: entryError } = await userClient
    .from('time_entries')
    .select('id, status, started_at')
    .eq('user_id', userId)
    .in('status', ['running', 'paused'])
    .maybeSingle()

  if (entryError) {
    return res.status(400).json({ error: entryError.message })
  }

  if (!entry) {
    return res.status(404).json({ error: 'Nenhum apontamento aberto.' })
  }

  const now = new Date()
  const nowISO = now.toISOString()

  // Se estava pausado, fecha a pausa aberta antes de encerrar
  if (entry.status === 'paused') {
    await userClient
      .from('time_entry_pauses')
      .update({ resumed_at: nowISO })
      .eq('time_entry_id', entry.id)
      .is('resumed_at', null)
  }

  // Busca todas as pausas desse apontamento para calcular tempo pausado
  const { data: pauses, error: pausesError } = await userClient
    .from('time_entry_pauses')
    .select('paused_at, resumed_at')
    .eq('time_entry_id', entry.id)

  if (pausesError) {
    return res.status(400).json({ error: pausesError.message })
  }

  // Calcula total de milissegundos pausados
  let totalPausedMs = 0
  for (const pause of pauses || []) {
    const pausedAt = new Date(pause.paused_at)
    const resumedAt = new Date(pause.resumed_at) // já foi fechada acima se necessário
    totalPausedMs += resumedAt.getTime() - pausedAt.getTime()
  }

  // Duração total = (now - started_at) - pausas
  const startedAt = new Date(entry.started_at)
  const totalMs = now.getTime() - startedAt.getTime()
  const workedMs = totalMs - totalPausedMs
  const durationMinutes = Math.max(0, Math.round(workedMs / 60000))

  // Busca hourly_rate via adminClient (colaborador não tem acesso a esse campo pelo RLS)
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('hourly_rate')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    return res.status(400).json({ error: 'Perfil não encontrado para cálculo de custo.' })
  }

  // cost_snapshot = (durationMinutes / 60) * hourly_rate
  const hourlyRate = Number(profile.hourly_rate) || 0
  const costSnapshot = Number(((durationMinutes / 60) * hourlyRate).toFixed(2))

  // Atualiza o apontamento com todos os dados finais
  const { data: updated, error: updateError } = await userClient
    .from('time_entries')
    .update({
      status: 'completed',
      ended_at: nowISO,
      duration_minutes: durationMinutes,
      cost_snapshot: costSnapshot,
    })
    .eq('id', entry.id)
    .select()
    .single()

  if (updateError) {
    return res.status(400).json({ error: updateError.message })
  }

  return res.json(updated)
})

// ═══════════════════════════════════════════════════════════════════════
// ROTAS ADMIN — Ajuste manual de horas
// ═══════════════════════════════════════════════════════════════════════

// ─── ADMIN: SOLICITAÇÕES DE ALTERAÇÃO DE PONTO ───────────────────────
router.get('/admin/time-entry-change-requests', requireAuth, requireAdmin, async (req, res) => {
  const status = req.query.status || 'pending'

  let query = adminClient
    .from('time_entry_change_requests')
    .select('id, time_entry_id, user_id, requested_project_id, requested_started_at, requested_ended_at, reason, status, admin_note, decided_by, decided_at, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  try {
    const enriched = await enrichChangeRequests(data || [])
    return res.json(enriched)
  } catch (err) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/admin/time-entry-change-requests/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const adminNote = req.body?.admin_note?.trim() || null

  const { data: request, error: requestError } = await adminClient
    .from('time_entry_change_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (requestError || !request) {
    return res.status(404).json({ error: 'Solicitação não encontrada.' })
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Esta solicitação já foi decidida.' })
  }

  const requestedStart = new Date(request.requested_started_at)
  const requestedEnd = new Date(request.requested_ended_at)

  if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
    return res.status(400).json({ error: 'Datas solicitadas inválidas.' })
  }

  if (requestedEnd <= requestedStart) {
    return res.status(400).json({ error: 'A saída solicitada deve ser posterior ao início.' })
  }

  const { data: entry, error: entryError } = await adminClient
    .from('time_entries')
    .select('id, user_id')
    .eq('id', request.time_entry_id)
    .eq('user_id', request.user_id)
    .single()

  if (entryError || !entry) {
    return res.status(404).json({ error: 'Apontamento vinculado não encontrado.' })
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('hourly_rate')
    .eq('id', request.user_id)
    .single()

  if (profileError || !profile) {
    return res.status(404).json({ error: 'Colaborador não encontrado.' })
  }

  const durationMinutes = calculateDurationMinutes(requestedStart, requestedEnd)
  const costSnapshot = calculateCostSnapshot(durationMinutes, profile.hourly_rate)
  const decidedAt = new Date().toISOString()

  const { error: updateEntryError } = await adminClient
    .from('time_entries')
    .update({
      project_id: request.requested_project_id,
      started_at: requestedStart.toISOString(),
      ended_at: requestedEnd.toISOString(),
      duration_minutes: durationMinutes,
      cost_snapshot: costSnapshot,
      status: 'completed',
      edited_by: req.profile.id,
      edited_at: decidedAt,
    })
    .eq('id', request.time_entry_id)

  if (updateEntryError) {
    return res.status(400).json({ error: updateEntryError.message })
  }

  const { data, error } = await adminClient
    .from('time_entry_change_requests')
    .update({
      status: 'approved',
      admin_note: adminNote,
      decided_by: req.profile.id,
      decided_at: decidedAt,
      updated_at: decidedAt,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json(data)
})

router.post('/admin/time-entry-change-requests/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const adminNote = req.body?.admin_note?.trim() || null
  const decidedAt = new Date().toISOString()

  const { data, error } = await adminClient
    .from('time_entry_change_requests')
    .update({
      status: 'rejected',
      admin_note: adminNote,
      decided_by: req.profile.id,
      decided_at: decidedAt,
      updated_at: decidedAt,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Solicitação pendente não encontrada.' })
  }

  return res.json(data)
})

// ─── ADMIN: CRIAR APONTAMENTO MANUAL ──────────────────────────────────
router.post('/admin/time-entries', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, project_id, started_at, ended_at } = req.body

  if (!user_id || !project_id || !started_at || !ended_at) {
    return res.status(400).json({
      error: 'user_id, project_id, started_at e ended_at são obrigatórios.',
    })
  }

  const start = new Date(started_at)
  const end = new Date(ended_at)

  if (end <= start) {
    return res.status(400).json({ error: 'ended_at deve ser posterior a started_at.' })
  }

  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000)

  // Busca hourly_rate do colaborador
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('hourly_rate')
    .eq('id', user_id)
    .single()

  if (profileError || !profile) {
    return res.status(404).json({ error: 'Colaborador não encontrado.' })
  }

  const hourlyRate = Number(profile.hourly_rate) || 0
  const costSnapshot = Number(((durationMinutes / 60) * hourlyRate).toFixed(2))

  const { data, error } = await adminClient
    .from('time_entries')
    .insert([{
      user_id,
      project_id,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      status: 'completed',
      duration_minutes: durationMinutes,
      cost_snapshot: costSnapshot,
      created_by_admin: true,
      edited_by: req.profile.id,
    }])
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(201).json(data)
})

// ─── ADMIN: EDITAR APONTAMENTO ────────────────────────────────────────
router.put('/admin/time-entries/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params
  const { started_at, ended_at, project_id } = req.body

  // Busca o apontamento atual
  const { data: entry, error: entryError } = await adminClient
    .from('time_entries')
    .select('*')
    .eq('id', id)
    .single()

  if (entryError || !entry) {
    return res.status(404).json({ error: 'Apontamento não encontrado.' })
  }

  const newStart = started_at ? new Date(started_at) : new Date(entry.started_at)
  const newEnd = ended_at ? new Date(ended_at) : (entry.ended_at ? new Date(entry.ended_at) : null)
  const newProjectId = project_id || entry.project_id

  if (newEnd && newEnd <= newStart) {
    return res.status(400).json({ error: 'ended_at deve ser posterior a started_at.' })
  }

  const updates = {
    project_id: newProjectId,
    started_at: newStart.toISOString(),
    edited_by: req.profile.id,
    edited_at: new Date().toISOString(),
  }

  // Recalcula duração e custo se o apontamento está completed
  if (newEnd) {
    updates.ended_at = newEnd.toISOString()
    const durationMinutes = Math.round((newEnd.getTime() - newStart.getTime()) / 60000)
    updates.duration_minutes = durationMinutes

    // Busca hourly_rate do dono do apontamento
    const { data: profile } = await adminClient
      .from('profiles')
      .select('hourly_rate')
      .eq('id', entry.user_id)
      .single()

    const hourlyRate = Number(profile?.hourly_rate) || 0
    updates.cost_snapshot = Number(((durationMinutes / 60) * hourlyRate).toFixed(2))
  }

  const { data, error } = await adminClient
    .from('time_entries')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json(data)
})

// ─── ADMIN: EXCLUIR APONTAMENTO ──────────────────────────────────────
router.delete('/admin/time-entries/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params

  // Exclui pausas vinculadas primeiro
  await adminClient
    .from('time_entry_pauses')
    .delete()
    .eq('time_entry_id', id)

  const { error } = await adminClient
    .from('time_entries')
    .delete()
    .eq('id', id)

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.json({ message: 'Apontamento excluído com sucesso.' })
})

// ─── ADMIN: PAINEL LIVE ──────────────────────────────────────────────
router.get('/admin/live', requireAuth, requireAdmin, async (req, res) => {
  // Busca todos os colaboradores ativos
  const { data: profiles, error: profilesError } = await adminClient
    .from('profiles')
    .select('id, name, email')
    .eq('is_active', true)
    .order('name')

  if (profilesError) {
    return res.status(400).json({ error: profilesError.message })
  }

  // Busca todos os apontamentos abertos (running ou paused)
  const { data: openEntries, error: entriesError } = await adminClient
    .from('time_entries')
    .select('id, user_id, status, started_at, projects(name)')
    .in('status', ['running', 'paused'])

  if (entriesError) {
    return res.status(400).json({ error: entriesError.message })
  }

  // Monta mapa de userId -> entry aberta
  const entryMap = {}
  for (const entry of openEntries || []) {
    entryMap[entry.user_id] = entry
  }

  // Monta resposta com status de cada colaborador
  const team = profiles.map((profile) => {
    const entry = entryMap[profile.id]

    if (!entry) {
      return { ...profile, status: 'offline', project: null, started_at: null }
    }

    return {
      ...profile,
      status: entry.status, // 'running' ou 'paused'
      project: entry.projects?.name || null,
      started_at: entry.started_at,
    }
  })

  return res.json(team)
})

// ─── ADMIN: LISTAR APONTAMENTOS COM FILTROS ──────────────────────────
router.get('/admin/time-entries', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, project_id, start_date, end_date } = req.query

  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30))
  const offset = (page - 1) * limit
  const startIso = start_date ? new Date(`${start_date}T00:00:00`).toISOString() : null
  const endIso = end_date ? new Date(`${end_date}T23:59:59`).toISOString() : null

  let query = adminClient
    .from('time_entries')
    .select('*, profiles!time_entries_user_id_fkey(name, email, position), projects(name, client)', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (user_id) query = query.eq('user_id', user_id)
  if (project_id) query = query.eq('project_id', project_id)
  if (startIso) query = query.gte('started_at', startIso)
  if (endIso) query = query.lte('started_at', endIso)

  const { data, error, count } = await query

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  const entryIds = (data || []).map((entry) => entry.id)
  let pausesByEntry = {}

  if (entryIds.length > 0) {
    const { data: pauses, error: pausesError } = await adminClient
      .from('time_entry_pauses')
      .select('id, time_entry_id, paused_at, resumed_at')
      .in('time_entry_id', entryIds)
      .order('paused_at', { ascending: true })

    if (pausesError) {
      return res.status(400).json({ error: pausesError.message })
    }

    pausesByEntry = (pauses || []).reduce((acc, pause) => {
      if (!acc[pause.time_entry_id]) acc[pause.time_entry_id] = []
      acc[pause.time_entry_id].push(pause)
      return acc
    }, {})
  }

  let summaryQuery = adminClient
    .from('time_entries')
    .select('id, user_id, started_at, duration_minutes, cost_snapshot')

  if (user_id) summaryQuery = summaryQuery.eq('user_id', user_id)
  if (project_id) summaryQuery = summaryQuery.eq('project_id', project_id)
  if (startIso) summaryQuery = summaryQuery.gte('started_at', startIso)
  if (endIso) summaryQuery = summaryQuery.lte('started_at', endIso)

  const { data: summaryEntries, error: summaryError } = await summaryQuery

  if (summaryError) {
    return res.status(400).json({ error: summaryError.message })
  }

  let approvedExpenses = []
  let bonusList = []

  if (!project_id) {
    let expensesQuery = adminClient
      .from('expense_requests')
      .select('id, user_id, title, description, amount, expense_date, receipt_url, status, created_at')
      .in('status', ['pending', 'approved'])
      .order('expense_date', { ascending: false })

    if (user_id) expensesQuery = expensesQuery.eq('user_id', user_id)
    if (start_date) expensesQuery = expensesQuery.gte('expense_date', start_date)
    if (end_date) expensesQuery = expensesQuery.lte('expense_date', end_date)

    let bonusesQuery = adminClient
      .from('bonuses')
      .select('id, user_id, title, description, amount, bonus_date, created_at')
      .order('bonus_date', { ascending: false })

    if (user_id) bonusesQuery = bonusesQuery.eq('user_id', user_id)
    if (start_date) bonusesQuery = bonusesQuery.gte('bonus_date', start_date)
    if (end_date) bonusesQuery = bonusesQuery.lte('bonus_date', end_date)

    const [
      { data: expenses, error: expensesError },
      { data: bonuses, error: bonusesError },
    ] = await Promise.all([expensesQuery, bonusesQuery])

    if (expensesError) return res.status(400).json({ error: expensesError.message })
    if (bonusesError) return res.status(400).json({ error: bonusesError.message })

    approvedExpenses = expenses || []
    bonusList = bonuses || []

    const profileIds = [
      ...new Set([
        ...approvedExpenses.map((e) => e.user_id),
        ...bonusList.map((b) => b.user_id),
      ].filter(Boolean)),
    ]

    if (profileIds.length > 0) {
      const { data: relatedProfiles, error: profilesError } = await adminClient
        .from('profiles')
        .select('id, name, email, position, avatar_url')
        .in('id', profileIds)

      if (profilesError) {
        return res.status(400).json({ error: profilesError.message })
      }

      const profileMap = new Map((relatedProfiles || []).map((p) => [p.id, p]))
      approvedExpenses = approvedExpenses.map((expense) => ({
        ...expense,
        profile: profileMap.get(expense.user_id) || null,
      }))
      bonusList = bonusList.map((bonus) => ({
        ...bonus,
        profile: profileMap.get(bonus.user_id) || null,
      }))
    }
  }

  const dailyTotalsMap = {}
  let totalMinutes = 0
  let totalCost = 0

  for (const entry of summaryEntries || []) {
    const minutes = entry.duration_minutes || 0
    const cost = Number(entry.cost_snapshot) || 0
    const date = entry.started_at?.slice(0, 10)
    const key = `${entry.user_id}:${date}`

    totalMinutes += minutes
    totalCost += cost
    dailyTotalsMap[key] = (dailyTotalsMap[key] || 0) + minutes
  }

  const workingDays = Object.keys(dailyTotalsMap).length
  const averageMinutesPerDay = workingDays > 0 ? Math.round(totalMinutes / workingDays) : 0
  const reimbursements = approvedExpenses.reduce((sum, expense) => (
    sum + (expense.status === 'approved' ? (Number(expense.amount) || 0) : 0)
  ), 0)
  const bonuses = bonusList.reduce((sum, bonus) => sum + (Number(bonus.amount) || 0), 0)
  const netTotal = totalCost + reimbursements + bonuses

  return res.json({
    data: (data || []).map((entry) => ({
      ...entry,
      pauses: pausesByEntry[entry.id] || [],
    })),
    summary: {
      total_minutes: totalMinutes,
      total_cost: Number(totalCost.toFixed(2)),
      average_minutes_per_day: averageMinutesPerDay,
      working_days: workingDays,
      reimbursements: Number(reimbursements.toFixed(2)),
      bonuses: Number(bonuses.toFixed(2)),
      net_total: Number(netTotal.toFixed(2)),
      daily_totals: Object.entries(dailyTotalsMap).map(([key, minutes]) => {
        const [userId, date] = key.split(':')
        return { user_id: userId, date, minutes }
      }),
    },
    expenses: approvedExpenses,
    bonuses: bonusList,
    pagination: {
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit),
    },
  })
})

export default router
