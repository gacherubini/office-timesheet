import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Cake, MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import { Avatar } from './Avatar'
import { Card } from './ui/Card'

function whatsappLink(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${withCountry}`
}

export function BirthdayCalendar() {
  const [people, setPeople] = useState([])
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  useEffect(() => {
    api.get('/birthdays').then(setPeople).catch(() => setPeople([]))
  }, [])

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }
  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const monthBirthdays = people
    .map((p) => {
      const [, mm, dd] = (p.birth_date || '').split('-').map(Number)
      return { ...p, birthMonth: (mm || 0) - 1, birthDay: dd || 0 }
    })
    .filter((p) => p.birthMonth === viewMonth)
    .sort((a, b) => a.birthDay - b.birthDay)

  const birthdaysByDay = {}
  for (const p of monthBirthdays) {
    if (!birthdaysByDay[p.birthDay]) birthdaysByDay[p.birthDay] = []
    birthdaysByDay[p.birthDay].push(p)
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isToday = (d) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-alt transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-1.5">
          <Cake size={14} className="text-accent" />
          <span className="text-sm font-semibold capitalize text-text-primary">{monthName}</span>
        </div>
        <button
          onClick={nextMonth}
          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-alt transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="px-3 pb-3">
        <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-[10px] text-text-secondary font-semibold py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => {
            const hasBirthday = d && birthdaysByDay[d]
            const names = hasBirthday ? birthdaysByDay[d].map((p) => p.name).join(', ') : ''
            const today = isToday(d)
            return (
              <div
                key={i}
                title={names}
                className={`relative text-xs h-8 flex items-center justify-center rounded-lg transition-colors ${
                  !d
                    ? ''
                    : today
                      ? 'text-white font-bold'
                      : hasBirthday
                        ? 'text-accent font-semibold ring-1 ring-accent/40 cursor-help bg-[color:var(--color-accent)]/10'
                        : 'text-text-primary hover:bg-surface-alt'
                }`}
                style={today ? { background: 'var(--color-accent)' } : undefined}
              >
                {d || ''}
                {hasBirthday && !today && (
                  <span
                    className="absolute bottom-1 right-1 w-1 h-1 rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t border-border-subtle px-4 py-3 bg-surface-alt/50">
        <p className="text-[11px] text-text-secondary uppercase tracking-wider font-semibold mb-2">
          Aniversariantes
        </p>
        {monthBirthdays.length === 0 ? (
          <p className="text-xs text-text-secondary text-center py-2">
            Nenhum aniversariante este mês.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {monthBirthdays.map((p) => {
              const wa = whatsappLink(p.phone)
              return (
                <li key={p.id} className="flex items-center gap-2">
                  <Avatar name={p.name} url={p.avatar_url} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{p.name}</p>
                    <p className="text-[11px] text-text-secondary">
                      {String(p.birthDay).padStart(2, '0')}/
                      {String(p.birthMonth + 1).padStart(2, '0')}
                    </p>
                  </div>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      title={`WhatsApp ${p.phone}`}
                      className="text-emerald-500 hover:text-emerald-400 p-1 rounded hover:bg-emerald-500/10 transition-colors"
                    >
                      <MessageCircle size={14} />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}
