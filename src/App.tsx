import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useCurrentUser, useReady } from '@/lib/store'
import { LogoMark } from '@/components/Logo'
import { ReceiptModal } from '@/components/ReceiptModal'
import { AdminLayout } from '@/components/AdminLayout'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/admin/Dashboard'
import { Clients } from '@/pages/admin/Clients'
import { Contracts } from '@/pages/admin/Contracts'
import { ContractDetail } from '@/pages/admin/ContractDetail'
import { ClientArea } from '@/pages/client/ClientArea'

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()
  if (!user) return <Navigate to="/" replace />
  if (user.role !== 'admin') return <Navigate to="/cliente" replace />
  return <AdminLayout>{children}</AdminLayout>
}

function Home() {
  const user = useCurrentUser()
  if (!user) return <Login />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/cliente'} replace />
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <LogoMark className="h-12 w-12 animate-pulse" />
      <p className="text-sm text-ink-400">Carregando…</p>
    </div>
  )
}

export default function App() {
  const ready = useReady()
  if (!ready) return <LoadingScreen />
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/admin" element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="/admin/clientes" element={<AdminRoute><Clients /></AdminRoute>} />
        <Route path="/admin/contratos" element={<AdminRoute><Contracts /></AdminRoute>} />
        <Route path="/admin/contratos/:id" element={<AdminRoute><ContractDetail /></AdminRoute>} />

        {/* Área do cliente — cliente logado (próprio contrato) ou admin via link */}
        <Route path="/cliente" element={<ClientArea />} />
        <Route path="/cliente/:id" element={<ClientArea />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ReceiptModal />
    </BrowserRouter>
  )
}
