# Stage 4 — requirement list

Source: `pocketful/spec/stage-4.md` (read-only), building on stages 1–3. One row per testable
requirement. Status values: open, tested, passing, failing, disputed, not testable (with the
reason). Tests are named `file::function` under `work/acceptance/tests/stage_4/`.

## Earlier rows this stage changes

All earlier rows still apply. The stage-1..3 suites run against every stage-4 build.

| Earlier row | Change in stage 4 | Covered by |
|---|---|---|
| S1-084, S2-089, S3-069 | ten idempotent write paths (refunds, correction batches) | S4-002 |
| S1-096, S2-113 | payments carry `refund_of` | S4-012 |
| S3-025, S3-055 | refund payments, like captures, cannot be corrected | S4-013 |
| S3-054 | settlement members can now be corrected, but only by an operator's batch holding every member | S4-020, S4-022, S4-024 |
| S3-034, S3-070 | correction debits checked against available; a correction may not go below the refunded amount | S4-014, S4-015 |
| S3-056, S3-068 | stage-1..3 exports import; refunds and batches join export/import | S4-036, S4-037 |

## Paths

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S4-001 | "All requirements from stages 1–3 continue to apply." | stage | | open |
| S4-002 | "There are ten idempotent write paths: stage 1's five, authorizations and captures from stage 2, corrections from stage 3, and refunds and correction batches in this stage." | idempotency | | open |

## Refunds

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S4-003 | "`POST /payments/{payment_id}/refunds`, body `{"amount": 200}`, requires an idempotency key." | refunds | | open |
| S4-004 | "Only the original receiver may refund, else 403 `forbidden`; unknown payment is 404." | refunds | | open |
| S4-005 | "The target may be a direct payment, request payment or capture, but never a refund." "Refunds of refunds give 422 `invalid_refund_target`." | refunds | | open |
| S4-006 | "Invalid amount is 422 `validation_failed`." (decision D4-1) | refunds | | open |
| S4-007 | "Refunds cumulatively may not exceed the payment's current corrected amount: 422 `refund_exceeds_payment`." | refunds | | open |
| S4-008 | "A refund is a new payment in the opposite direction, with `refund_of` naming the target, `request_id: null`, `authorization_id: null`, and the original note/visibility. Return 201 with that payment" | refunds | | open |
| S4-009 | "replay returns 200 with the original body." | refunds | | open |
| S4-010 | "It moves existing money from the receiver's **available** funds, or fails 409 `insufficient_funds`, atomically." | refunds | | open |
| S4-011 | "Refunds never reopen a request or authorization or restore a released hold." | refunds | | open |
| S4-012 | "Other payments have `refund_of: null`." | refunds | | open |
| S4-013 | "Stage-3 corrections remain available for ordinary direct/request payments. Captures and refund payments cannot themselves be corrected: 422 `linked_payment_immutable`." | corrections | | open |
| S4-014 | "A correction cannot reduce a payment below its already-refunded amount: 422 `refund_exceeds_payment`." | corrections | | open |
| S4-015 | "Correction debits are checked against available funds." | corrections | | open |

## Batch corrections

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S4-016 | "`POST /correction-batches` requires a settlement operator and an idempotency key, with the same 401/403 rules as settlements." | batches | | open |
| S4-017 | "corrections contains 1..32 objects with distinct payment_ids, else 422 `validation_failed`." | batches | | open |
| S4-018 | "Every item has the ordinary correction fields and validation." | batches | | open |
| S4-019 | "Unknown payment is 404; a stale expected revision is 409 `stale_revision`." | batches | | open |
| S4-020 | "The operator may correct ordinary, request and settlement payments" (of any wallets, decision D4-4) | batches | | open |
| S4-021 | "but captures and refunds remain immutable." (422 `linked_payment_immutable`) | batches | | open |
| S4-022 | "Correcting any settlement member requires including every member of that settlement, else 422 `incomplete_settlement`." | batches | | open |
| S4-023 | "Members of one settlement must have identical effective instants (offset spellings may differ), else 422 `validation_failed`." | batches | | open |
| S4-024 | "Ordinary single-payment corrections remain available for nonmembers." (a member by single correction stays 422 `linked_payment_immutable`, D4-5) | batches | | open |
| S4-025 | "Unknown fields are ignored." | batches | | open |
| S4-026 | "Error precedence is: item errors in input order, settlement completeness, resulting current available funds, then historical total and available funds at every effective/event boundary." | batches | | open |
| S4-027 | "Affordability is determined by the combined effect of all proposed revisions." | batches | | open |
| S4-028 | "A rejected batch leaves history, balances and idempotency records unchanged." | batches | | open |
| S4-029 | "Return 201 with `correction_batch_id`, `recorded_at` and `revisions` in input order. All new revisions share recorded_at, strictly later than the previous recorded_at of every member; each revision also exposes correction_batch_id." | batches | | open |
| S4-030 | "Effective times cannot be later than now." | batches | | open |
| S4-031 | "Original payments and receipts never change. Original payment and settlement retries return their original bodies." | batches | | open |
| S4-032 | "New statements reflect the new revisions; earlier snapshot tokens continue to page their frozen entries." | batches | | open |
| S4-033 | "Replays return the original batch response with 200. This adds one idempotent write path." | batches | | open |
| S4-034 | "A settlement payment may be refunded under the existing refund rules, but refunds never change settlement membership." | settlements | | open |
| S4-035 | "Concurrent corrections sharing any expected payment revision cannot both succeed." | concurrency | | open |
| S4-036 | "A stage-4 service must accept exports produced by the same team's stages 1–3, retaining settlement membership, corrections and snapshots." | import | | open |
| S4-037 | §10 continues to apply to the new state: export/import keeps refunds (`refund_of`), batches (`correction_batch_id`, shared `recorded_at`) and their receipts and replays; edited exports breaking them are 422 | import | | open |

## Decisions (test-designer, stage 4)

Decisions from stages 1–3 still apply.

- **D4-1 Refund amount.** A refund `amount` follows the ordinary payment amount rules: an
  integer 1..1000000000, with strings and booleans refused. Anything else is 422
  `validation_failed`, and an amount above the refundable remainder is 422
  `refund_exceeds_payment`.
- **D4-2 Refunds are payments.** A refund appears in the feed by the ordinary visibility rule,
  using the target's visibility, and on both parties' statements, with its own `created_at`.
- **D4-3 Members after a refund.** Refunding a settlement member does not make the refund a
  member. A batch that corrects the settlement still names exactly the original members. The
  refund carries `settlement_id: null`.
- **D4-4 Operator scope.** As with settlements, an operator's batch may correct payments between
  any wallets, including payments the operator is not a party to.
- **D4-5 Single corrections of members.** A settlement member stays 422 `linked_payment_immutable`
  for `POST /payments/{id}/corrections`. Only a batch can correct members.
- **D4-6 Wrong JSON types.** As in D3-8, a wrong-type field in a refund or batch item gives
  400 or 422. `amount` gets 422, by §5's endpoint rule.
- **D4-7 Precedence.** Tests check only the orders the text states: item errors in input order,
  then completeness, then current available funds, then history.
