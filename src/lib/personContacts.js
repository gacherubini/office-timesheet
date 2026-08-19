// Regra de contato múltiplo num lugar só. Vale para cliente e fornecedor, para
// telefone, e-mail e endereço — seis combinações. Se cada rota implementasse a
// sua, elas divergiriam, e "principal" é justamente o que a listagem mostra.
//
// Função PURA, sem banco: testável isolada, mesmo precedente de lib/birthdays.js
// e lib/performanceSimulation.js.

// Sugestões do item 2 do PDF de 18/08/2026. O banco aceita qualquer texto — o
// PDF pede lista pronta "com opção de digitar um personalizado" —, então isto é
// sugestão, não validação.
export const LABELS_SUGERIDOS = {
  phone: ['celular', 'WhatsApp', 'comercial', 'residencial', 'recado'],
  email: ['pessoal', 'comercial', 'financeiro / nota fiscal'],
  address: ['residencial', 'sede', 'obra', 'cobrança'],
}

const NOME_DO_TIPO = {
  phone: { singular: 'telefone', artigo: 'um telefone' },
  email: { singular: 'e-mail', artigo: 'um e-mail' },
  address: { singular: 'endereço', artigo: 'um endereço' },
}

const CAMPOS_ENDERECO = ['cep', 'street', 'number', 'complement', 'district', 'city', 'uf']

function texto(v) {
  if (v === undefined || v === null) return null
  const t = String(v).trim()
  return t || null
}

export function normalizarContatos(lista, { tipo }) {
  const nome = NOME_DO_TIPO[tipo]
  if (!nome) return { error: `Tipo de contato desconhecido: ${tipo}.` }

  const entrada = Array.isArray(lista) ? lista : []
  if (entrada.length === 0) return { itens: [] }

  const itens = []
  for (const bruto of entrada) {
    const label = texto(bruto?.label)
    if (!label) return { error: `Todo ${nome.singular} precisa de um rótulo.` }

    if (tipo === 'address') {
      const campos = {}
      let algum = false
      for (const c of CAMPOS_ENDERECO) {
        campos[c] = texto(bruto?.[c])
        if (campos[c]) algum = true
      }
      // Rótulo sem nenhum campo é uma linha que não diz nada.
      if (!algum) return { error: `Endereço "${label}" está vazio.` }
      // id e is_restricted viajam intactos (undefined incluso): quem decide o
      // que fazer com eles é a rota, que tem o perfil de quem chamou e o
      // estado atual do banco — esta função é pura, sem banco (ver o
      // comentário do topo do arquivo).
      itens.push({
        label, ...campos, is_primary: Boolean(bruto?.is_primary), position: itens.length,
        id: bruto?.id ?? null, is_restricted: bruto?.is_restricted,
      })
    } else {
      const value = texto(bruto?.value)
      if (!value) return { error: `O ${nome.singular} "${label}" está vazio.` }
      itens.push({
        label, value, is_primary: Boolean(bruto?.is_primary), position: itens.length,
        id: bruto?.id ?? null, is_restricted: bruto?.is_restricted,
      })
    }
  }

  const principais = itens.filter((i) => i.is_primary)
  if (principais.length > 1) {
    return { error: `Marque apenas ${nome.artigo} como principal.` }
  }
  // Ninguém marcou: promove o primeiro. A listagem precisa de um principal, e
  // fazer o usuário escolher quando só existe uma opção óbvia é atrito à toa.
  if (principais.length === 0) itens[0].is_primary = true

  return { itens }
}
