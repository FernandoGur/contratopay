import { type ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { logout } from '@/lib/repo'
import { useCurrentUser } from '@/lib/store'

const NAV = [
  { to: '/admin', label: 'Painel', exact: true, icon: 'grid' },
  { to: '/admin/contratos', label: 'Contratos', icon: 'doc' },
  { to: '/admin/clientes', label: 'Clientes', icon: 'users' },
]

function Icon({ name }: { name: string }) {
  const common = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9 }
  if (name === 'grid')
    return (
      <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
    )
  if (name === 'doc')
    return (
      <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>
    )
  return (
    <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  )
}

/** Marca textual — "Contrato" em tinta + "Pay" em índigo (sem símbolo, por ora). */
function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-[-0.03em] text-ink-900 ${className}`}>
      Contrato<span className="text-brand-600">Pay</span>
    </span>
  )
}

function initialsOf(name?: string) {
  if (!name) return 'CP'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
            }`
          }
        >
          <Icon name={item.icon} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-ink-200 bg-white p-3.5 lg:flex lg:flex-col">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Wordmark className="text-[15px]" />
        </div>

        {/* Busca (⌘K) — afordância visual */}
        <div className="mt-3 mb-4 flex items-center gap-2 rounded-[10px] border border-ink-200 bg-white px-2.5 py-2 shadow-[0_1px_1px_rgba(16,18,28,0.03)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-400"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <span className="flex-1 text-[13px] text-ink-400">Buscar…</span>
          <kbd className="rounded-md border border-ink-200 bg-ink-100 px-1.5 py-px text-[11px] font-semibold text-ink-400">⌘K</kbd>
        </div>

        {nav}

        <div className="mt-auto flex items-center gap-2.5 border-t border-ink-200 pt-3">
          <div className="bg-brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
            {initialsOf(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink-900">{user?.name}</div>
            <div className="truncate text-[11.5px] text-ink-400">{user?.email}</div>
          </div>
          <button
            onClick={() => {
              logout()
              navigate('/')
            }}
            aria-label="Sair"
            className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </aside>

      {/* Topbar mobile */}
      <header className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
        <Wordmark className="text-[15px]" />
        <button onClick={() => setOpen((v) => !v)} className="rounded-md p-2 text-ink-600 hover:bg-ink-100">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
        </button>
      </header>
      {open && (
        <div className="border-b border-ink-200 bg-white p-4 lg:hidden">
          {nav}
          <button
            onClick={() => {
              logout()
              navigate('/')
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm text-ink-500 hover:bg-ink-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            Sair
          </button>
        </div>
      )}

      <main className="flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
