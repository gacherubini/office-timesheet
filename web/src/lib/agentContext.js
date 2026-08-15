// Último projeto/tarefa visitado — carimbo da aba (sessionStorage).
// O compositor lê uma vez no mount; dismiss grava a flag no mesmo JSON
// para sobreviver ao remount de /assistente. Nova conversa não apaga.

const CHAVE = 'assistente:contexto'

function storage() {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function lerBruto() {
  const st = storage()
  if (!st) return null
  try {
    const raw = st.getItem(CHAVE)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function carimbarContexto({ projectId, projectName, taskId, taskTitle, taskCount } = {}) {
  const st = storage()
  if (!st) return
  try {
    st.setItem(CHAVE, JSON.stringify({
      projectId: projectId ?? null,
      projectName: projectName ?? null,
      taskId: taskId ?? null,
      taskTitle: taskTitle ?? null,
      taskCount: taskCount ?? null,
    }))
  } catch {
    /* quota/serialização: degrada sem quebrar a UI */
  }
}

export function lerContexto() {
  const obj = lerBruto()
  if (!obj || obj.dismissed === true) return null
  return obj
}

export function dispensarContexto() {
  const st = storage()
  if (!st) return
  const atual = lerBruto()
  if (!atual) return
  try {
    st.setItem(CHAVE, JSON.stringify({ ...atual, dismissed: true }))
  } catch {
    /* ignora */
  }
}

export function limparContexto() {
  const st = storage()
  if (!st) return
  try {
    st.removeItem(CHAVE)
  } catch {
    /* ignora */
  }
}
