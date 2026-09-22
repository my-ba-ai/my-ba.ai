import { ClipboardList, ShieldCheck, Users } from "lucide-react"

const STEPS = [
  {
    icon: ClipboardList,
    title: "Define the brief",
    body: "Set the investor profile, target states, budget and the criteria a suburb has to meet.",
  },
  {
    icon: ShieldCheck,
    title: "Approve each stage",
    body: "Screening, trend and growth analysis each stop for your approval. Nothing advances until you approve it.",
  },
  {
    icon: Users,
    title: "Contact agents",
    body: "Shortlisted suburbs get ranked, registered agents. The report is locked at the moment you reach out.",
  },
] as const

/**
 * Empty state (design-system.md §4): say why the list is empty and what comes
 * next, not only that it is empty.
 */
export function TaskListEmpty() {
  return (
    <section
      aria-labelledby="task-list-empty-heading"
      className="rounded-2xl border border-border-panel bg-surface px-8 py-10 shadow-panel"
    >
      <div className="max-w-[64ch] space-y-2">
        <h2 id="task-list-empty-heading" className="text-section text-ink">
          No purchase tasks yet
        </h2>
        <p className="text-body text-ink-2">
          A purchase task takes one search from criteria to agent outreach. Task creation arrives in
          P1-3. Until then this list stays empty.
        </p>
      </div>

      <ol className="mt-8 grid gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="space-y-2 rounded-xl border border-border-card bg-surface-sunk p-4.5"
          >
            <div className="flex items-center gap-2">
              <span className="font-data text-micro-lg text-ink-dim uppercase">
                Step {index + 1}
              </span>
              <step.icon aria-hidden className="ml-auto size-6 text-accent-deep" />
            </div>
            <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
            <p className="text-body-sm text-ink-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
