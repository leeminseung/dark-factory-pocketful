# Spec review of revision 16fff73 (stage 4)

**Result: no blocking findings.** I read every stage-4 sentence and checked each one against the code (the diff 4abf327..16fff73 under `stage-4/src`). I also ran the service and probed it live. `npm test` passes: 185/185.

## Findings

All three are non-blocking. Each sits where the requirement text leaves the behaviour open.

### N1. Duplicate payment ids are rejected before any item error is reported
- **Location:** `stage-4/src/handlers/corrections.js:63`, in `batchEntries`, which runs before `batchItem`.
- **Requirement (stage 4, Batch corrections):** "corrections contains 1..32 objects with distinct payment_ids, else 422 `validation_failed`." and "Error precedence is: item errors in input order, settlement completeness, …"
- **Evidence:** take a batch where item 1 names an unknown payment and items 2 and 3 share an id. It returns 422 `validation_failed`, not 404.
- **Not blocking:** the distinct-id rule reads as a rule about the batch's shape. The stage-1 settlements spec treats a malformed batch shape the same way ("malformed batch shape is 422 `validation_failed`"). The precedence list only orders item errors among themselves and against the later checks.

### N2. A non-string `payment_id` gives 422, not 400
- **Location:** `stage-4/src/handlers/corrections.js:69`.
- **Requirement (stage 1, §5):** "Reserve 400 `malformed_request` for a body that does not parse or a field of the wrong type." Against this, stage 3 Effective time says: "Invalid input is 422 `validation_failed`." and stage 4 says: "Every item has the ordinary correction fields and validation."
- **Evidence:** `{"corrections":[{"payment_id":5,…}]}` returns 422 `validation_failed` "payment_id must be a string".
- **Not blocking:** this follows the correction endpoint's own all-422 rule, as the existing correction fields already do. `payment_id` is the one field stage 4 adds, so its type rule is genuinely open.

### N3. The rule that settlement members share one effective instant is checked after completeness
- **Location:** `stage-4/src/handlers/corrections.js:89` (completeness) and `:93` (shared instant).
- **Requirement (stage 4):** "Members of one settlement must have identical effective instants (offset spellings may differ), else 422 `validation_failed`." The precedence sentence lists "item errors in input order, settlement completeness, resulting current available funds, then historical…" and does not mention this rule.
- **Evidence:** completeness is checked for every settlement first, then the shared instant. Both run after all item errors and before the funds checks.
- **Not blocking:** the spec does not place this rule in the order, and this placement is reasonable.

## Checked and found sound (code read and live probes on port 47611; stages 1–3 run on 47621–47623)

- **Who may refund, and the error cases:**
  - 404 for an unknown payment.
  - 403 for the sender or a third party.
  - 422 `validation_failed` for an amount of 0, a string, or a missing amount.
  - 400 without an idempotency key.
  - 422 `invalid_refund_target` for a refund of a refund.
- **Refund targets:** direct, request, capture, seeded and settlement payments can all be refunded.
- **Refund cap:**
  - The cumulative cap uses the current corrected amount, and 422 `refund_exceeds_payment` holds after a correction.
  - 10 concurrent refunds stopped exactly at the cap.
- **Refund shape:**
  - `refund_of` names the target; `request_id`, `authorization_id` and `settlement_id` are null.
  - Note and visibility are copied from the target.
  - The refund is 201 and its replay 200 with an identical body.
  - Every other payment, the feed and statements carry `refund_of: null`.
- **Refunds and money:**
  - Funds come from available: 409 `insufficient_funds` when they are held.
  - A refund leaves a request `paid` and an authorization `captured`, restores no hold, and does not change settlement membership. A settlement retry still returns its original body.
- **Corrections after stage 4:**
  - Captures and refunds give 422 `linked_payment_immutable`, both in single corrections and in batches.
  - Reducing a payment below its refunded amount gives 422 `refund_exceeds_payment`, again both in single corrections and in batches.
  - Correction debits are checked against available.
  - A single correction of a settlement member is still rejected; nonmembers can still be corrected singly.
- **Batch permissions and size:** 401 without a token, 403 for a non-operator; 422 for 0 items, 33 items, or duplicate ids.
- **Batch errors:**
  - 404 and `stale_revision` work.
  - Item errors come in input order (404 then 422, and 422 then 404 were both right).
  - `incomplete_settlement` works.
  - Different instants are rejected, while different offset spellings of the same instant are accepted, including sub-millisecond digits.
  - A future `effective_at` gives 422.
  - `insufficient_funds` is checked before `historical_overdraft`.
- **Combined effect:** affordability is judged on the combined effect, both for current funds and for history. One batch was accepted only because its items offset each other; one was correctly rejected with `historical_overdraft`.
- **Rejected batches:** history is unchanged and the idempotency key is reusable afterwards.
- **Batch response:**
  - `correction_batch_id`, a shared `recorded_at`, and `revisions` in input order.
  - Each revision carries `correction_batch_id`.
  - `recorded_at` is strictly later than every member's previous one.
- **Batch replay and receipts:** replay is 200; a changed body is 409. Original payments, settlement retries and activity are unchanged.
- **Statements and history after a batch:**
  - New statements show the new revisions.
  - An earlier snapshot pages identically after a batch and a refund.
  - A `known_at` before the batch shows the earlier view.
- **Concurrency:** 20 concurrent single and batch corrections sharing an expected revision produced exactly one 201. The rest got `stale_revision`.
- **Import from earlier stages:**
  - Live exports from stages 1, 2 and 3 import and keep payment, settlement and correction replays, holds, and stage-3 snapshots (identical apart from the required added `refund_of: null`).
  - Imported settlements can then be batch-corrected and imported payments refunded.
  - Stage 4 re-imports its own export.
- **Earlier stages still hold:** stage-3 sub-millisecond `created_at` and `effective_at` keep every digit, including in statement windows, and same-millisecond ordering is unchanged.

## Housekeeping

- I stopped all four services I started (PIDs 88498, 89517, 89519, 89521) by PID.
- I wrote only to `/tmp/rv16`; nothing in the worktree was changed and I made no commits. `git status` shows `stage-*` clean.
- `git status` does list many `work/**` files as deleted in the worktree (`/Users/mslee/dark-factory/band-work/worktrees/reviewer-16fff73`). I did not touch them; those deletions predate this review.
