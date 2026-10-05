# Stage 2 — decisions

## Plan

- Task: Pocketful stage 2 — wallet screens (/, /requests, /split, /signup, /login, /authorizations) and payment
  authorizations (holds, captures incl. extended mode, void, expiry), stage-1 export upgrade, competing clients.
- Requirements: pocketful/spec/stage-1.md and stage-2.md (read-only); supplied checks: pocketful/test/stage_1/ and stage_2/.
- Base: stage 1 accepted at 56fce5868ae6942324cb86d3a6ccc9372dadccf4; `stage-2/` starts from its `stage-1/`.
- Seats engaged: implementer, test-designer, product-designer (screens added), reviewer (round-1 review, final review).
- Order: implementer builds the API parts first while test-designer writes the list and product-designer writes
  work/design.md -> coordinator checks the list -> design direction to implementer -> screens -> suite ready ->
  rounds (acceptance + screen review of every screen in round 1 + reviewer round-1 review) -> final review
  (`--all --mode isolated`) -> accept, final screenshots by product-designer.
- Handoff sent 2026-10-06 to implementer, test-designer and product-designer in 5 numbered parts (full stage-2 spec
  pasted; carry-forward S1-RISK-1, S1-R17, S1-R19/R21 and watch items in part 4).
- List check (6a7fcaf, 160 rows): asked test-designer for 4 rows — void unknown id 404; GET /authorizations query
  errors; seeded authorization validation (reset and import, 422 changing nothing); upgrade import carries ttl (stage-1
  export -> 600 and empty list; stage-2 export keeps ttl).
- Design direction work/design.md (1af11a0) sent to implementer with summary; screens may start.
- Suite ready cd1c47b; list complete at 164 rows (S2-165..S2-168 in 7c802f1); suite now 47edfcf (858 tests: 554
  stage-1 + 304 stage-2). Command `work/acceptance/run.sh stage-2 2`. Validity check recorded in the list.

## Rounds
- Round 1 started: product 7364e79 (stage-2 = 65a2726); suite 47edfcf (test-designer to fix the `auths` fixture setup
  that over-authorizes bob, 4 setup errors); acceptance check, full screen review, reviewer round-1 review requested.
- Round 1: product 7364e79, suite ba66344 (858/858; work/reviews/acceptance-7364e79.md). Screen review pass, 0 blocking,
  D1-D11 non-blocking (work/reviews/design-7364e79.md). Round-1 review work/reviews/review-7364e79-round1.md (standards +
  spec briefs/raw present): R1 (ruled blocking), R2 blocking, R3-R9 non-blocking. Count 0; reviewer blocking R1, R2 ->
  round 2; sent R1-R9 and D1-D11 to implementer.
- Round 2 started: product 8c3360d (stage-2 = 1b1322f), suite ba66344; acceptance check + screen review of touched
  screens and D1-D11.
- Round 2: product 8c3360d, suite ba66344 (858/858). Screens pass, 0 blocking, D12 new non-blocking
  (work/reviews/design-8c3360d.md). Probes fail S2-102 (F1: at TTLs near the accepted bound, later authorizations get
  expires_at clamped to 9999-12-31T23:59:59.999, not created_at + ttl; work/reviews/acceptance-8c3360d.md). Count 1 vs
  previous 0 -> did not fall -> loop stopped; final review on 8c3360d.
- Final review of 8c3360d: CHANGES NEEDED, blocking 7 (R10-R15 + S2-102); work/reviews/review-8c3360d-final.md
  (fix-commit + probe briefs/raw listed; supplied --all --mode isolated pass 1-2, fail 3, claimed 2). R1, R3-R7, R9 fixed;
  R8 history; R2 -> R10/R11. Sent R10-R23 + D12 to implementer; rounds continue from 3 without reviewer, compared with 7.
- Round 3 started: product 61246ed (stage folders = 7c61450; stage-1/ changed in 3c0ba8f for R14 — carried-forward
  defect fixed in every stage folder that carries it), suite ba66344 on stage-1 and stage-2; touched screens + D12.
- Round 3: product 61246ed, suite ba66344: stage-2 858/858, stage-1 554/554; screens pass, 0 blocking
  (work/reviews/design-61246ed.md). Probes fail S1-158 + S2-158 (F2: edited receipt fields — request status, split/
  authorization note, authorization status — import with 204; work/reviews/acceptance-61246ed.md). Count 2 vs 7 at
  rejection -> fell; round 4 with F2.
- Round 4 started: product 04f3ca4 (stage folders = 2c1be66; both changed for F2), suite ba66344 on both folders;
  no screens touched, so no screen review.
- Round 4: product 04f3ca4, suite ba66344: stage-2 858/858, stage-1 554/554; probes 106 receipt edits refused, 59
  legitimate later states replay, stage-1 upgrade OK (work/reviews/acceptance-04f3ca4.md). Failing ids 0; no new
  non-blocking -> re-review of 04f3ca4.
