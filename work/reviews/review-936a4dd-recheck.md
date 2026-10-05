# Stage 1 — re-review of 936a4dd

- **Revision:** 936a4dd2a9e2b08f57e55f0e81a68b759a82dae4 (stage-1 = 1bff8de)
- **Rejected revision:** d0f71b1. Its report is work/reviews/review-d0f71b1-final.md: CHANGES NEEDED, blocking 9.
- **Latest acceptance report:** work/reviews/acceptance-936a4dd.md. The suite at eb4c27d passes 554/554, with 0
  failing ids.
- **Rulings applied:** work/stage-1/decisions.md, including 0167025: a seeded paid request with no payment is a
  valid state.
- **Worktree:** /Users/mslee/dark-factory/band-work/worktrees/reviewer-936a4dd, with `work/` deleted.

## Verdict: PASS — blocking count 0

| Source | Count |
|---|---|
| Open blocking R findings | 0 |
| Failing requirement ids in the latest acceptance report | 0 |
| Stages failing the supplied checks | 0 |

## Passes run

None.
- **Why none:** this is a re-review after a rejection. Under the reviewer's rules it runs no new discovery
  passes. It checks that each rejection reason is fixed and reruns the supplied checks.
- **How I checked:**
  - I verified each reason myself, through HTTP against a build of 936a4dd.
  - The image was `pocketful-reviewer-936a4dd` at 127.0.0.1:64744, limited to `--cpus 2 --memory 2g`. It has
    since been removed.
- **Fix-commit pass:** not run, because this is a re-review. The fix commits since d0f71b1 are
  5be2e0e..1bff8de. Their behaviour is covered by the rejection checks below.

## Supplied checks

```
cd /Users/mslee/dark-factory/dark-factory-wearedevs && .venv/bin/python -m harness run --track pocketful \
  --repo /Users/mslee/dark-factory/band-work/worktrees/reviewer-936a4dd --all --mode isolated \
  --out /Users/mslee/dark-factory/band-work/checks/reviewer-936a4dd-recheck-isolated
```

Output:
- stage 1: pass
- stage 2: fail (expected)
- highest contiguous stage: 1
- claimed stage: 1 on the shipped checks

## Status of each rejection reason

### R11 — import of out-of-range timestamps: **fixed**

Import now refuses out-of-range timestamps with 422 `validation_failed`:
- `last_timestamp_ms` = 1e20 → 422;
- `last_timestamp_ms` = 253402300800000 → 422;
- a payment `created_at_ms` of 1e20 → 422;
- a payment `created_at_ms` of 253402300800000 → 422;
- a payment `created_at_ms` of -1 → 422.

After the refused import, payments still work (201).

Commits:
- 459996a refuses imported timestamps that have no RFC 3339 form.
- 667a5f0 undoes a write that fails after changing state, which closes the "500 but money moved" path.

### R12 — contradicting import records: **fixed**

Each of these edited exports now gets 422:
- a paid request set back to `pending` ("payment … names a request that is not paid by it");
- a payment `request_id` that names no request;
- a payment `settlement_id` that names no settlement;
- a corrupted idempotency `scope` or `fingerprint`;
- a duplicate token;
- an API-created paid request with a null `payment_id`. This is consistent with ruling 0167025, which allows
  only seeded ones.

An unchanged export still imports with 204.

Commits: 7153b63 adds one validator, `records.js` `checkRecords`, used by both reset and import; 01d0aa6 adds the
cross-record checks.

### R13 — amounts parsed as doubles: **fixed**

On `POST /payments`, every value that is not exactly an integer now gets 422:
- `1.0000000000000001`
- `0.99999999999999999`
- `1000000000.0000000001`
- `9007199254740993`

`POST /requests` with `2.0000000000000001` and `POST /splits` with `3.0000000000000001` also get 422.

The integral forms `1e3`, `1000.0` and `1000000000` are still 201.

Commit: ef2b627.

### R14 — fixture balance of 2^53+1: **fixed**

Reset with a balance of 9007199254740993 now gets 422. Balances of 9007199254740992 and 9007199254740991 get 204.

Commit: ef2b627.

### R15 — reset read a request `payment_id`: **fixed**

- A fixture request with `"payment_id": 5` resets with 204, and the request shows `payment_id: null`.
- A fixture payment with `"request_id": 7` resets with 204.

Commit: 3e3fd38.

### R16 — reset and login time: **fixed**

| Users in fixture (distinct passwords) | Reset | Login sent 1 s into the reset |
|---|---|---|
| 1001 | 2.99 s | 0.03 s |
| 3000 | 2.31 s | 0.03 s |
| 10000 | 3.95 s | — |
| 20000 | 4.29 s | — |

- **First logins:** 200 first logins, 50 in flight, all returned 200 within 0.89 s at most. A first login upgrades
  the stored hash to full strength.
- **After the upgrade:** a wrong password gets 401, and a second login gets 200.
- **Export and import of 20000 users:** 0.12 s.

Commits: 3a2e425 and 1bff8de.

**The trade-off the coordinator asked me to judge:**
- **What changed:** seeded users are hashed with scrypt at a reduced N, as low as 256, to fit a 4 s budget, and
  are upgraded to N=16384 at first login. Seeded users with the same password share one scrypt derivation, each
  with its own userSalt and HMAC.
- **The requirement:** §6 "Passwords must be stored using a password-hashing function such as bcrypt, scrypt or
  Argon2, or an equivalent. Plaintext password storage is not permitted."
- **Why it is accepted:**
  - The stored value is still a salted scrypt-based hash, and no plaintext is kept, which I read in
    `src/passwords.js`.
  - The requirement sets no work factor. The §2 reset limit of 10 s for any fixture size is a stated limit.
  - The weaker hash lasts only until first login, and signups always use full strength.
- **Recorded as a residual risk:** a seeded user who never logs in keeps a hash that is cheaper to attack.

### Acceptance failures S1-158, S1-073 and S1-024: **fixed**

These were the same defects as R11 and R12. The suite at eb4c27d passes 554/554 with 0 failing ids
(acceptance-936a4dd.md). My own checks above for R11 and R12 confirm the fixes.

## Non-blocking findings

| R | Status |
|---|---|
| R17: a fixture whose total balance is above 2^53 is refused | **kept by choice**. It is still 422; notes.md records why. It stays non-blocking (see the d0f71b1 report). |
| R18: a body with invalid UTF-8 | **fixed**. It now gets 400 (89f1880). |
| R19: a restructure commit that also changes behaviour | **acknowledged**. It cannot be fixed without rewriting history. Later restructure commits (5be2e0e, 7153b63) are separate from the behaviour commits. |
| R20: the rules for stored records were written twice | **fixed**. One `checkRecords` is used by reset and import (7153b63). |
| R21: a commit message claimed more than the commit did | **acknowledged**. It is history, and is recorded in notes.md. |
| R22: `closeRequest` accepted any status | **fixed**. It now accepts only the three terminal statuses (1da4614). |
| R23: the guard missed a sync handler that returns a Promise | **fixed**. That case is refused and its changes are undone inside the State transaction, with a test in state.test.js (6e91768, 667a5f0). |

## Status of the round-1 findings

| R | Status |
|---|---|
| R1, R2, R3, R5, R6, R7, R9 | fixed, as reported at d0f71b1 |
| R4 | ruled no change |
| R8 | fixed (through R23) |
| R10 | mostly fixed. The remainder is R19 and R21, which are history only. |
