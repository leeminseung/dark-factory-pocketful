# Acceptance check — stage 4, round 3

- Product revision: eb6e37e3f5450d169b03ddabc7a0ef3ce11f7b37 (stage folders as at 6ab31ff)
- Suite revision: 16f6bb0 (`work/acceptance/`)
- Commands, from a detached worktree of eb6e37e (all four folders, because stage-1/..stage-3/
  changed for R8):
  - `run.sh <wt>/stage-4 4`, `run.sh <wt>/stage-3 3`, `run.sh <wt>/stage-2 2`, `run.sh <wt>/stage-1 1`
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164; stage 3, 72 / 72; stage 4, 41 / 41

## Status of the previous round's failing ids

Round 2 (236d7f8) had none. The suite still has none. The final review's R8 is covered by the
probes below.

## Counts

| Folder / suites | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stage-4, suites 1–4 | 1143 | 1143 | 0 | 0 |
| stage-3, suites 1–3 | 1050 | 1050 | 0 | 0 |
| stage-2, suites 1–2 | 858 | 858 | 0 | 0 |
| stage-1, suite 1 | 554 | 554 | 0 | 0 |

Supplied checks, `--stage 4 --mode isolated`, run twice: stages 1–4 pass both times, with
`claimed stage: 4`.

## Probes beyond the suite (R8)

Each folder's build ran in a container (`--cpus 2 --memory 2g`), through the HTTP API. Each folder
had one completed receipt on every idempotent route it has:
- stage-1: 5 routes;
- stage-2: 7 routes;
- stage-3: 8 routes;
- stage-4: 10 routes.

Operators: ada and cy.

| Edit to one receipt's scope in the export | stage-1 | stage-2 | stage-3 | stage-4 |
|---|---|---|---|---|
| moved to another user (dan, not a party or operator) | 422 on all 5 | 422 on all 7 | 422 on all 8 | 422 on all 10 |
| copied into another user's scope | 422 on all 5 | 422 on all 7 | 422 on all 8 | 422 on all 10 |
| copied under another key, same user (two receipts for one write) | 422 on all 5 | 422 on all 7 | 422 on all 8 | 422 on all 10 |
| unedited export: imports, then every route replays | 204; 200 ×5 | 204; 200 ×7 | 204; 200 ×8 | 204; 200 ×10 |

**Operator to operator.** The coordinator asked for this exactly. ada (op1) completes the write,
the export moves the receipt's scope user from `u_ada` to `u_cy` (op2), it is imported, and ada
sends the identical request with the same key again.

| Route | Folders | Import | ada's retry |
|---|---|---|---|
| `POST /settlements` | stage-1, stage-2, stage-3, stage-4 | **204** | **201: re-executes.** The settlement runs a second time and balances move again. |
| `POST /correction-batches` | stage-4 | **204** | **409 `stale_revision`.** No money moves, but the completed retry's 200 replay is lost. |

**Related observation.** Moving a receipt under another *key* of the same user also imports (204)
on every route in every folder. The original key's retry then executes again: `/payments` gives
201, and money moves again. The same body under the new key replays with 200.

**Assessment.** In both cases the edited state is self-consistent:
- No record says which operator executed a settlement or batch, or which key a write used.
- So "op2 made this settlement with key K" cannot be told apart from what really happened.
- Unless the service keeps that link in its records (the spec defines none), import has nothing to
  check it against.

Under the rules I therefore don't count these as failing requirement ids. If the coordinator wants
them refused, the fix is to record the initiating user (and key) with each settlement and batch,
and check the receipt against it on import. The ruling is the coordinator's. Every case that *can*
be checked (another user who is not a permitted caller, duplicated receipts) is refused on every
route in every folder.

## Failures

None counted (see the assessment above).

## Failing requirement ids

None.
