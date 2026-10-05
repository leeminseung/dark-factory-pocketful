# Stage 1 — decisions

## Plan

- Task: Pocketful stage 1 (payments, requests, splits, feed, export/import, settlements), HTTP API only.
- Spec: /Users/mslee/dark-factory/dark-factory-wearedevs/pocketful/spec/stage-1.md; supplied checks: pocketful/test/stage_1/.
- Base revision: 6fb0742 (no earlier stage). Worktrees under /Users/mslee/dark-factory/band-work/worktrees/.
- No screens in this stage, so product-designer is not engaged and there is no screen review.
- Order: implementer builds stage-1/ in parallel with test-designer's requirement list -> coordinator checks the list
  -> test-designer writes acceptance suite -> rounds (test-designer acceptance check; reviewer round-1 review in round 1)
  -> final review with `--mode isolated` -> accept.
- Handoff sent 2026-10-06 to implementer and test-designer in 5 numbered parts (full spec pasted).

- List check (9071dcb): asked test-designer for 4 missing rows — decline/cancel unknown id 404; response amounts are JSON
  integers; idempotency order (401 and 400 malformed before claimed-key resolution); generated ids never collide with
  seeded/imported ids. Not yet in the list at 3e0b6ba; re-requested.
- Implementer revision for checking: 505958b (stage-1 content = f636c55); supplied checks pass (147) incl. isolated.
- Suite ready at 3e0b6ba (510 tests); command `work/acceptance/run.sh stage-1 1`. Test-designer's informal preview on
  f636c55: 10 failures (S1-059, S1-073, S1-070, S1-158, S1-058) forwarded to implementer before round 1.

- List complete at 190 rows (S1-187..S1-190 added in 2ef3db0); suite at 94de59b (553 tests).

## Rounds
- Round 1: product 09c3a2d (stage-1 = bf9d8e6), suite 94de59b. Acceptance 553/553 (work/reviews/acceptance-09c3a2d.md);
  round-1 review work/reviews/review-09c3a2d-round1.md (standards + spec briefs and raw files present). Failing ids: 0;
  reviewer blocking: R1. Decision: another round; sent R1 (blocking) and R2, R3, R5-R10 (non-blocking) to implementer; R4 ruled no change.
- Round 2: product d0f71b1 (stage-1 = 6fca369), suite 94de59b. Suite 553/553; probes (work/reviews/acceptance-d0f71b1.md)
  fail S1-158, S1-073, S1-024 (count 3, previous 0). Count did not fall -> loop stopped; final review on d0f71b1.
- Final review of d0f71b1: CHANGES NEEDED, blocking 9 (R11-R16 + S1-158, S1-073, S1-024); report
  work/reviews/review-d0f71b1-final.md (fix-commit and probe briefs/raw listed; supplied --all --mode isolated pass).
  R1-R3, R5-R7, R9 fixed; R4 no change; R8 -> R23, R10 -> R19. Sent R11-R23 + F1/F2 to implementer; rounds continue
  from 3 without reviewer, first compared with 9.
- Round 3: product 824d084 (stage-1 = 6e91768), suite 94de59b (553/553). Probes fail S1-013 (F3: reset of 900+ users
  with distinct passwords > 10 s). Count 1 vs 9 at rejection -> fell; round 4 with F3. Suite now eb4c27d (554, adds the
  1000-user reset test). Report work/reviews/acceptance-824d084.md.
- Round 4: product 936a4dd (stage-1 = 1bff8de), suite eb4c27d (554/554). Failing ids: 0 (S1-013 fixed). No new
  non-blocking findings -> re-review of 936a4dd. Report work/reviews/acceptance-936a4dd.md.
- Re-review of 936a4dd: PASS, blocking 0 (work/reviews/review-936a4dd-recheck.md, ef1fb69). R11-R16 and S1-158/073/024
  fixed; supplied --all --mode isolated: stage 1 pass, stage 2 fail (expected), claimed 1. R16 trade-off accepted.

## Rulings
- R4 (pay with no body is 400): no change. §5: "400 | `malformed_request` | Unparseable body"; §7: the key is resolved
  "After the body has parsed as a JSON object". An empty body does not parse; §8's "optional, default `\"public\"`" qualifies
  the `visibility` field, not the body. Consistent with S1-059/S1-189 tests; supplied checks always send `{}` to pay.
- R3 (decline/cancel accept an unparseable body): §5 "Unparseable body" -> 400 applies to any non-empty body that does
  not parse; an absent/empty body stays 200 (§8 defines no body; supplied test_sample.py posts decline/cancel with none).
- Seeded paid request / `seeded` flag (implementer, round 3): no change. A fixture request may be seeded with
  `"status"` other than pending (§4 fixture `requests[].status`), and the fixture has no payment link for it; reset must
  make "subsequent requests must see only that fixture" (§3.3), so reset must not invent a payment. A paid request with
  no payment is therefore a state the service itself produces, and an export holding one is not "an invalid state"
  (§10). An edited export that marks an API-created request this way moves no money and breaks no §1 invariant
  (sums, nonnegative, at most once). Not a failure of S1-158.

## Acceptance
- Accepted revision: 936a4dd2a9e2b08f57e55f0e81a68b759a82dae4 (stage-1 = 1bff8de), status: passed.
- Reviewer report: work/reviews/review-936a4dd-recheck.md; acceptance report work/reviews/acceptance-936a4dd.md.
- Requirement rows covered: 190 of 190 (187 tested, S1-008/S1-014/S1-015 not testable, covered by the isolated harness run).

## Open failures, risks, unfixed non-blocking findings
- Open failures: none.
- S1-RISK-1 (from R16; next: implementer, reviewer): seeded users' scrypt N is reduced (down to 256) to fit the 10 s reset
  budget until their first login; same-password seeded users share a salt field; above ~20,000 distinct passwords reset
  would exceed its 4 s hashing budget.
- S1-R17 (non-blocking, kept; next: test-designer to confirm no later requirement contradicts): a fixture whose balance
  total exceeds 2^53 is refused with 422.
- S1-R19, S1-R21 (non-blocking, history): a restructure commit changed behaviour; a commit message overclaimed. Next: implementer.

## Retro
- Rejected/failed: (1) import validated fields only one record at a time, so out-of-range timestamps and contradictory
  records were accepted, leading to 500s, a second payment of one request, and non-RFC 3339 output (R1, R11, R12, S1-158/073/024);
  (2) reset hashed each seeded password at full cost, so large fixtures broke the 10 s reset limit (R16, S1-013);
  (3) amounts were parsed as doubles, so near-integer values were rounded and accepted (R13, R14).
- Caught by: R1 round-1 review; F1/F2 test-designer probes in round 2; R11-R16 final-review probe; S1-013 round-3 probe.
- Slipped past the suite and caught late: all of the above; the suite's tests only edit an export in generic ways, and the
  reset load test had no fixture large enough.
- Rounds: 4 plus round-1 review, final review and re-review. The loop stopped after round 2 (count 0 -> 3), restarted after
  the rejection (9 -> 1 -> 0), and ended when the re-review passed.
- Watch (test-designer): add standing probes for edited-export import validity (ranges, cross-record links) and for the
  reset time of large fixtures in every stage's suite, as checks rather than one-off probes.
- Watch (implementer): keep one validator for reset and import; any new record type in later stages must join it.
- Watch (reviewer): recheck S1-RISK-1 if later stages change auth or password storage.
