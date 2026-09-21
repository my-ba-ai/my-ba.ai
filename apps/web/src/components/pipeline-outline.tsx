import type { TaskStatus } from "@my-ba/shared"

export function PipelineOutline({ stages }: Readonly<{ stages: readonly TaskStatus[] }>) {
  return (
    <section aria-labelledby="pipeline-heading" className="space-y-3">
      <h2
        id="pipeline-heading"
        className="text-xs font-medium uppercase tracking-widest text-neutral-500"
      >
        Purchase Task pipeline
      </h2>
      <ol className="flex flex-wrap gap-2">
        {stages.map((stage) => (
          <li
            key={stage}
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm text-neutral-700"
          >
            {stage.replaceAll("_", " ").toLowerCase()}
          </li>
        ))}
      </ol>
    </section>
  )
}
