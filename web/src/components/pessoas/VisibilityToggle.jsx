import { Lock, Unlock } from 'lucide-react'

// Cadeado ao lado de cada campo sensível e de cada anexo (item 6 do PDF).
//
// Quem não pode mudar NÃO VÊ o controle: mostrar um cadeado desabilitado para o
// colaborador anunciaria que existe algo escondido ali — e o PDF é explícito
// que o campo restrito não pode aparecer "nem mascarado, nem com aviso".
export function VisibilityToggle({ restrito, onChange, podeEditar }) {
  if (!podeEditar) return null
  const Icone = restrito ? Lock : Unlock
  return (
    <button
      type="button"
      onClick={() => onChange(!restrito)}
      aria-label={restrito ? 'Restrito ao admin — clique para liberar' : 'Visível para a equipe — clique para restringir'}
      title={restrito ? 'Restrito ao admin' : 'Visível para a equipe'}
      className={`p-1 ${restrito ? 'state-attention' : 'text-text-secondary'}`}
    >
      <Icone size={13} />
    </button>
  )
}
