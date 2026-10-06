# Stage 4 — implementer notes

The stage-1 to stage-3 notes still apply to everything stage 4 did not change.

## Design decisions

- **One correction gate** (`State.correctPayments`). A single correction is a batch of one with
  no batch id. In order, the gate:
  1. checks each item's own rules (State.checkCorrection, R2): not immutable for this kind of
     correction (linked_payment_immutable), expected_revision current (stale_revision), the new
     amount at least what was refunded (refund_exceeds_payment);
  2. for a batch, checks every touched settlement complete (incomplete_settlement) and at one
     effective instant, compared on the exact instant key (validation_failed);
  3. nets every difference per wallet and refuses with insufficient_funds when any wallet's
     available would go negative (S4-015, S4-027);
  4. records every revision at one instant, strictly after each payment's previous revision;
  5. checks each party's history with one firstOverdraft pass per party (historical_overdraft),
     so a batch costs at most 64 passes over the payments.
- **The stated order** (S4-026). The handler checks the batch's shape first: an array of 1..32
  objects with distinct string payment_ids. It then reads each item in input order: its fields
  (422), the payment exists (404), then State.checkCorrection. Field checks come before the
  lookup, as for stage-3 single corrections. The gate repeats checkCorrection (no caller can skip
  it), then goes on to completeness, funds and history.

  Completeness is checked for every settlement before any instant check, because the instant
  rule is about "members of one settlement", which only makes sense once all members are there.
- **Refund checks in order:** 404 → 403 (not the receiver) → 422 invalid_refund_target (a refund)
  → 422 validation_failed (amount) → 422 refund_exceeds_payment → 409 insufficient_funds. The
  checks on the resource come before the amount, so a refund of a refund is
  invalid_refund_target whatever amount it names.
- **Refunds need no historical check.** A refund is a new payment at now, and nothing happens
  after now in the history: effective times are at most now, and a hold ending later only raises
  available. So the movePayments check against available now is the whole rule.
- **A refunded total per payment** (`State.refundedBy`) is kept by addPayment, so the limit is a
  map lookup. It follows the payments: import rebuilds it, and a transaction undoes it.
- **Correction batches are their revisions.** No separate batch record exists: a batch is the
  revisions that carry its `correction_batch_id`, in recording order, which is input order. The
  validator and the replay rule rebuild batches from the revisions, and export carries only the
  field on each revision. So a batch cannot disagree with its revisions.
- **Settlement members** are corrected only through a batch (D4-5). In the records, a member's
  corrections must all carry a batch id, and that batch must hold every member at one effective
  instant.
- **Export generations.** A stage-4 export has `refund_of` on every payment and
  `correction_batch_id` on every revision. An export with none of them, and no refund or batch
  receipt, is from stage 1 to 3: no refunds and no batches. Removing one of them from a stage-4
  export makes it invalid (422), not an older export.
- **Older receipts.** Receipts from stage 3 and earlier have no `refund_of` or
  `correction_batch_id`. They match their records when the value is null (LATER_FIELDS), and a
  replay returns them unchanged.

## Carried risks

- S3-RISK-1 (a write in the same millisecond at the clock bound joining a later snapshot) is
  closed. Since stage-3 R13 a snapshot's watermark is a recording number, so any later write has
  a higher number and stays out, at any clock value.

## Unfixed non-blocking findings

- R5, R7: no change, as ruled. The stated precedence covers item errors, completeness, funds and
  history. Distinct payment_ids is a rule about the batch's shape, checked first. The same-instant
  rule is checked after completeness, as above.
- R6: no change (D4-6). A wrong JSON type in a refund or batch item may be 400 or 422; amount is
  422 by §5's endpoint rule.
- R8 residual: a settlement or batch record does not say which operator made it, and stage-1 to
  stage-3 exports could not say so either. So a receipt moved from one operator's scope to another
  operator's still imports. A receipt moved to a non-operator, or copied so that two receipts name
  one record, is 422 (stage-1/ to stage-4/).
- R11: no change, as ruled. An imported clock ahead of real time is valid under the fixed-bound
  ruling.
- R12: fixed in stage-4/ only. stage-3/ is left as accepted, because no stated rule bounds a token's
  length.
