# @my-ba/orchestrator

Stage orchestration behind one narrow interface, `Orchestrator` in
`src/stage.ts`. Callers never see LangGraph types, so D22's fallback (a
hand-rolled state machine with Redis-backed pause state) can replace the
implementation without touching them.

## P0-5 spike

`src/spike/spike-graph.ts` is three nodes and one `interrupt()`:

```text
START → prepare → approval_gate ⏸ → finalise → END
```

`src/spike/hitl-durability.integration.spec.ts` is the gate. Each step runs in
its own process as `my_ba_app`. The start process is `SIGKILL`ed while paused
and still holding pool connections. A fresh process reads the status, a third
resumes, and node-execution probes confirm that `prepare` did not re-run.

```bash
pnpm db:up
pnpm db:migrate          # Drizzle journal, then PostgresSaver.setup()
pnpm test:integration
```

## Things LangGraph.js does that the rest of the code must respect

- **There is no "thread status" in the library.** That's a LangGraph Platform
  concept. Status is derived from `getState()` in `src/thread-status.ts`.
- **A node that calls `interrupt()` runs again from the top on resume.**
  Anything before the `interrupt()` call runs twice. The durability test asserts
  this.
- **`Command({ resume })` on a finished thread silently does nothing.**
  `resumeStage` checks the status first and throws
  `StageNotAwaitingApprovalError`.

## Checkpoint storage (D51)

The tables are in the `langgraph` schema and have no `tenant_id` or RLS.
Tenant scope is carried in the thread id
`tenant:<uuid>:task:<uuid>:stage:<name>`, built only by `threadIdFor`. The
checkpointer uses its own pool (`CHECKPOINTER_POOL_MAX`, default 5).

## Module resolution

`@langchain/*` publishes its entry points only through `exports`, so this
package uses `moduleResolution: Node16` (it still emits CommonJS). The emitted
`.d.ts` for `LangGraphOrchestrator` still references `@langchain/*` via
`SpikeNode`. When P1-4 wires this into `apps/worker`, which uses node10
resolution, check that it typechecks. If it doesn't, give the worker a
types-only entry point.
