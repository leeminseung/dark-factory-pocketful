## Black-box probe of 236d7f8, stage 4 (http://127.0.0.1:50138)

I found one blocking finding. It was already there in stage 1, so it is not a stage-4 regression. I also have one non-blocking observation that needs a ruling, and one minor note. All four containers stayed healthy, nothing was restarted, and I removed my temporary files (/tmp/probe236 and /tmp/pw236).

### F1. Import accepts an export whose idempotency receipt was moved to a non-operator (blocking)

**Rows:** S4-037 / S1-158 / S1-186. The requirement says: "missing fields, wrong track/version or an invalid state give 422 `validation_failed` without changing the destination". The rule also covers the case-memory entry "Edit any single field of a stored idempotency receipt in an export (ids, …): import must refuse it".

**Steps:**
1. Reset with operator `u_op`.
2. As `op`, `POST /correction-batches` with `Idempotency-Key: bk1` and a two-member settlement batch. It returns 201.
3. `GET /_test/export`.
4. In `state.idempotency`, find the `/correction-batches` receipt. Change `"u_op"` to `"u_ada"` in its `scope`. `u_ada` is not an operator.
5. `POST /_test/import` with the edited document.

**Expected:** 422 `validation_failed`. A completed batch receipt held by a non-operator is a state the service can never produce. For comparison, the same kind of edit on a refund receipt (scope user changed to `u_cy`) is refused with 422.

**Actual:**
- The import returns 204.
- `op` repeats the identical request with key `bk1` and gets 409 `stale_revision`. With the unedited import the same request replays with 200, so `op` has silently lost a completed retry.
- `ada` gets 403 if she sends that key and body.

The same edit on a `/settlements` receipt is also accepted (204) by the stage-4 build and by the stage-1, stage-2 and stage-3 builds.

**Why blocking:** the import accepts an invalid state that it should refuse with 422, and a completed retry stops working afterwards. This contradicts S1-161/S1-164 ("all completed idempotent request bodies and original responses" must survive).

### O1. Import accepts a service clock ahead of real time, so new records are stamped in the future (non-blocking, needs a ruling)

**Rows:** S3-002 ("`created_at` … identifying when it moved money"), S4-030 ("Effective times cannot be later than now"), S3-072, and the case-memory entry S3-R13 ("new records must not be stamped in the future").

**Steps:**
1. Export the state.
2. Set `state.last_timestamp_ms` to real now + 1 h, or + 1 year.
3. Import it. It returns 204. The stage-1 and stage-3 exports edited the same way also import.

**What follows:**
- New payments, refunds and batches get `created_at` / `recorded_at` an hour (or a year, e.g. 2027-10-06) ahead of real time.
- A batch or single correction with `effective_at` = real now + 30 min is accepted with 201.
- An imported payment stamped +1 h, together with a clock at +1 h, is accepted. After that, `GET /me?as_of=<real now>` (99995) differs from current `/me` (99989).
- The stage-3 build behaves the same way.

**Why not blocking:** the requirement text does not say an imported clock ahead of real time is invalid. The earlier fixed-bound ruling (max clock 9899-12-30, S3-074) and case memory S2-R10/S2-R11 deliberately avoid bounds that depend on the current time. A ruling should decide whether this should be refused.

### Minor note (non-blocking)

An export with a 300-character snapshot token imports and the token still works. Snapshot tokens have no stated length rule (the 64-character limit is for IDs), so this is not a requirement break.

### Rows probed and found sound

- **S4-002, S4-003, S4-009 (keys and replay).** Checked:
  - missing, empty and 256-character keys;
  - replays return 200 with the identical body, also after a full refund;
  - a different body (including an invalid or wrong-type body, or an added unknown field) gives 409 `idempotency_key_reuse`;
  - keys are per user and per path;
  - key order, whitespace and `8e2`/`1.0` spellings replay;
  - 30 or 20 concurrent requests with one key give exactly one 201;
  - path spelling variants replay rather than act again: trailing slash, percent-encoded id, `//`, `/./`, a query string. This holds for refunds, batches and corrections.
- **S4-004 to S4-007 (refund permission, targets, amounts, cap).**
  - Permissions: sender, third party and operator get 403; an unknown payment is 404; no token is 401.
  - Targets: direct, request and capture payments (final and non-final) can be refunded. A refund of a refund gives `invalid_refund_target`.
  - Amounts: 0, -1, 1.5, "1", true, null, arrays and 1000000001 are refused with 422. So are near-integers sent as raw JSON (1.0000000000000001, 1000000000.0000000001) and 2^53+1. `1e2`, `100.0` and `100e-2` are accepted. NaN and unparseable bodies give 400.
  - Cap: refunds add up against the corrected amount, which moves up and down with corrections. A payment corrected to 0 refunds nothing. 30 parallel refunds never exceed the cap.
