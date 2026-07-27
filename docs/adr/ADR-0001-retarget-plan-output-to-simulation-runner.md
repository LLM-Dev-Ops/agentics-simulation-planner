# ADR-0001: Retarget Plan Output to agentics-simulation-runner

**Status:** Proposed
**Date:** 2026-07-27

> See **ADR-011: Layer-4 Execution Spine Reconnection** in `agentics-enforcement`
> (`plans/adr/ADR-011-layer-4-execution-spine-reconnection.md`) for the platform-wide
> decision this ADR implements. This document covers only this repository's actions.

---

## Context

This repository declares its downstream execution engine as the string literal
`'agentics-simulation-engine'`. **That repository does not exist** anywhere in the
`/workspace/agentics-dev` workspace. Of the 55 top-level repos, there is an
`agentics-simulation-planner` (this one) and an `agentics-simulation-runner`, but no
`agentics-simulation-engine`.

The reference is not documentation drift — it is a compile-time type constraint that makes it
*impossible* to emit a plan addressed to the real runner:

- `src/types/simulation-plan.ts:266` — `readonly engine: 'agentics-simulation-engine';`
- `src/types/simulation-scope.ts:120` — `readonly targetEngine: 'agentics-simulation-engine';`
- `src/contracts/types.ts:13` — `readonly engine: 'agentics-simulation-engine';`
- `src/contracts/validator.ts:268` — rejects any plan whose `engine` field is not that literal
- `src/core/simulation-plan-builder.ts:225` — default parameter `engine: 'agentics-simulation-engine'`
- `src/server.ts:168` — advertises `service: 'agentics-simulation-engine'`
- `README.md:37` — "It does NOT execute simulations — that's the responsibility of `agentics-simulation-engine`."
- `README.md:147`, `README.md:374` — same phantom target

The consequence is that **no `SimulationPlan` this repo emits is ever consumed by anything**.
The real runner's live endpoint accepts an unrelated flat shape,
`{ simulationId, name, scenario, parameters }`
(`agentics-simulation-runner/src/server.ts:653-658`), which carries no agents, no
integrations, and no execution graph. The rich plan this repository is built to produce is
discarded at the boundary.

The phantom has also leaked into `agentics-cli` (`src/config/endpoints.ts:133`,
`src/commands/simulate.ts:451`), which routes natural-language scenarios to a service that
was never deployed.

Historical note: `agentics-enforcement` ADR-005 demoted `agentics-simulation-engine` to a
pure delegation layer. The surviving implementation of that role is
`agentics-simulation-runner`. The engine was never built under its own name.

## Decision

**The planner's target engine becomes `'agentics-simulation-runner'`.**
`agentics-simulation-engine` is not resurrected — per ADR-011 Decision 1, it will not be created.

The planner's boundary is unchanged: it still does **not** execute simulations. It emits a
`SimulationPlan` and hands it to the runner. Only the addressee changes.

To avoid breaking plans already persisted with the old literal, `src/contracts/validator.ts`
accepts **both** literals for exactly one release, logging a deprecation warning on the old
one, then narrows to the new literal only.

## Consequences

### Easier

- Emitted plans have a real consumer for the first time; the full plan structure survives the boundary instead of being flattened.
- The compiler enforces the correct target — a future typo becomes a build failure rather than a silent no-op.
- Removing the phantom from the type system unblocks the CLI cleanup (ADR-011 Phase 6), which currently branches on a service that does not exist.

### Harder

- Any stored plan or fixture carrying `engine: 'agentics-simulation-engine'` becomes invalid after the one-release grace window. Fixtures under `test/` must be swept.
- This is a breaking change to the published plan contract; downstream consumers pinned to the old literal need a coordinated version bump.
- The dual-literal grace window means the validator temporarily accepts a value the type no longer permits, so that branch needs an explicit cast and a removal ticket.

## Implementation Plan

1. Change the literal type to `'agentics-simulation-runner'` in `src/types/simulation-plan.ts:266`.
2. Change `targetEngine` in `src/types/simulation-scope.ts:120` to the same literal; update the illustrative comments at `:87-98` and `:118`.
3. Change `src/contracts/types.ts:13` to match.
4. In `src/contracts/validator.ts:268`, accept both `'agentics-simulation-runner'` and `'agentics-simulation-engine'`, emitting a deprecation warning for the latter. File a follow-up to delete the old branch next release.
5. Update the default parameter at `src/core/simulation-plan-builder.ts:225` and the usage examples in the file header (`:19-21`).
6. Update the advertised service name at `src/server.ts:168`.
7. Update the doc comments referencing the phantom engine at `src/types/simulation-plan.ts:8` and `:291`, and `src/types/simulation-scope.ts:5`.
8. Correct `README.md:37`, `:147`, and `:374`.
9. Sweep `test/` for fixtures asserting the old literal and update them.

## Verification

1. `grep -rn "agentics-simulation-engine" --exclude-dir=node_modules .` returns hits only in `src/contracts/validator.ts` (the temporary grace branch) and this ADR.
2. `npm run build` succeeds — confirms no residual type references to the old literal.
3. Unit test: `SimulationPlanBuilder` with no explicit engine produces a plan whose `targetEngine` is `'agentics-simulation-runner'`.
4. Contract test: a plan with `engine: 'agentics-simulation-runner'` passes `validator.ts`; a plan with the old literal passes **with** a logged deprecation warning; a plan with any third value is rejected.
5. Cross-repo integration test (with ADR-0001 in `agentics-simulation-runner`): a plan built here is accepted by the runner's `POST /v1/runner/plans` without transformation. This test cannot pass today — there is no endpoint that accepts a `SimulationPlan`.
