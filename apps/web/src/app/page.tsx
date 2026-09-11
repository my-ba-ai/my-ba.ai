import { APP_NAME, TASK_STATUS_ORDER } from '@my-ba/shared';
import { PipelineOutline } from '@/components/pipeline-outline';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Scaffold up. Auth, task list and task detail land in P0-6.
        </p>
      </header>
      <PipelineOutline stages={TASK_STATUS_ORDER} />
    </main>
  );
}
