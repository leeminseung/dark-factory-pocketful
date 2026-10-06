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
| S4-001 | "All requirements from stages 1–3 continue to apply." | stage | the whole stage-1..3 suites (run.sh runs suites 1..N against the stage-N build) | tested |
| S4-002 | "There are ten idempotent write paths: stage 1's five, authorizations and captures from stage 2, corrections from stage 3, and refunds and correction batches in this stage." | idempotency | test_batches.py::test_batch_access<br>test_refunds.py::test_refund_key_and_replay | tested |

## Refunds

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S4-003 | "`POST /payments/{payment_id}/refunds`, body `{"amount": 200}`, requires an idempotency key." | refunds | test_refunds.py::test_refund_is_a_reverse_payment<br>test_refunds.py::test_refund_key_and_replay | tested |
| S4-004 | "Only the original receiver may refund, else 403 `forbidden`; unknown payment is 404." | refunds | test_refunds.py::test_only_the_receiver_refunds | tested |
| S4-005 | "The target may be a direct payment, request payment or capture, but never a refund." "Refunds of refunds give 422 `invalid_refund_target`." | refunds | test_refunds.py::test_refund_targets | tested |
| S4-006 | "Invalid amount is 422 `validation_failed`." (decision D4-1) | refunds | test_refunds.py::test_refund_amount_above_maximum<br>test_refunds.py::test_refund_amount_rules | tested |
| S4-007 | "Refunds cumulatively may not exceed the payment's current corrected amount: 422 `refund_exceeds_payment`." | refunds | test_import4.py::test_edited_refund_above_payment<br>test_refunds.py::test_cumulative_refunds<br>test_refunds.py::test_refund_amount_above_maximum<br>test_refunds.py::test_refund_limit_follows_corrections | tested |
| S4-008 | "A refund is a new payment in the opposite direction, with `refund_of` naming the target, `request_id: null`, `authorization_id: null`, and the original note/visibility. Return 201 with that payment" | refunds | test_refunds.py::test_refund_is_a_reverse_payment<br>test_standing.py::test_clock_does_not_run_ahead_after_many_reads<br>test_standing.py::test_same_millisecond_writes_keep_creation_order | tested |
| S4-009 | "replay returns 200 with the original body." | refunds | test_refunds.py::test_refund_key_and_replay | tested |
| S4-010 | "It moves existing money from the receiver's **available** funds, or fails 409 `insufficient_funds`, atomically." | refunds | test_refunds.py::test_concurrent_refunds_never_exceed<br>test_refunds.py::test_refund_from_available_funds | tested |
| S4-011 | "Refunds never reopen a request or authorization or restore a released hold." | refunds | test_refunds.py::test_refunds_reopen_nothing | tested |
| S4-012 | "Other payments have `refund_of: null`." | refunds | test_refunds.py::test_other_payments_have_refund_of_null | tested |
| S4-013 | "Stage-3 corrections remain available for ordinary direct/request payments. Captures and refund payments cannot themselves be corrected: 422 `linked_payment_immutable`." | corrections | test_refunds.py::test_refunds_and_captures_cannot_be_corrected | tested |
| S4-014 | "A correction cannot reduce a payment below its already-refunded amount: 422 `refund_exceeds_payment`." | corrections | test_refunds.py::test_refund_limit_follows_corrections | tested |
| S4-015 | "Correction debits are checked against available funds." | corrections | test_refunds.py::test_correction_debit_against_available | tested |

