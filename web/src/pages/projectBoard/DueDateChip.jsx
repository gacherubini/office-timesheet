import { useState, useRef, useEffect } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import { ptBR } from 'date-fns/locale'
import { Calendar, X } from 'lucide-react'
import { urgency, urgencyClasses } from './helpers'
import { useClickOutside } from '../../hooks/useClickOutside'
import { fetchHolidays } from '../../lib/holidaysClient'
import 'react-datepicker/dist/react-datepicker.css'

registerLocale('pt-BR', ptBR)

function toDate(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).split('T')[0].split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function toIso(date) {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y.slice(2)}`
}

export function DueDateChip({ value, status, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [holidays, setHolidays] = useState([])
  const ref = useRef(null)
  const u = urgency(value, status)

  useClickOutside(ref, open, () => setOpen(false))

  // Carrega os feriados (ano atual + seguinte) quando o seletor abre.
  useEffect(() => {
    if (!open || holidays.length > 0) return
    const year = new Date().getFullYear()
    Promise.all([fetchHolidays(year), fetchHolidays(year + 1)])
      .then(([a, b]) => setHolidays([...a, ...b].map((h) => ({ date: h.date, holidayName: h.name }))))
      .catch(() => {})
  }, [open, holidays.length])

  function clear() {
    setOpen(false)
    onChange(null)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs ${
          value
            ? u.level !== 'none' && u.level !== 'normal'
              ? urgencyClasses(u.level)
              : 'bg-surface-alt border border-border-subtle text-text-primary'
            : 'bg-surface-alt border border-border-subtle text-text-secondary'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <Calendar size={12} />
        {value ? formatDate(value) : 'Sem prazo'}
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 bg-surface border border-border-subtle shadow-xl p-2">
          <DatePicker
            selected={toDate(value)}
            onChange={(date) => { onChange(toIso(date)); setOpen(false) }}
            locale="pt-BR"
            dateFormat="dd/MM/yyyy"
            holidays={holidays}
            inline
          />
          {value && (
            <button
              type="button"
              onClick={clear}
              className="mt-1 w-full inline-flex items-center justify-center gap-1 text-[11px] text-text-secondary hover:text-rose-500"
            >
              <X size={11} /> Remover prazo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
