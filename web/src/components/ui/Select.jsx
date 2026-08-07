import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

const TRIGGER_BASE_CLASS =
  'w-full form-control border outline-none transition-colors ' +
  'disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-between gap-2 text-left'

// Mesma convenção do Button.jsx: mapa de tamanhos, padrão inalterado ('md').
// 'sm' entrega h-8 (a faixa de controle padrão do sistema) com padding e
// texto proporcionais.
const SIZES = {
  sm: 'h-8 px-3 py-0 text-[12px]',
  md: 'px-3 py-2 text-sm',
}

// Extrai o texto de um filho React (string, número, array ou <option>{...}</option>).
function nodeText(node) {
  if (node == null || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isValidElement(node)) return nodeText(node.props.children)
  return ''
}

// Converte <option>/<optgroup> filhos na lista de opções que o dropdown renderiza.
function parseOptions(children) {
  const options = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === 'option') {
      options.push({
        value: child.props.value ?? '',
        label: nodeText(child.props.children),
        disabled: !!child.props.disabled,
      })
    } else if (child.type === 'optgroup') {
      const group = nodeText(child.props.label)
      Children.forEach(child.props.children, (opt) => {
        if (isValidElement(opt) && opt.type === 'option') {
          options.push({
            value: opt.props.value ?? '',
            label: nodeText(opt.props.children),
            disabled: !!opt.props.disabled,
            group,
          })
        }
      })
    }
  })
  return options
}

/**
 * Select estilizado com a identidade do projeto (mesma linguagem do calendário).
 * Mantém a API do <select> nativo: recebe <option> como filhos e dispara
 * onChange({ target: { name, value } }). Um <select> nativo oculto acompanha o
 * valor para preservar validação de `required` e acessibilidade.
 */
export function Select({
  label,
  error,
  value,
  onChange,
  children,
  className = '',
  disabled = false,
  required = false,
  name,
  id,
  placeholder,
  size = 'md',
}) {
  const options = useMemo(() => parseOptions(children), [children])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [coords, setCoords] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  const currentValue = value ?? ''
  const selected = options.find((o) => String(o.value) === String(currentValue))
  const displayLabel = selected ? selected.label : placeholder || ''
  const showPlaceholder = !selected || selected.value === '' || selected.label === ''

  const commit = useCallback(
    (val) => {
      onChange?.({ target: { name, value: val } })
      setOpen(false)
      triggerRef.current?.focus()
    },
    [onChange, name],
  )

  const position = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vh = window.innerHeight
    const spaceBelow = vh - r.bottom
    const spaceAbove = r.top
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow
    const maxHeight = Math.max(140, Math.min(288, (openUp ? spaceAbove : spaceBelow) - 12))
    setCoords({
      left: r.left,
      width: r.width,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? vh - r.top + 4 : undefined,
      maxHeight,
    })
  }, [])

  useLayoutEffect(() => {
    if (open) position()
  }, [open, position])

  useEffect(() => {
    if (!open) return
    const onScroll = (e) => {
      if (panelRef.current?.contains(e.target)) return
      position()
    }
    const onResize = () => position()
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, position])

  // Ao abrir, foca a opção selecionada (ou a primeira habilitada).
  useEffect(() => {
    if (!open) return
    const idx = options.findIndex((o) => String(o.value) === String(currentValue))
    setActiveIndex(idx >= 0 ? idx : options.findIndex((o) => !o.disabled))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mantém a opção ativa visível durante navegação por teclado.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const node = panelRef.current?.querySelector(`[data-idx="${activeIndex}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const moveActive = (dir) => {
    setActiveIndex((prev) => {
      if (!options.length) return prev
      let i = prev
      for (let n = 0; n < options.length; n++) {
        i = (i + dir + options.length) % options.length
        if (!options[i].disabled) return i
      }
      return prev
    })
  }

  const onTriggerKeyDown = (e) => {
    if (disabled) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(options.findIndex((o) => !o.disabled))
    } else if (e.key === 'End') {
      e.preventDefault()
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          setActiveIndex(i)
          break
        }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = options[activeIndex]
      if (opt && !opt.disabled) commit(opt.value)
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className={className}>
      {label && (
        <label
          className="block text-xs font-medium text-text-secondary mb-1.5"
          onClick={() => !disabled && triggerRef.current?.focus()}
        >
          {label}
        </label>
      )}

      <div className="relative">
        <button
          type="button"
          id={id}
          ref={triggerRef}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => !disabled && setOpen((o) => !o)}
          onKeyDown={onTriggerKeyDown}
          className={`${TRIGGER_BASE_CLASS} ${SIZES[size] || SIZES.md}`}
        >
          <span className={`truncate ${showPlaceholder ? 'text-text-secondary' : ''}`}>
            {displayLabel || ' '}
          </span>
          <ChevronDown
            size={16}
            className={`flex-shrink-0 text-text-secondary transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Espelho nativo (oculto) — preserva validação de `required` e acessibilidade. */}
        <select
          aria-hidden="true"
          tabIndex={-1}
          name={name}
          required={required}
          disabled={disabled}
          value={currentValue}
          onChange={() => {}}
          className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
        >
          {children}
        </select>
      </div>

      {error && <p className="text-xs state-danger mt-1">{error}</p>}

      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className="fixed z-[70] border border-border-subtle bg-surface shadow-xl overflow-auto py-1"
            style={{
              left: coords.left,
              width: coords.width,
              top: coords.top,
              bottom: coords.bottom,
              maxHeight: coords.maxHeight,
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.18)',
            }}
          >
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-text-secondary">Sem opções</div>
            )}
            {options.map((opt, idx) => {
              const isSelected = String(opt.value) === String(currentValue)
              const isActive = idx === activeIndex
              const prevGroup = idx > 0 ? options[idx - 1].group : undefined
              return (
                <div key={`${opt.value}-${idx}`}>
                  {opt.group && opt.group !== prevGroup && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                      {opt.group}
                    </div>
                  )}
                  <div
                    data-idx={idx}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onMouseEnter={() => !opt.disabled && setActiveIndex(idx)}
                    onClick={() => !opt.disabled && commit(opt.value)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed'
                        : 'cursor-pointer'
                    } ${isActive && !opt.disabled ? 'bg-surface-alt' : ''} ${
                      isSelected ? 'text-accent font-medium' : 'text-text-primary'
                    }`}
                  >
                    <span className="truncate">{opt.label || ' '}</span>
                    {isSelected && <Check size={15} className="flex-shrink-0 text-accent" />}
                  </div>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
