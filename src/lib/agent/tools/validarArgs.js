// Valida os argumentos que o modelo mandou contra o schema que a tool declarou.
//
// Camada de defesa em profundidade contra injeção (§OWASP LLM01). O anexo é
// conteúdo de terceiro entrando num agente que tem 15 tools de escrita, e até
// agora a defesa era só o enquadramento no prompt mais a confirmação humana. A
// confirmação continua sendo o backstop determinístico; isto é a camada de
// cima: uma chamada sequestrada que tente carregar campo que a tool não declara
// (um `user_id` de outra pessoa, um filtro a mais) é recusada ANTES de rodar.
//
// Não é um validador de JSON Schema genérico de propósito. Cobre exatamente o
// que os schemas do catálogo usam — type, enum, required, additionalProperties
// e items — porque um validador parcial que se apresenta como completo é pior
// que um explícito sobre o próprio alcance. Se um schema novo usar algo daqui
// de fora, o teste do catálogo é onde isso aparece.

const CHECADORES = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
}

function tipoBate(esperado, valor) {
  const check = CHECADORES[esperado]
  // Tipo que não conhecemos não reprova — reprovar por ignorância nossa
  // travaria uma tool legítima.
  return check ? check(valor) : true
}

export function validarArgs(parameters, args) {
  if (!parameters || typeof parameters !== 'object') return { ok: true }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, erro: 'os argumentos precisam ser um objeto JSON.' }
  }

  const props = parameters.properties || {}
  const obrigatorios = parameters.required || []

  for (const nome of obrigatorios) {
    const v = args[nome]
    if (v === undefined || v === null || v === '') {
      return { ok: false, erro: `falta o argumento obrigatório "${nome}".` }
    }
  }

  if (parameters.additionalProperties === false) {
    const extras = Object.keys(args).filter((k) => !(k in props))
    if (extras.length) {
      return {
        ok: false,
        erro: `argumento não aceito por esta ferramenta: "${extras.join('", "')}". Válidos: ${Object.keys(props).join(', ') || 'nenhum'}.`,
      }
    }
  }

  for (const [nome, valor] of Object.entries(args)) {
    const regra = props[nome]
    if (!regra) continue
    // null/undefined em campo opcional é ausência declarada, não valor errado.
    if (valor === undefined || valor === null) continue

    if (regra.enum && !regra.enum.includes(valor)) {
      return { ok: false, erro: `"${nome}" só aceita: ${regra.enum.join(', ')}. Recebido: ${JSON.stringify(valor)}.` }
    }
    if (regra.type && !tipoBate(regra.type, valor)) {
      return { ok: false, erro: `"${nome}" era esperado como ${regra.type}, veio ${Array.isArray(valor) ? 'array' : typeof valor}.` }
    }
    // Itens de array só são checados quando o tipo é primitivo; item objeto é
    // assunto da própria tool, que conhece o formato dela.
    if (regra.type === 'array' && regra.items?.type && regra.items.type !== 'object') {
      const ruim = valor.find((item) => !tipoBate(regra.items.type, item))
      if (ruim !== undefined) {
        return { ok: false, erro: `"${nome}" deve conter só ${regra.items.type}. Item inválido: ${JSON.stringify(ruim)}.` }
      }
    }
  }

  return { ok: true }
}
