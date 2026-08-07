import DatePicker, { registerLocale } from 'react-datepicker'
import { ptBR } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'

registerLocale('pt-BR', ptBR)

// Espelha o DateField, mas só para horário (HH:MM). Mantém o mesmo visual do
// projeto (form-control + label), com dropdown de horários em vez do input nativo.
function toTime(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const [h, m] = String(value).split(':').map(Number)
  if (Number.isNaN(h)) return null
  const d = new Date()
  d.setHours(h, m || 0, 0, 0)
  return d
}

function toHm(date) {
  if (!date) return ''
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function TimeField({
  label,
  error,
  value,
  onChange,
  disabled,
  required,
  placeholder = 'HH:MM',
  className = '',
  name,
  id,
  minuteInterval = 15,
}) {
  const handleChange = (date) => {
    if (!onChange) return
    onChange({ target: { name, value: toHm(date) } })
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      )}
      <DatePicker
        selected={toTime(value)}
        onChange={handleChange}
        showTimeSelect
        showTimeSelectOnly
        timeIntervals={minuteInterval}
        timeCaption="Hora"
        dateFormat="HH:mm"
        timeFormat="HH:mm"
        locale="pt-BR"
        popperPlacement="bottom-start"
        placeholderText={placeholder}
        required={required}
        disabled={disabled}
        name={name}
        id={id}
        wrapperClassName="block w-full"
        className="w-full form-control border px-3 py-2 text-sm outline-none transition-colors disabled:opacity-60"
      />
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  )
}
