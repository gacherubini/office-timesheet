import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Select } from '../../components/ui/Input'

// Papéis aceitos pelo backend (PAPEIS_CLIENTE em src/routes/clients.js).
const PAPEIS_CLIENTE = [
  { value: 'contratante_principal', label: 'Contratante principal' },
  { value: 'contratante', label: 'Contratante' },
  { value: 'investidor', label: 'Investidor' },
  { value: 'representante', label: 'Representante' },
]

const PAPEL_PRINCIPAL = 'contratante_principal'

// Dito no hover do papel travado. Fala do MOTIVO ("é o único"), não da
// mecânica ("campo desabilitado") — quem passa o mouse quer saber por que não
// pode, não o que aconteceu com o controle.
const MOTIVO_PAPEL_TRAVADO =
  'Com um contratante só, ele é o principal — é o nome dele que aparece no card. Acrescente outro contratante para poder mudar o papel.'

// Papel e "principal" são a MESMA pergunta desde a fusão dos dois controles:
// quem tem `contratante_principal` É o principal. A linha tinha um rádio de
// principal ao lado de um Select cuja primeira opção era "Contratante
// principal" — duas maneiras de responder a mesma coisa, e o dono do produto
// marcou vários rádios achando que era assim que se escolhem vários
// contratantes.
//
// `is_primary` continua no objeto porque é o que o servidor grava (e o que o
// UNIQUE INDEX do banco protege), mas aqui ela nunca é escolhida: é derivada.
function comPrincipalDerivado(item) {
  return { ...item, is_primary: item.role === PAPEL_PRINCIPAL }
}