- Re-review of 04f3ca4: PASS, blocking 0 (work/reviews/review-04f3ca4-recheck.md, 306fe60). R10-R15, S2-102 fixed;
  supplied --all --mode isolated: stage-1/ claims 1; stage-2/ passes 1-2, fails 3, claims 2. stage-1/ change (R14) checked.

## Rulings
- R1 (round 1, pay form changed and changed back after a confirmed payment replays it): BLOCKING. Text: "Submitting it
  again without changing a field must not send another payment" / "Changing a field makes the next submission a new
  payment request." Most literal reading: the act of changing a field (not a net difference of values) makes the next
  submission new. The only text that keeps an old key across edits is the uncertain-outcome rule, "Keep the unchanged
  form retryable with the **same key and body**. ... Unknown outcomes are not confirmed rejections." So: while an
  outcome is unknown, a form restored to the sent body reuses its key (S2-074 edit-then-restore test stands); after a
  confirmed success or refusal, any field change starts a new key.
- R10/R11 TTL bound (final review): text — "If supplied, it must be a positive integer number of seconds";
  "`expires_at` is `created_at` plus `authorization_ttl_seconds`"; §3.4 "Timestamps in responses are RFC 3339"; §10 "It must
  accept an unchanged export produced by this service". All four hold only with a FIXED bound: the TTL (and the stored
  clock) must be limited by constants chosen so that latest-possible created_at + largest TTL <= 9999-12-31T23:59:59.999Z.
  Reset and import refuse values above the constants with 422 validation_failed (a stated rule — §3.4 — would be
  violated); the bound never depends on the current time; expires_at is never clamped. Constants recorded in notes.md.
  Correction (round 3, test-designer): the clock constant is 9899-12-30T23:59:59.999Z, not 9899-12-31 — 9900 is not a
  leap year, so 9899-12-31 + 3155760000 s lands on 10000-01-01. The service's bound (9899-12-30) is right.

## Acceptance
- Accepted revision: 04f3ca4db90dc9780aa14ccb096b6f67f7e4a8ab (stage folders = 2c1be66), status: passed.
- Reviewer report: work/reviews/review-04f3ca4-recheck.md; acceptance work/reviews/acceptance-04f3ca4.md; screens
  work/reviews/design-61246ed.md (last screen review; round 4 changed no screens).
- Requirement rows covered: stage 2 164 of 164 (7 not testable: 4 freedoms, 3 judged in screen review); stage 1 190 of 190.
- stage-1/ changed after its stage-1 acceptance (R14 fix, 3c0ba8f, 2c1be66); it passes stage-1 acceptance 554/554 and
  the supplied stage-1 checks.

## Open failures, risks, unfixed non-blocking findings
- Open failures: none.
- S1-RISK-1 (carried; next: reviewer if auth changes): reduced-N scrypt for seeded users until first login.
- S2-R19 (non-blocking, history; next: implementer): a restructure-labelled commit changed behaviour.
- S2-R23 (non-blocking, kept by choice; next: implementer): the retry identity remembers only the last body sent;
  consistent with the R1 ruling.
- S1-R17 (kept), S1-R19/S1-R21, S2-R8 (history).

## Retro
- Rejected/failed: (1) the TTL bound moved with the clock and expires_at was clamped, so the service refused its own
  export (R2 -> R10/R11, S2-102); (2) import trusted stored idempotency receipts, so edited receipts replayed false
  bodies — a stage-1 gap (R14, then F2 S1-158/S2-158); (3) the pay form's retry key survived an edit-and-restore after a
  confirmed payment (R1), and the headline overflowed 375 px at 10,000,000.00 EUR (R15).
- Caught by: R1, R2 round-1 review; S2-102 and F2 test-designer probes (rounds 2, 3); R10-R15 final-review probe.
- Slipped late: R14 (in stage 1 too), R13, R12 and R15 all passed the suite and two screen reviews; screen content
  stopped at 999,999.99 EUR.
- Rounds: 4 plus round-1 review, final review and re-review. The loop stopped after round 2 (0 -> 1), restarted after
  the rejection (7 -> 2 -> 0), and ended when the re-review passed.
- Watch (test-designer): make receipt-vs-record edits (every field, every idempotent route) and boundary constants
  (TTL, clock, dates at year 9999) standing tests, and probe "accepted at reset, refused later" for any clock-relative rule.
- Watch (product-designer): screen content must include the largest legal values (2^53-1 minor units, longest handles,
  names) in every currency; now in work/design.md §10.
- Watch (implementer): any limit must be a fixed constant, never relative to now; a new idempotent route must join
  REPLAY_RULES/receipt rebuilding in every stage folder.
