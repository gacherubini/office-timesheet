import { useRef, useState } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useClickOutside } from '../../hooks/useClickOutside'
import { agruparPorData, rotuloHora } from '../../lib/agentHistorico'

export function ListaConversas({ items, ativaId, onSelect, onRename, onDelete, disabled }) {
  const [menuId, setMenuId] = useState(null)
  const [editandoId, setEditandoId] = useState(null)
  const [tituloDraft, setTituloDraft] = useState('')
  const [apagarId, setApagarId] = useState(null)
  const menuRef = useRef(null)
  useClickOutside(menuRef, !!menuId, () => setMenuId(null))

  function comecarRename(item) {
    setEditandoId(item.id)
    setTituloDraft(item.title || '')
    setMenuId(null)
  }

  function confirmarRename(item) {
    const t = tituloDraft.trim()
    if (t && t !== item.title) onRename(item.id, t)
    setEditandoId(null)
  }

  const lista = items || []
  const grupos = agruparPorData(lista)
  const alvo = lista.find((i) => i.id === apagarId)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No celular o painel já traz o próprio cabeçalho — este é só do rail. */}
      <div className="hidden flex-none items-baseline justify-between border-b border-border-subtle px-4 py-3 md:flex">
        <span className="text-[13px] font-medium text-text-primary">Conversas</span>
        <span className="tabular-nums text-xs text-text-secondary">{lista.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {grupos.length === 0 && (
          <p className="px-2 py-6 text-center text-[13px] text-text-secondary">
            Suas conversas aparecem aqui.
          </p>
        )}

        {grupos.map((grupo) => (
          <section key={grupo.rotulo}>
            {/* Itálico serifado: a mesma ênfase editorial da saudação do assistente. */}
            <h3 className="font-serif-em px-2 pb-1.5 pt-3 text-[15px] leading-none text-text-secondary">
              {grupo.rotulo}
            </h3>
            <ul className="space-y-0.5">
              {grupo.items.map((item) => {
                const ativo = item.id === ativaId
                const editando = editandoId === item.id
                return (
                  <li key={item.id} className="relative">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-current={ativo ? 'true' : undefined}
                      className={`group relative flex cursor-pointer items-baseline gap-2.5 border px-3 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green ${
                        ativo
                          ? 'border-border-subtle bg-surface'
                          : 'border-transparent hover:border-border-subtle hover:bg-surface'
                      }`}
                      onClick={() => {
                        if (disabled || editando) return
                        onSelect(item.id)
                      }}
                      onKeyDown={(e) => {
                        if (editando || disabled) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelect(item.id)
                        }
                      }}
                    >
                      {/* Lombada: o único ponto saturado do rail marca onde você está. */}
                      {ativo && (
                        <span aria-hidden="true" className="absolute -bottom-px -left-px -top-px w-0.5 bg-green" />
                      )}

                      {editando ? (
                        <input
                          autoFocus
                          value={tituloDraft}
                          maxLength={80}
                          onChange={(e) => setTituloDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              confirmarRename(item)
                            }
                            if (e.key === 'Escape') setEditandoId(null)
                          }}
                          onBlur={() => confirmarRename(item)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Novo título da conversa"
                          className="form-control w-full border px-2 py-0.5 text-[13.5px] outline-none"
                        />
                      ) : (
                        <>
                          <span
                            className={`min-w-0 flex-1 truncate text-[13.5px] transition-colors ${
                              ativo ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'
                            }`}
                          >
                            {item.title}
                          </span>
                          {/* A hora cede o lugar aos três pontos no hover: as duas
                              coisas moram no mesmo canto, então o título nunca
                              precisa reservar espaço para as duas. */}
                          <span
                            className={`flex-none tabular-nums text-[11px] text-text-secondary transition-opacity md:group-hover:opacity-0 ${
                              menuId === item.id ? 'md:opacity-0' : ''
                            }`}
                          >
                            {rotuloHora(item.last_message_at)}
                          </span>
                        </>
                      )}

                      <button
                        type="button"
                        aria-label="Ações da conversa"
                        aria-haspopup="menu"
                        aria-expanded={menuId === item.id}
                        className={`absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center bg-surface text-text-secondary transition-opacity hover:text-text-primary focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 ${
                          menuId === item.id ? 'text-text-primary md:opacity-100' : ''
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuId(menuId === item.id ? null : item.id)
                        }}
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    </div>

                    {menuId === item.id && (
                      <div
                        ref={menuRef}
                        role="menu"
                        className="absolute right-1.5 top-[calc(50%+14px)] z-20 w-44 border border-border-subtle bg-surface py-1 shadow-[0_10px_30px_rgba(15,15,15,0.13)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green"
                          onClick={() => comecarRename(item)}
                        >
                          <Pencil size={14} />
                          Renomear
                        </button>
                        <div className="my-1 h-px bg-border-subtle" />
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-state-danger transition-colors hover:bg-state-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green"
                          onClick={() => { setMenuId(null); setApagarId(item.id) }}
                        >
                          <Trash2 size={14} />
                          Apagar
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <Modal
        open={!!apagarId}
        onClose={() => setApagarId(null)}
        title="Apagar conversa"
        footer={
          <>
            <Button variant="ghost" onClick={() => setApagarId(null)}>Voltar</Button>
            <Button
              variant="danger"
              onClick={() => {
                onDelete(apagarId)
                setApagarId(null)
              }}
            >
              Apagar
            </Button>
          </>
        }
      >
        <p className="text-text-secondary">Apagar esta conversa?</p>
        {alvo?.title && (
          <p className="mt-2 truncate text-sm text-text-primary">{alvo.title}</p>
        )}
      </Modal>
    </div>
  )
}