## Batch corrections

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S4-016 | "`POST /correction-batches` requires a settlement operator and an idempotency key, with the same 401/403 rules as settlements." | batches | test_batches.py::test_batch_access | tested |
| S4-017 | "corrections contains 1..32 objects with distinct payment_ids, else 422 `validation_failed`." | batches | test_batches.py::test_batch_of_32<br>test_batches.py::test_batch_shape_errors | tested |
| S4-018 | "Every item has the ordinary correction fields and validation." | batches | test_batches.py::test_batch_item_validation<br>test_batches.py::test_batch_item_wrong_types<br>test_standing.py::test_batch_sub_millisecond_effective_at | tested |
| S4-019 | "Unknown payment is 404; a stale expected revision is 409 `stale_revision`." | batches | test_batches.py::test_batch_unknown_and_stale | tested |
| S4-020 | "The operator may correct ordinary, request and settlement payments" (of any wallets, decision D4-4) | batches | test_batches.py::test_batch_shape<br>test_batches.py::test_settlement_correction_needs_every_member | tested |
| S4-021 | "but captures and refunds remain immutable." (422 `linked_payment_immutable`) | batches | test_batches.py::test_batch_cannot_touch_captures_or_refunds | tested |
| S4-022 | "Correcting any settlement member requires including every member of that settlement, else 422 `incomplete_settlement`." | batches | test_batches.py::test_completeness_before_funds<br>test_batches.py::test_item_errors_before_completeness<br>test_batches.py::test_refunds_do_not_join_settlements<br>test_batches.py::test_settlement_correction_needs_every_member | tested |
| S4-023 | "Members of one settlement must have identical effective instants (offset spellings may differ), else 422 `validation_failed`." | batches | test_batches.py::test_members_share_one_effective_instant | tested |
| S4-024 | "Ordinary single-payment corrections remain available for nonmembers." (a member by single correction stays 422 `linked_payment_immutable`, D4-5) | batches | test_batches.py::test_single_corrections_and_members | tested |
| S4-025 | "Unknown fields are ignored." | batches | test_batches.py::test_batch_unknown_fields_ignored | tested |
| S4-026 | "Error precedence is: item errors in input order, settlement completeness, resulting current available funds, then historical total and available funds at every effective/event boundary." | batches | test_batches.py::test_completeness_before_funds<br>test_batches.py::test_funds_before_history<br>test_batches.py::test_item_errors_before_completeness<br>test_batches.py::test_item_errors_in_input_order | tested |
| S4-027 | "Affordability is determined by the combined effect of all proposed revisions." | batches | test_batches.py::test_combined_affordability<br>test_batches.py::test_funds_before_history | tested |
| S4-028 | "A rejected batch leaves history, balances and idempotency records unchanged." | batches | test_batches.py::test_rejected_batch_changes_nothing | tested |
| S4-029 | "Return 201 with `correction_batch_id`, `recorded_at` and `revisions` in input order. All new revisions share recorded_at, strictly later than the previous recorded_at of every member; each revision also exposes correction_batch_id." | batches | test_batches.py::test_batch_shape<br>test_import4.py::test_edited_batch_recorded_at_split | tested |
| S4-030 | "Effective times cannot be later than now." | batches | test_batches.py::test_batch_item_validation | tested |
| S4-031 | "Original payments and receipts never change. Original payment and settlement retries return their original bodies." | batches | test_batches.py::test_originals_and_replays | tested |
| S4-032 | "New statements reflect the new revisions; earlier snapshot tokens continue to page their frozen entries." | batches | test_batches.py::test_statements_and_snapshots_after_batch | tested |
| S4-033 | "Replays return the original batch response with 200. This adds one idempotent write path." | batches | test_batches.py::test_originals_and_replays | tested |
| S4-034 | "A settlement payment may be refunded under the existing refund rules, but refunds never change settlement membership." | settlements | test_batches.py::test_refunds_do_not_join_settlements<br>test_refunds.py::test_settlement_member_refund | tested |
| S4-035 | "Concurrent corrections sharing any expected payment revision cannot both succeed." | concurrency | test_batches.py::test_batches_on_a_large_history_within_limits<br>test_batches.py::test_concurrent_batches_share_a_revision | tested |
| S4-036 | "A stage-4 service must accept exports produced by the same team's stages 1–3, retaining settlement membership, corrections and snapshots." | import | test_import4.py::test_earlier_exports_import | tested |
| S4-037 | §10 continues to apply to the new state: export/import keeps refunds (`refund_of`), batches (`correction_batch_id`, shared `recorded_at`) and their receipts and replays; edited exports breaking them are 422 | import | test_import4.py::test_edited_batch_recorded_at_split<br>test_import4.py::test_edited_receipts_new_routes<br>test_import4.py::test_edited_refund_above_payment<br>test_import4.py::test_edited_refund_of_unknown<br>test_import4.py::test_refunds_and_batches_survive_import | tested |

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

## Validity check (stage 4)

The stage-4 suite was run against a build of the accepted stage-3 revision 0eaae4d (`stage-3/`, in a
worktree), with `work/acceptance/run.sh <worktree>/stage-3 4 -k stage_4`.

- 83 tests: 70 failed, 9 errors, 1 skipped (the stage-3 export test needs a stage-3 service next to
  a stage-4 one) and 3 passed.
- `test_batch_item_wrong_types[payment_id-5]` passed because it also accepted 404, which the
  missing endpoint gives. It now accepts only 400 or 422, and fails there.
- The other 2 check behaviour this stage leaves unchanged, and are kept:
  - `test_single_corrections_and_members` (S4-024 / S3-054): members are still
    `linked_payment_immutable` for single corrections;
  - `test_correction_debit_against_available` (S4-015 / S3-070): already a stage-3 rule.
