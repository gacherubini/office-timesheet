// Espelho de LABELS_SUGERIDOS em src/lib/personContacts.js. O banco aceita
// qualquer texto — o PDF pede lista pronta "com opção de digitar um
// personalizado" —, então isto é sugestão de UI, não validação.
// Mudou aqui, mude lá (mesmo acordo do web/src/lib/agentOpening.js).
export const LABELS = {
  phone: ['celular', 'WhatsApp', 'comercial', 'residencial', 'recado'],
  email: ['pessoal', 'comercial', 'financeiro / nota fiscal'],
  address: ['residencial', 'sede', 'obra', 'cobrança'],
}

export const PAPEIS_VINCULO = [
  { value: 'socio', label: 'Sócio' },
  { value: 'responsavel_tecnico', label: 'Responsável técnico' },
  { value: 'contato_principal', label: 'Contato principal' },
  { value: 'financeiro', label: 'Financeiro' },
]
