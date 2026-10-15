/** DI tokens for the screening stage. Kept out of the module file (repo AGENTS.md). */
export const ORCHESTRATOR = Symbol("ORCHESTRATOR")
/** The screener's own app-role pool (not the checkpointer's). */
export const SCREENING_POOL = Symbol("SCREENING_POOL")
/** Task status / gate sync after each orchestrator call (P1-6). */
export const STAGE_SYNC = Symbol("STAGE_SYNC")
