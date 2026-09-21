import { cn } from "@/lib/utils"

type GallerySectionProps = {
  id: string
  label: string
  title: string
  description?: string
  className?: string
  children: React.ReactNode
}

/** A panel per design-system.md §3: 18px radius, panel outline, panel elevation. */
export function GallerySection({
  id,
  label,
  title,
  description,
  className,
  children,
}: GallerySectionProps) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-2xl border border-border-panel bg-surface p-6 shadow-panel"
    >
      <p className="font-data text-micro-lg text-ink-dim uppercase">{label}</p>
      <h2 id={`${id}-title`} className="mt-1 text-section text-ink">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 max-w-[64ch] text-body-sm text-ink-muted">{description}</p>
      ) : null}
      <div className={cn("mt-5", className)}>{children}</div>
    </section>
  )
}
