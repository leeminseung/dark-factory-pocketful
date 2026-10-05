# Acceptance check — round 4

- Product revision: 936a4dd2a9e2b08f57e55f0e81a68b759a82dae4 (stage-1/ as at 1bff8de)
- Suite revision: eb4c27d (`work/acceptance/`, 554 tests)
- Command: `work/acceptance/run.sh <worktree>/stage-1 1`, from a detached worktree of 936a4dd
- Rows covered: 190 / 190 (187 with tests; S1-008, S1-014, S1-015 not testable)
- Suites run: stage 1

## Status of the previous round's failing ids

| Id | Round 3 (824d084) | Round 4 (936a4dd) |
|---|---|---|
| S1-013 | failing (F3: reset of 900+ distinct-password users over 10 s) | **fixed** (timings below; the new suite test passes) |

No newly failing ids.

## Counts

| Tests | Passed | Failed | Errors |
|---|---|---|---|
| 554 | 554 | 0 | 0 |

## Probes beyond the suite

All probes go through the HTTP API of a container of this build (`--cpus 2 --memory 2g`), each run alone.

### F3 repeat: reset time, users with distinct passwords

During each reset, a login, a `GET /me` (with a token from before the reset) and a `GET /health`
were each sent 0.5 s, 2 s and 5 s after the reset started.

| Users | Reset | Status | Slowest request during the reset |
|---|---|---|---|
| 600 | 3.67 s | 204 | 0.07 s |
| 800 | 2.45 s | 204 | 0.06 s |
| 1000 | 3.02 s | 204 | 0.07 s |
| 1500 | 2.32 s | 204 | 0.07 s |
| 2000 | 3.06 s | 204 | 0.06 s |
| 5000 | 3.83 s | 204 | 0.06 s |
| 10000 | 3.96 s | 204 | 0.05 s |

Requests sent before the reset returned were served against the previous state (200). The ones
sent at 5 s came after the reset had returned, and got 401 as decision D1 requires, because the
old user and token are gone.

### §6 hashing of seeded users (S1-083)

- Every stored hash is scrypt, as `scrypt$N$r$p$<salt>$<salt>$<hash>`. The parameters seen:
  - signups, and fixtures of 3 users: N=16384, r=8, p=1;
  - seeded users in a 1000-user fixture: N=4096;
  - seeded users in a 10000-user fixture: N=512.
- No plaintext password appears in any export: none of the first 200 seeded users' passwords, before or after the first login, at 3, 1000 and 10000 users.
- Two seeded users with the same password get different hashes. The first salt field is shared between them; the second differs.

### Login before and after the first-login upgrade (S1-053, S1-079)

At 3, 1000 and 10000 users:
- a wrong password is 401 and leaves the stored hash unchanged;
- the first correct login is 200 and rewrites the hash to N=16384 (at 3 users it is already 16384);
- later correct logins are 200, and a wrong password, or another user's password, is still 401;
- the second user who shares the password logs in with it.

### Export and import around the upgrade (S1-161, S1-164, S1-165)

At 3, 1000 and 10000 users:
- Importing the export taken *before* the upgrade:
  - the token issued after that export is 401 (S1-165);
  - the login is 200;
  - a wrong password is 401.
- Importing the export taken *after* the upgrade:
  - the token is 200, and so is the login;
  - a wrong password is 401;
  - a not-yet-upgraded seeded user still logs in.
- Reset, then importing the post-upgrade export again: the token is 200.

### Not counted as failures

- §6 sets no cost: "a password-hashing function such as bcrypt, scrypt or Argon2, or an equivalent". So N=512 for a 10000-user seed, raised to N=16384 at first login, still meets the requirement.
- Within one reset, seeded users with the same password share the first salt field. An export therefore shows which seeded users share a password. No requirement covers this.

## Failures

None.

## Failing requirement ids

None.
