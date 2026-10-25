// Wordmark per the Suivix brand guide: "suivi" in Sora SemiBold (ink), "x" in Sora Light
// (Suivix blue) and a blue square as the full stop, sitting on the baseline. The tagline is
// set in the editorial italic, preceded by a thin rule, and is never set directly against the logo.
export const SUIVIX_TAGLINE = 'Réception et suivi de dossier.'

export function SuivixLogo({
  size = 'md',
  tagline = false,
  tone = 'default',
}: {
  size?: 'sm' | 'md' | 'lg'
  tagline?: boolean
  // 'ink' is the guide's "version encre" for dark grounds: white "suivi", blue "x" and square.
  tone?: 'default' | 'ink'
}) {
  const sizeClass = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-2xl'
  return (
    <div className="flex flex-col">
      <span
        className={`inline-flex items-baseline leading-none tracking-tight select-none ${tone === 'ink' ? 'text-white' : 'text-foreground'} ${sizeClass}`}
        style={{ fontFamily: "'Sora', sans-serif" }}
        aria-label="suivix"
      >
        <span className="font-semibold">suivi</span>
        <span className="font-light text-primary">x</span>
        <span className="ml-[0.1em] inline-block h-[0.26em] w-[0.26em] shrink-0 bg-primary" aria-hidden="true" />
      </span>
      {tagline && (
        <span className="mt-density-sm flex items-center gap-2">
          <span className={`h-px w-4 shrink-0 ${tone === 'ink' ? 'bg-white/40' : 'bg-foreground/60'}`} aria-hidden="true" />
          <span className={`font-editorial text-xs ${tone === 'ink' ? 'text-white/60' : 'text-muted-foreground'}`}>{SUIVIX_TAGLINE}</span>
        </span>
      )}
    </div>
  )
}