- **S4-008, S4-012, S4-041 (refund shape and history).** Refunds carry `refund_of`, `request_id: null`, `authorization_id: null`, `settlement_id: null`, and the original note (emoji/HTML verbatim) and visibility. Every other payment has `refund_of: null`. A refund has revision 1, counts in `as_of` and statements, and stays in creation order when created in the same millisecond (30-loop check).
- **S4-010, S4-011 (funds and side effects).** Refunds are judged against available funds: a hold leads to 409. A refund racing an outgoing payment never goes negative. A refunded request stays paid. A refunded capture does not reopen the hold or restore the authorization's remainder.
- **S4-013 to S4-015, S4-040 (corrections around refunds).** Captures and refunds are `linked_payment_immutable`. A correction below the refunded amount is 422 `refund_exceeds_payment`, ranked as an item error in input order. Correction and batch debits are checked against available. A historical overdraft through a refund timeline is caught.
- **S4-016 to S4-033 (batches).** Checked:
  - access: 401 before 403 before key checks;
  - shape: 0 or 33 items, duplicates, non-object items;
  - every field's types and bounds, including emoji reason length and calendar-invalid dates;
  - instants before 1970, year 0000, sub-millisecond, and offsets crossing midnight;
  - errors: unknown 404, stale 409, completeness, member instants (sub-millisecond differences refused, offset spellings accepted);
  - precedence: item errors in input order, then completeness, then funds, then history (total and available through a hold);
  - combined affordability, including against available;
  - a rejected batch changes nothing and its key stays reusable;
  - one shared `recorded_at`, strictly later than the previous revision even when written in the same millisecond (40 loops);
  - future `effective_at` refused;
  - original payment and settlement replays, the activity feed and old snapshots are unchanged;
  - unknown fields are ignored.
- **S4-034, S4-035, S4-038 (settlement refunds and concurrency).** Refunding a member leaves membership unchanged. Concurrent batches, batch against single correction, overlapping batches, and batch against refund: at most one succeeds.
- **S4-036, S4-037, S4-039 (export/import).**
  - Real stage-1, 2 and 3 exports import with tokens, balances, settlement membership, replays (settlement, payment, split, capture, correction), open holds and snapshots intact. Stage-4 operations then work on them.
  - A stage-4 round trip keeps refunds, batch ids, receipts, snapshots (bound to their owner, and frozen through later writes) and the refund caps.
  - 71 of 73 edited-export cases are refused with 422 and leave the destination unchanged: links, parties, amounts, revisions, batch splits, receipt fields, fingerprints, scopes, snapshot fields, ids over 64 characters, and stripped newer-stage keys. The two that were not refused are F1 and the minor note above.
  - The stage-1, 2 and 3 exports with edited ids, emails, epochs, 2^53+1, shares or links are also refused.
- **Limits** (S1-012, S1-013, S1-073, S3-R2, S3-R1).
  - With 20,000 seeded payments, including sub-millisecond times: reset takes 0.4 s, export 0.2 s (9.5 MB), import 0.3 s.
  - 50 in flight: 300 disjoint 32-item batches finish with a maximum of 3.5 s; a mixed load of refunds, batches, statements, payments and corrections maxes at 2.9 s.
  - 6,000 statement reads at 50 in flight: p99 0.54 s.
  - Reset of 1,500 users with distinct passwords takes 2.3 s, and a login sent during it answers in 0.03 s.
  - Memory stayed at about 108 MiB after 2,000 snapshots. The clock did not drift.
  - There was a startup latency tail of 2–9 s, but it only appeared when the load generator opened 50 connections at once, and it was not reproducible with `Connection: close`. I put it down to the client and network, not the service.
- **Stage-2 screens** (S2-031, S2-039 to S2-050, S2-018, S2-R1, S2-R15, paging).
  - Refunds in the feed keep `activity-item`/`data-visibility`, parties with both handles, the exact amount and the exact note (an empty note is present), newest first, and third-party privacy.
  - No horizontal scroll at 375 px with refunds, or at the largest legal balance in JPY, BHD and EUR.
  - The feed shows all 261 items, past one 200-item page.
  - Pay form:
    - a double submit pays once;
    - editing a field and changing it back sends a new key;
    - a lost response shows `pay-uncertain`, and the retry uses the same key and moves money once;
    - `wallet-refresh` shows a refund made elsewhere and keeps the form;
    - invalid amounts (15.005, abc, 1e3, empty) are refused without a request.
  - A refunded request shows as paid with no pay button. Authorizations with a refunded capture show correctly at 375 px.
- **Other regressions checked.** A fixture's undefined fields (`refund_of`, `settlement_id` on a seeded payment) are ignored. Statement `from` later than `to` is 422. Snapshot parameter rules hold (from/to with a snapshot, limits, offset past the end, another user's token, token from before reset).
