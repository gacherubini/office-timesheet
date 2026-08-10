import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Menu, User, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { buildNav } from '../lib/nav'
import { useClickOutside } from '../hooks/useClickOutside'
import { Avatar } from './Avatar'
import { BrandLine } from './BrandLine'
import { NotificationBell } from './NotificationBell'
import simbolo from '../assets/studio-vivian-simbolo.png'

function NavLink({ item, active }) {
  return (
    <Link
      to={item.to}
      className={`whitespace-nowrap pb-0.5 text-[13px] transition-colors ${
        active
          ? 'border-b border-white text-white'
          : 'border-b border-transparent text-white/60 hover:text-white'
      }`}
    >
      {item.label}
    </Link>
  )
}

// Performance vira menu suspenso quando o usuário é admin.
function NavMenu({ item, active }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()

  useClickOutside(ref, open, () => setOpen(false))
  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1 whitespace-nowrap pb-0.5 text-[13px] transition-colors ${
          active
            ? 'border-b border-white text-white'
            : 'border-b border-transparent text-white/60 hover:text-white'
        }`}
      >
        {item.label}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-3 w-52 border border-border-subtle bg-surface py-1">
          <Link to={item.to} className="block px-4 py-2 text-[13px] text-text-primary hover:bg-surface-alt">
            {item.label}
          </Link>
          <div className="my-1 border-t border-border-subtle" />
          {item.children.map((child) => (
            <Link
              key={child.to}
              to={child.to}
              className="block px-4 py-2 text-[13px] text-text-secondary hover:bg-surface-alt hover:text-text-primary"
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function AvatarMenu({ profile, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useClickOutside(ref, open, () => setOpen(false))

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Conta">
        <Avatar name={profile?.name} url={profile?.avatar_url} size={28} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-3 w-56 border border-border-subtle bg-surface py-1">
          <div className="border-b border-border-subtle px-4 py-3">
            <p className="truncate text-[13px] text-text-primary">{profile?.name || 'Usuário'}</p>
            <p className="mt-0.5 truncate text-[11px] text-text-secondary">{profile?.email}</p>
          </div>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-[13px] text-text-secondary hover:bg-surface-alt hover:text-text-primary"
          >
            <User size={14} /> Perfil
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] text-text-secondary hover:bg-surface-alt hover:text-text-primary"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      )}
    </div>
  )
}

export function Topbar() {
  const { profile, isAdmin, isAdministrativeIntern, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const nav = buildNav({ isAdmin, isAdministrativeIntern })

  useEffect(() => setDrawerOpen(false), [location.pathname])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function isActive(item) {
    if (location.pathname === item.to) return true
    return Boolean(item.children?.some((c) => c.to === location.pathname))
  }

  return (
    <header className="sticky top-0 z-30 bg-green-dk">
      <div className="relative flex h-14 items-center gap-6 px-4 md:px-6">
        <BrandLine />

        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label={drawerOpen ? 'Fechar menu' : 'Abrir menu'}
          className="relative z-10 text-white md:hidden"
        >
          {drawerOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Marca: símbolo + Gestão VOID | nav */}
        <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3 md:gap-4">
          <Link to={nav[0].to} className="flex flex-none items-center gap-2.5">
            <img src={simbolo} alt="Studio Vivian" className="h-5 w-auto invert" />
            <span className="text-[13px] font-light tracking-wide text-white/85">
              Gestão VOID
            </span>
          </Link>

          <span
            className="hidden h-4 w-px flex-none bg-white/30 md:block"
            aria-hidden="true"
          />

          <nav className="hidden items-center gap-5 md:flex">
            {nav.map((item) =>
              item.children ? (
                <NavMenu key={item.label} item={item} active={isActive(item)} />
              ) : (
                <NavLink key={item.label} item={item} active={isActive(item)} />
              ),
            )}
          </nav>
        </div>

        <div className="relative z-10 flex flex-none items-center gap-4">
          <NotificationBell />
          <AvatarMenu profile={profile} onLogout={handleLogout} />
        </div>
      </div>

      {drawerOpen && (
        <nav className="border-t border-white/10 bg-green-dk px-4 pb-3 md:hidden">
          {nav.map((item) => (
            <div key={item.label}>
              <Link to={item.to} className="block py-2.5 text-[14px] text-white/80">
                {item.label}
              </Link>
              {item.children?.map((child) => (
                <Link key={child.to} to={child.to} className="block py-2 pl-4 text-[13px] text-white/55">
                  {child.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      )}
    </header>
  )
}
