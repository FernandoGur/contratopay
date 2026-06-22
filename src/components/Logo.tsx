/**
 * Marca ContratoPay — monograma "CP" num quadrado arredondado (índigo) + wordmark.
 * Recriado em SVG para escalar nítido em qualquer tamanho.
 */

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt="ContratoPay"
      className={`${className} shrink-0 object-contain`}
      width={36}
      height={36}
    />
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
    <span className={`block font-display font-bold tracking-[-0.03em] ${sizes[size]} ${className}`}>
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
