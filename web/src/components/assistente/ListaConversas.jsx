import { useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MoreHorizontal } from 'lucide-react'
import { Card } from '../ui/Card'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useClickOutside } from '../../hooks/useClickOutside'

function dataRelativa(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
}

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

  const alvo = (items || []).find((i) => i.id === apagarId)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {(items || []).map((item) => {
          const ativo = item.id === ativaId
          return (
            <li key={item.id}>
              <Card
                padded={false}
                className={`group relative cursor-pointer px-3 py-2 ${ativo ? 'bg-surface-alt' : 'hover:bg-surface-alt'}`}
                onClick={() => {
                  if (disabled || editandoId === item.id) return
                  onSelect(item.id)
                }}
              >
                {editandoId === item.id ? (
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
                    className="form-control w-full border px-2 py-1 text-sm outline-none"
                  />
                ) : (
                  <p className="truncate text-sm text-text-primary">{item.title}</p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wider text-text-secondary">
                  {dataRelativa(item.last_message_at)}
                </p>
                <button
                  type="button"
                  aria-label="Ações da conversa"
                  className="absolute right-1 top-1 rounded p-1 text-text-secondary hover:bg-surface md:opacity-0 md:group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuId(menuId === item.id ? null : item.id)
                  }}
                >
                  <MoreHorizontal size={14} />
                </button>
                {menuId === item.id && (
                  <div
                    ref={menuRef}
                    className="absolute right-1 top-7 z-10 border border-border-subtle bg-surface text-sm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left hover:bg-surface-alt"
                      onClick={() => comecarRename(item)}
                    >
                      Renomear
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left hover:bg-surface-alt"
                      onClick={() => { setMenuId(null); setApagarId(item.id) }}
                    >
                      Apagar
                    </button>
                  </div>
                )}
              </Card>
            </li>
          )
        })}
      </ul>

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
