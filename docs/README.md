# my-ba.ai — Project Knowledge Pack

Upload every file here to a Claude Project's knowledge base. Paste `00-PROJECT-INSTRUCTIONS.md` into the Project instructions field.

| File                         | What it's for                                              | Changes                 |
| ---------------------------- | ---------------------------------------------------------- | ----------------------- |
| `00-PROJECT-INSTRUCTIONS.md` | Goes in the Project instructions field, not knowledge      | Rarely                  |
| `01-product-overview.md`     | Problem, users, business model, glossary                   | Rarely                  |
| `02-architecture.md`         | System shape, stack, key decisions, risks                  | When the stack changes  |
| `03-domain-model.md`         | State machine, entities, locking, cloning, ranking         | When the schema evolves |
| `04-decisions-log.md`        | **The living document.** Locked decisions + open questions | Constantly              |
| `05-roadmap-and-phases.md`   | MVP boundary, phases, tickets, critical path               | Every phase             |
| `06-data-sources.md`         | Providers, rejected options, cost control, compliance      | When a source changes   |
| `07-design-brief.md`         | Design direction + screen prompts for Claude Design        | Per design pass         |
| `08-auth-flow.md`            | Auth sequence diagrams, the two tenant GUCs, failure modes | When auth changes       |

## Maintenance rule

When something changes, edit `04-decisions-log.md` first, then propagate to the affected file, then re-upload both. A Project whose knowledge lags reality is worse than no Project — it argues confidently from a world that no longer exists.