// Lista repetível de contratantes do projeto (item 7 do PDF: "cadastro um
// projeto com dois contratantes; ambos aparecem no projeto e o projeto
// aparece na ficha dos dois"). Componente controlado, mesmo contrato dos
// campos de web/src/components/pessoas/ (`{ itens, onChange }`): não guarda
// estado próprio, só devolve a lista nova.
//
// O seletor de cliente é sobre o cadastro existente — nunca texto livre,
// mesma regra do PersonLinksField — para não duplicar cliente por digitação.
export function ProjectClientsField({ itens = [], onChange, readOnly = false }) {
  // Com uma linha só não existe escolha de papel a fazer: ela é a principal por
  // definição, e o projeto precisa de um nome no card. `alterarPapel` mantém a
  // guarda para esse caso mesmo assim — ela é a invariante do componente, não
  // um detalhe da tela, e sobrevive a alguém destravar isto aqui um dia.
  const papelTravado = itens.length === 1
  const [opcoes, setOpcoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setErro('')
    api
      .get('/admin/clients')
      .then((rows) => {
        if (!cancelado) setOpcoes(rows || [])
      })
      .catch((err) => {
        if (!cancelado) setErro(err.message || 'Não foi possível carregar os clientes.')
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  function adicionar() {
    onChange([
      ...itens,
      // A primeira linha nasce principal: o projeto precisa de um e, com uma
      // opção só, fazer o usuário escolher é atrito à toa (mesma regra do
      // ContactListField).
      comPrincipalDerivado({
        client_id: '',
        role: itens.length === 0 ? PAPEL_PRINCIPAL : 'contratante',
      }),
    ])
  }

  function alterar(indice, campo, valor) {
    onChange(itens.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)))
  }

  // O papel é o ÚNICO controle do principal, então é aqui que a invariante
  // "exatamente um contratante_principal" é mantida.
  function alterarPapel(indice, papel) {
    let proximos = itens.map((it, i) => (i === indice ? { ...it, role: papel } : it))

    if (papel === PAPEL_PRINCIPAL) {
      // Eleger um REBAIXA quem era. Antes o rádio fazia isso sozinho, e como o
      // Select ao lado continuava dizendo "Contratante principal" na outra
      // linha, a tela mostrava dois principais ao mesmo tempo.
      proximos = proximos.map((it, i) =>
        i !== indice && it.role === PAPEL_PRINCIPAL ? { ...it, role: 'contratante' } : it,
      )
    } else if (!proximos.some((it) => it.role === PAPEL_PRINCIPAL)) {
      // Rebaixou o único principal: alguém precisa assumir na hora. Deixar o
      // projeto sem principal faria o servidor promover outro pelas costas do
      // usuário — o principal "pulando" de linha depois de salvar.
      const substituto = proximos.findIndex((_, i) => i !== indice)
      if (substituto === -1) {
        // Contratante único: ele é o principal por definição, então a troca
        // não pega. Aceitar aqui só adiaria a correção para o salvamento.
        proximos[indice] = { ...proximos[indice], role: PAPEL_PRINCIPAL }
      } else {
        proximos[substituto] = { ...proximos[substituto], role: PAPEL_PRINCIPAL }
      }
    }

    onChange(proximos.map(comPrincipalDerivado))
  }

  function remover(indice) {
    const restantes = itens.filter((_, i) => i !== indice)
    // Se o principal saiu, promove o primeiro que sobrou — PAPEL e is_primary
    // juntos, senão a linha promovida voltaria da tela com "Contratante" no
    // seletor e principal no banco (o servidor faria essa promoção de qualquer
    // forma; fazer aqui é o que impede o principal de pular de linha sozinho).
    if (restantes.length > 0 && !restantes.some((r) => r.role === PAPEL_PRINCIPAL)) {
      restantes[0] = { ...restantes[0], role: PAPEL_PRINCIPAL }
    }
    onChange(restantes.map(comPrincipalDerivado))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-text-secondary">Contratantes</label>
        {!readOnly && (
          <button
            type="button"
            onClick={adicionar}
            aria-label="Adicionar contratante"
            disabled={carregando}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
          >
            <Plus size={12} /> Adicionar contratante
          </button>
        )}
      </div>

      {/* A regra escrita, não só implícita no controle: o dono do produto
          tentou marcar vários principais justamente porque a tela nunca disse
          o que "principal" significa nem que ele é um só. */}
      <p className="text-[11px] text-text-secondary mb-2">
        Só um contratante pode ser o principal: é o nome dele que aparece no card e no cabeçalho
        do projeto.
      </p>

      {erro && <p className="text-[11px] state-attention mb-1.5">{erro}</p>}

      {itens.length === 0 && (
        <p className="text-[11px] text-text-secondary">Nenhum contratante adicionado.</p>
      )}

      <div className="space-y-2">
        {itens.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              aria-label="Cliente"
              value={it.client_id || ''}
              onChange={(e) => alterar(i, 'client_id', e.target.value)}
              disabled={readOnly || carregando}
              className="flex-1"
            >
              <option value="">Selecione o cliente...</option>
              {opcoes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            {/* O title vive AQUI, no wrapper, e não no Select: navegador não
                dispara evento de ponteiro em elemento desabilitado, então
                tooltip posto no próprio controle travado nunca apareceria.
                w-52 e não w-44: o Select do projeto gasta mais largura interna
                que o <select> nativo (padding + chevron), e "Contratante
                principal" passou a truncar quando a troca foi feita. */}
            <span
              className="w-52 flex-none"
              title={papelTravado ? MOTIVO_PAPEL_TRAVADO : undefined}
            >
              <Select
                aria-label="Papel"
                value={it.role || 'contratante'}
                onChange={(e) => alterarPapel(i, e.target.value)}
                // Travado no contratante único: ele é o principal por definição.
                // Antes a tela DEIXAVA escolher e desfazia sozinha, o que parece
                // defeito — dizer a regra antes é melhor que corrigir depois.
                disabled={readOnly || papelTravado}
                className="w-full"
              >
                {PAPEIS_CLIENTE.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => remover(i)}
                aria-label="Remover contratante"
                className="p-1 text-text-secondary hover:state-danger"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export { PAPEIS_CLIENTE }
