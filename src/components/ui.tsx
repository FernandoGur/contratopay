import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
} from 'react'

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({
  children,
  className = '',
  hover = false,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
}) {
  return <div className={`card p-5 ${hover ? 'card-hover' : ''} ${className}`}>{children}</div>
}

// ---------------------------------------------------------------------------
// Card de indicador (KPI)
// ---------------------------------------------------------------------------
export function StatCard({
  label,
  value,
  hint,
  accent = false,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: boolean
  tone?: 'default' | 'pos' | 'warn' | 'neg'
}) {
  const toneText =
    tone === 'pos'
      ? 'text-pos-600'
      : tone === 'warn'
        ? 'text-warn-700'
        : tone === 'neg'
          ? 'text-neg-700'
          : 'text-ink-900'
  return (
    <div className={`card card-hover p-5 ${accent ? 'ring-1 ring-brand-200 bg-brand-50/50' : ''}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div className={`num-display mt-2.5 text-[1.7rem] font-bold leading-none ${toneText}`}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-sm text-ink-500">{hint}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Badge de status
// ---------------------------------------------------------------------------
const BADGE_TONES: Record<string, string> = {
  pos: 'bg-pos-50 text-pos-700 ring-pos-500/20',
  warn: 'bg-warn-50 text-warn-700 ring-warn-500/20',
  neg: 'bg-neg-50 text-neg-700 ring-neg-500/20',
  info: 'bg-brand-50 text-brand-700 ring-brand-500/20',
  muted: 'bg-ink-100 text-ink-600 ring-ink-300/40',
}

export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: keyof typeof BADGE_TONES
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Botão
// ---------------------------------------------------------------------------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 shadow-[var(--shadow-brand)] hover:shadow-[0_10px_28px_-6px_rgba(35,71,232,0.55)]',
    secondary:
      'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300',
    ghost: 'text-brand-700 hover:bg-brand-50',
    danger: 'bg-neg-500 text-white hover:bg-neg-700',
  }
  const sizes = {
    sm: 'px-3.5 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Campos de formulário
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-ink-200 bg-ink-50/60 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} tnum ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={`${inputCls} min-h-20 ${props.className ?? ''}`} />
  )
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 backdrop-blur-sm">
      <div
        className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
            aria-label="Fechar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cabeçalho de página
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aviso (banner informativo / simulação)
// ---------------------------------------------------------------------------
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'warn'
}) {
  const cls =
    tone === 'warn'
      ? 'bg-warn-50 text-warn-700 ring-warn-500/20'
      : 'bg-brand-50 text-brand-800 ring-brand-500/20'
  return (
    <div className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${cls}`}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Linha rótulo/valor
// ---------------------------------------------------------------------------
export function Row({
  label,
  value,
  strong = false,
}: {
  label: ReactNode
  value: ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-ink-500">{label}</span>
      <span
        className={`tnum text-right ${strong ? 'text-base font-semibold text-ink-900' : 'text-sm text-ink-800'}`}
      >
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mapas de rótulos/cores de status
// ---------------------------------------------------------------------------
export const INSTALLMENT_STATUS_LABEL: Record<string, string> = {
  paga: 'Paga',
  vencida: 'Vencida',
  a_vencer: 'A vencer',
}
export const INSTALLMENT_STATUS_TONE: Record<string, keyof typeof BADGE_TONES> = {
  paga: 'pos',
  vencida: 'neg',
  a_vencer: 'muted',
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  em_aberto: 'Em aberto',
  aguardando_comprovante: 'Aguardando comprovante',
  comprovante_enviado: 'Comprovante enviado',
  em_analise: 'Em análise',
  pago: 'Pago',
  pago_parcial: 'Pago parcialmente',
  vencido: 'Vencido',
  renegociado: 'Renegociado',
  cancelado: 'Cancelado',
  ajustado: 'Ajustado manualmente',
}
