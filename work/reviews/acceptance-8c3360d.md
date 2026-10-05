# Acceptance check — stage 2, round 2

- Product revision: 8c3360dfeae0894027d75c4502cf1d8f4359d500 (stage-2/ as at 1b1322f)
- Suite revision: ba66344 (`work/acceptance/`)
- Command: `work/acceptance/run.sh <worktree>/stage-2 2` from a detached worktree of 8c3360d. The
  runner also started the worktree's stage-1/ for the upgrade tests.
- Rows covered: stage 1, 190 / 190; stage 2, 164 / 164 (not-testable rows as in round 1)
- Suites run: stage 1 and stage 2

## Status of the previous round's failing ids

Round 1 (7364e79) had none. In the suite there are still none. The probes give one new failing id:
S2-102 (F1 below).

## Counts

| Suite | Tests | Passed | Failed | Errors |
|---|---|---|---|---|
| stage 1 | 554 | 554 | 0 | 0 |
| stage 2 | 304 | 304 | 0 | 0 |
| total | 858 | 858 | 0 | 0 |

## Probes beyond the suite

These ran through the browser (Playwright, Chromium) and the HTTP API of a container of this
build (`--cpus 2 --memory 2g`).

| Area | Result |
|---|---|
| R1 — pay, request, authorise and split forms | In each form, after a success, resubmitting the unchanged form creates nothing new, and the same key is sent again. Editing a field and changing it back, then submitting, creates exactly one new resource with a new key. With the response lost after the commit, an edit-and-restore retry sends the same key and the operation happens once. On pay, after a refusal (insufficient funds), an edit-and-restore resubmit uses a new key. No failure. |
| R1 — capture form | The typed capture amount is captured as a final capture, so the authorisation closes and its capture control goes away; there is no resubmit to make. With the capture response lost after the commit, the capture happens once. No failure. |
| R2 — TTL bound | Reset accepts `authorization_ttl_seconds` up to the value that puts reset time + TTL at 9999-12-31T23:59:59.999Z (251611061759 at the time of the probe), and refuses one more with 422. At the largest accepted TTL, an authorisation made at once gets `expires_at` `9999-12-31T23:59:59.657+00:00`, valid RFC 3339, and the export re-imports with 204. **F1 below** covers authorisations made later. |
| R9 — lists beyond 200 rows | With 230 payments, 230 requests and 230 authorisations, `/`, `/requests` and `/authorizations` each show all 230 items. No failure. |
| 1b1322f — read timeouts and retry | Latest refresh wins: the first refresh's reads were answered with stale data 2.5 s, 4 s and 8 s after the second refresh showed the new balance, and the screen stayed on the new balance each time. Slow writes: payment responses delayed 2 s, 4 s and 7 s each send exactly **one** POST, and the screen ends on the new balance with no error or uncertain state. A write whose connection is reset sends one POST and nothing more in the next 10 s; it shows `pay-uncertain`. The client never retried a write. No failure. |

## Failures

### F1 — S2-102: near the TTL bound, `expires_at` is not `created_at` plus the TTL

- **S2-102** "`expires_at` is `created_at` plus `authorization_ttl_seconds`."
- **Sent:**
  1. Reset with `authorization_ttl_seconds = 251611061639`, which is 120 s below the largest the
     reset accepted. The reset returns 204.
  2. Ada `POST /authorizations` (bob, 5) four times, 45 s apart.
- **Expected:** each `expires_at` equals `created_at` + 251611061639 s. (Or reset refuses this TTL.)
- **Actual:**

| # | created_at | expires_at | expires_at − created_at − TTL |
|---|---|---|---|
| 1 | 2026-10-05T22:24:11.134+00:00 | 9999-12-31T23:58:10.134+00:00 | 0 s |
| 2 | 2026-10-05T22:24:56.216+00:00 | 9999-12-31T23:58:55.216+00:00 | 0 s |
| 3 | 2026-10-05T22:25:41.296+00:00 | 9999-12-31T23:59:40.296+00:00 | 0 s |
| 4 | 2026-10-05T22:26:26.381+00:00 | 9999-12-31T23:59:59.999+00:00 | **−25.4 s** (cut off at the RFC 3339 maximum) |

  At the largest accepted TTL, every authorisation made after the reset's own instant is cut off
  this way. Reset accepts a TTL that holds only for the time left between reset and year 10000.
  Each 201 is otherwise valid: RFC 3339, and no 5xx.

## Failing requirement ids

S2-102 (F1, from probes; the suite itself passes). It is a blocking finding under the rules,
because a stated equation fails for a TTL that reset accepts.
