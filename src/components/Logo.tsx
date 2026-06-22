/**
 * Marca ContratoPay — monograma "CP" num quadrado arredondado (índigo) + wordmark.
 * Recriado em SVG para escalar nítido em qualquer tamanho.
 */

/** Marca ContratoPay 3.0 — documento com canto dobrado + "check circular"
 *  (C aberto + tique) em gradiente violeta→azul. Vetorial (transparente, nítida). */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={`${className} shrink-0`} role="img" aria-label="ContratoPay">
      <defs>
        <linearGradient id="cp-mark" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5A3FF2" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      {/* documento com canto dobrado */}
      <path
        d="M13 5h16l10 10v24a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4Z"
        stroke="url(#cp-mark)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M29 5v10h10" stroke="url(#cp-mark)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* C aberto à direita */}
      <path d="M30 19.5a8.5 8.5 0 1 0 0 13" stroke="url(#cp-mark)" strokeWidth="3" strokeLinecap="round" />
      {/* tique saindo da abertura */}
      <path d="M19.6 26.2l3.7 3.7L31 21" stroke="url(#cp-mark)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
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
    <span className={`block text-left font-display font-extrabold tracking-[-0.03em] ${sizes[size]} ${className}`}>
      <span className="text-brand-950">Contrato</span>
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
    <div className="flex items-center gap-2.5 text-left">
      <LogoMark className={markClassName} />
      <div className="leading-tight text-left">
        <Wordmark size={size} />
        {tagline && (
          <div className="text-left text-[10px] font-medium text-ink-400">Gestão Inteligente de Contratos</div>
        )}
        {subtitle && <div className="text-left text-[11px] text-ink-400">{subtitle}</div>}
      </div>
    </div>
  )
}
