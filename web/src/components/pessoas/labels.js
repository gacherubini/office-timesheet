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

// Espelho de CAMPOS_RESTRINGIVEIS em src/lib/personVisibility.js — só os
// campos ESCALARES (linha de contato/endereço/anexo tem is_restricted
// própria, não entra aqui). Mudou lá, mude aqui.
//
// Usado para decidir se um <Input label="..."> pode ser renderizado: campo
// que o backend removeu da resposta (`campo in ficha` é falso) não pode
// aparecer nem com rótulo vazio — isso recriaria o aviso que o DELETE do
// backend eliminou (ver aplicarVisibilidade em personVisibility.js).
export const CAMPOS_RESTRINGIVEIS_FORM = [
  'cpf', 'rg', 'birth_date',
  'cnpj', 'inscricao_estadual', 'razao_social', 'founded_date',
  'bank_name', 'bank_agency', 'bank_account', 'bank_account_type', 'pix_key',
  'notes',
]

// Espelho de PADRAO_RESTRITO em src/lib/personVisibility.js. Usado só como
// estado inicial dos cadeados ao CRIAR um cliente/fornecedor novo (ainda sem
// ficha para consultar). Ao EDITAR, o formulário semeia os cadeados a partir
// de `restricted_fields`, devolvido pelo GET da ficha para admin — não usa
// mais este palpite (fix do buraco de visibilidade de 19/08/2026: o GET
// carregava a lista só para filtrar a resposta e a descartava).
export const PADRAO_RESTRITO = [
  'cpf', 'rg', 'cnpj',
  'bank_name', 'bank_agency', 'bank_account', 'bank_account_type', 'pix_key',
]
