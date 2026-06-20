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
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }
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

export function AdminLayout({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const nav = (
    <nav className="space-y-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-brand-600 text-white shadow-[var(--shadow-brand)]'
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
      <aside className="hidden w-64 shrink-0 border-r border-ink-200 bg-white p-4 lg:flex lg:flex-col">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <div className="bg-brand-gradient flex h-10 w-10 items-center justify-center rounded-xl font-display text-lg font-extrabold text-white shadow-[var(--shadow-brand)]">
            R
          </div>
          <div>
            <div className="font-display text-[15px] font-bold text-ink-900">Recebimentos</div>
            <div className="text-xs text-ink-400">Painel do vendedor</div>
          </div>
        </div>
        {nav}
        <div className="mt-auto border-t border-ink-200 pt-4">
          <div className="px-2 text-sm font-medium text-ink-700">{user?.name}</div>
          <div className="px-2 text-xs text-ink-400">{user?.email}</div>
          <button
            onClick={() => {
              logout()
              navigate('/')
            }}
            className="mt-2 w-full rounded-lg px-2 py-2 text-left text-sm text-ink-500 hover:bg-ink-100"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Topbar mobile */}
      <header className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-xl font-display text-sm font-extrabold text-white shadow-[var(--shadow-brand)]">
            R
          </div>
          <span className="font-display font-bold text-ink-900">Recebimentos</span>
        </div>
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
            className="mt-3 w-full rounded-lg px-3 py-2 text-left text-sm text-ink-500 hover:bg-ink-100"
          >
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
