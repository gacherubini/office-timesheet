import DatePicker, { registerLocale } from 'react-datepicker'
import { ptBR } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'

registerLocale('pt-BR', ptBR)

const BASE_CLASS =
  'w-full form-control border outline-none transition-colors disabled:opacity-60'

// Mesma convenção de tamanho do Select.jsx: padrão inalterado ('md'); 'sm'
// entrega h-8 (a faixa de controle padrão do sistema) com padding e texto
// proporcionais. DateRange repassa este prop, sem redefinir a regra.
const SIZES = {
  sm: 'h-8 px-3 py-0 text-[12px]',
  md: 'px-3 py-2 text-sm',
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const [y, m, d] = String(value).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function toIsoDate(date) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function DateField({
  label,
  error,
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  placeholder = 'DD/MM/AAAA',
  className = '',
  name,
  id,
  showYearDropdown = false,
  showMonthDropdown = false,
  yearDropdownItemNumber = 100,
  size = 'md',
}) {
  const handleChange = (date) => {
    if (!onChange) return
    onChange({ target: { name, value: toIsoDate(date) } })
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      )}
      <DatePicker
        selected={toDate(value)}
        onChange={handleChange}
        minDate={toDate(min) || undefined}
        maxDate={toDate(max) || undefined}
        dateFormat="dd/MM/yyyy"
        locale="pt-BR"
        popperPlacement="bottom-start"
        placeholderText={placeholder}
        required={required}
        disabled={disabled}
        name={name}
        id={id}
        showYearDropdown={showYearDropdown}
        showMonthDropdown={showMonthDropdown}
        scrollableYearDropdown={showYearDropdown}
        yearDropdownItemNumber={yearDropdownItemNumber}
        dropdownMode={showYearDropdown || showMonthDropdown ? 'select' : undefined}
        wrapperClassName="block w-full"
        className={`${BASE_CLASS} ${SIZES[size] || SIZES.md}`}
      />
      {error && <p className="text-xs state-danger mt-1">{error}</p>}
    </div>
  )
}
