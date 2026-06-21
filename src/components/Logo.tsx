/**
 * Marca ContratoPay — monograma "CP" num quadrado arredondado (índigo) + wordmark.
 * Recriado em SVG para escalar nítido em qualquer tamanho.
 */

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} role="img" aria-label="ContratoPay">
      <defs>
        <linearGradient id="cp-grad" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#5b5bd6" />
        </linearGradient>
      </defs>
      {/* quadro arredondado */}
      <rect x="4" y="4" width="40" height="40" rx="11" stroke="url(#cp-grad)" strokeWidth="2.6" />
      {/* C — arco aberto à direita, abraçando o canto inferior esquerdo */}
      <path
        d="M30 17.5a8.5 8.5 0 1 0 0 13"
        stroke="url(#cp-grad)"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* P — haste + bojo */}
      <path
        d="M22 33V15h5.5a5 5 0 0 1 0 10H22"
        stroke="url(#cp-grad)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function Wordmark({
  className = '',
  size = 'md',
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizes = { sm: 'text-[15px]', md: 'text-[17px]', lg: 'text-[22px]' }
  return (
    <span className={`font-display font-bold tracking-[-0.03em] ${sizes[size]} ${className}`}>
      <span className="text-ink-900">Contrato</span>
      <span className="text-brand-600">Pay</span>
    </span>
  )
}

export function Logo({
  tagline,
  subtitle,
  markClassName = 'h-9 w-9',
  size = 'md',
}: {
  /** Mostra "Gestão Inteligente de Contratos". */
  tagline?: boolean
  /** Texto secundário customizado (ex.: "Portal do seu contrato"). */
  subtitle?: string
  markClassName?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className={markClassName} />
      <div className="leading-tight">
        <Wordmark size={size} />
        {tagline && (
          <div className="text-[10px] font-medium text-ink-400">Gestão Inteligente de Contratos</div>
        )}
        {subtitle && <div className="text-[11px] text-ink-400">{subtitle}</div>}
      </div>
    </div>
  )
}
