## Black-box probe of e03c437, stage 3 (http://127.0.0.1:65161)

I found four blocking findings, and all four come from one cause: every instant is cut to whole milliseconds. That covers stored times (correction `effective_at`, seeded payment `created_at`, seeded authorization `created_at`) and the statement window bounds. The earlier S3-043 failure is confirmed and turns out to be wider than that row. I found no other blocking defects. All three containers answered throughout; s3 peaked at about 152 MiB.

### F1 (blocking): correction `effective_at` loses digits below the millisecond (S3-043, also S3-027)
- **Rows:**
  - S3-043: "Then apply selected revisions according to their **effective** times. `as_of` retains its inclusive meaning…"
  - S3-027: "effective time is an RFC 3339 instant not later than now."
- **Requests:**
  1. Reset with seeded `p_1` ada→bob 500 at `2026-01-01T08:00:00Z`.
  2. `POST /payments/p_1/corrections` with `{"expected_revision":1,"amount":400,"effective_at":"2026-01-02T00:00:00.0007Z","reason":"x"}`, which gives 201.
  3. `GET /me?as_of=2026-01-02T00:00:00.0003Z`
- **Expected:** the 201 echoes `.0007`. Revision 2 is not yet in effect at `.0003`, so the balance is 10000.
- **Actual:** the 201 returns `"effective_at":"2026-01-02T00:00:00.000+00:00"` and the balance is 9600. The correction counts 0.4 ms before it took effect.
- **Also under S3-027:** I sent `effective_at` values with a `.xxx999` fraction close to the server clock. In 6 of 120 tries one was accepted with 201 and a server `recorded_at` earlier than it. Example: sent `…01:18:01.951999+00:00`, got `effective_at` and `recorded_at` both `…01:18:01.951+00:00`. That is an effective time later than the server's own recorded "now". This part is plausible rather than proven, because the server's true clock below 1 ms can't be seen.

### F2 (blocking): seeded payment `created_at` loses digits below the millisecond (S3-004, S3-009, S3-022)
- **Rows:**
  - S3-004: "Seeded payments may supply `created_at`"
  - S3-022: "A seeded payment's supplied `created_at` is also its original recorded/effective time"
  - S3-009: "the balance after every payment of theirs with `created_at` at or before `as_of`, and before every payment after it"
- **Requests:**
  1. Reset with seeded `p_1` ada→bob 500, `"created_at":"2026-01-01T08:00:00.0005Z"`, ada balance 9500. This gives 204.
  2. `GET /statement`, then `GET /me?as_of=2026-01-01T08:00:00.0003Z`, then `GET /statement?to=2026-01-01T08:00:00.0006Z`.
- **Expected:**
  - `created_at`, `effective_at` and `recorded_at` keep `.0005`.
  - `as_of` `.0003` gives 10000, because the payment is after it.
  - `to=.0006` contains `p_1` and closes at 9500.
- **Actual:**
  - All three times come back as `2026-01-01T08:00:00.000+00:00`.
  - `as_of` `.0003` gives 9500: the payment counts before it happened.
  - `to=.0006` returns 0 entries with `closing_balance` 10000.

### F3 (blocking): statement `from`/`to` are cut to whole milliseconds (S3-015, S3-017)
- **Rows:**
  - S3-015: "Returns the payments the caller sent or received in the half-open window `[from, to)`"
  - S3-017: "`opening_balance` is the balance immediately before `from`. `closing_balance` is the balance immediately before `to`."
- **Requests:**
  1. Reset with seeded `p_1` ada→bob 500 at exactly `2026-01-01T08:00:00.000Z`.
  2. `GET /statement?to=2026-01-01T08:00:00.0003Z`
  3. `GET /statement?from=2026-01-01T08:00:00.0003Z`
- **Expected:** `p_1` is before `.0003`. So `to` gives 1 entry and closes at 9500. `from` gives 0 entries and opens at 9500.
- **Actual:** `to` gives 0 entries and closes at 10000. `from` gives 1 entry and opens at 10000.
- **Not affected:** `known_at` held at this precision. `.8339999` against `recorded_at` `.834` correctly gave the earlier view.

### F4 (blocking): seeded authorization `created_at` loses digits below the millisecond (S3-059, S3-065)
- **Rows:**
  - S3-059: "A hold starts at authorization creation"
  - S3-065: "Seeded open holds are assumed created at reset unless `created_at` is supplied"
- **Requests:**
  1. Reset with an open authorization `a_1` ada→bob 2000, `"created_at":"2026-01-01T00:00:00.0005Z"`, `expires_at` 2 h ahead.
  2. `GET /me?as_of=2026-01-01T00:00:00.000400+00:00`
- **Expected:** `held` is 0.
- **Actual:** `held` is 2000, and the authorization's `created_at` is `…00:00:00.000+00:00`.

### Non-blocking observations
- **Leap second refused.** A real leap second such as `2016-12-31T23:59:60Z` is RFC 3339 syntax. It gets 422 on `as_of`, `known_at`, `from`, `to` and seeded `created_at`. Debatable; most systems refuse it.
- **Stage-2 voids.** A voided authorization imported from a real stage-2 export gets `closed_at` equal to its `created_at`. The stage-2 export has no void time, so the hold looks as if it never existed historically. This is information loss from the old format, not a breach.
- **Contradictory seeded authorization.** A seeded open authorization with `created_at` after its `expires_at` (now−1 s against now−1 h) is accepted. It then reports `closed_at` earlier than `created_at`. No rule covers it.
- **List paging under writes.** `GET /requests` and `GET /authorizations` repeat rows when another client writes between page reads (124 rows for 120 ids). The stage-2 build does the same, and the text sets no paging-stability rule for these API lists. The case-memory item (S2-R12) is about screens, which I could not check over HTTP only.

### Rows probed and found sound
- **S3-005, S3-006 (seeded `created_at` checks).** Future times are 422 with no state change. Also checked:
  - lowercase `t`/`z`, years 0000 and 1969, offsets that cross midnight are accepted;
  - 30 February, naive times and empty values are 422;
  - seeded payments without `created_at` always sort before the first API payment (15 runs).
- **S3-007, S3-012, S3-041, S3-074 (query-instant formats and echo).** About 37 formats on `as_of`, `known_at`, `from` and `to`:
  - echo is exact, including `.123456789…Z` and `-00:00`;
  - 0000 and 9999 work, year 10000 is 422;
  - `+24:00`, `+0000`, a space separator and whitespace are 422;
  - `from` later than `to` is 422, including when only the offsets differ.
- **S3-008 to S3-011, S3-037.** Inclusive `as_of`, opening and current values, and historical sums equal to the seed in every view I read.
- **S3-013, S3-014, S3-016, S3-018 to S3-020 (statement shape and paging).**
  - limit 0 and 201, `1e1`, `+3`, `3.0`, empty values and negative offsets are 422;
  - a huge offset returns empty with `has_more` false;
  - final partial page is correct, and balances don't change across pages;
  - ties are broken by id;
  - only the caller's own payments appear;
  - 401 without a token.
- **S3-025 to S3-036, S3-069, S3-071 (corrections).**
  - Field rules: every type, bound and number form (raw `1.0000000000000001`, `2^53+1`, `4e2`, `-0`). Reason length counts code points: 200 emoji or 200 combining characters are accepted, 201 are refused.
  - Parties: receiver, third party and private payment are 403; unknown is 404.
  - Keys: an emoji key of 255 characters is accepted and 256 is refused.
  - Replay works under key reorder, `4e2`, a trailing slash, a percent-encoded id and a query string. A claimed key is resolved before validation, but not before 401 or 400.
  - Keys are per user. A failed correction claims no key and changes no state.
  - `insufficient_funds` comes before `historical_overdraft`. Movements at one instant combine, including across offsets.
- **S3-038 to S3-040, S3-073.** Original receipt and feed are unchanged. Revisions endpoint: order, `reason ""`, third party 404, no token 401, unknown 404.
- **S3-042 to S3-044, S3-051.** Revision selection by `known_at` (pre-history, the exact recorded time, the future). Corrections move payments into and out of a window. Zero-amount entries appear. Opening plus deltas equals closing.
- **S3-045 to S3-050, S3-052, S3-067 (snapshots).**
  - Frozen across later payments, corrections and captures.
  - Two concurrency checks: 150 snapshot reads during about 6,500 concurrent payments showed no difference, and 50 concurrent same-revision corrections gave exactly one 201.
  - Other user's token, unknown token and token from before reset are 404. `from`, `to` or `known_at` alongside a snapshot are 422.
  - Survives export/import still bound to its owner.
  - About 29 edits to snapshot state in an export are refused with 422.
- **S3-053 to S3-056, S3-063, S3-066 (settlements, captures, upgrades).**
  - Settlement members and captures give 422 `linked_payment_immutable`.
  - Real stage-1 and stage-2 exports import. Tokens and all replays work, including split, settlement, authorization and capture. Holds are kept and `committed_at` revisions are correct.
- **S3-058 to S3-061, S3-064, S3-070 (historical holds).** Creation, nonfinal and final capture, void and expiry each take effect at their own event time. Captures are hidden before `known_at`. `historical_overdraft` is raised through available.
- **S3-068 (edited exports).** About 55 edits to a stage-3 export are refused:
  - revision fields, order, times and ranges;
  - opening balances and `closed_at`;
  - every field of a correction receipt;
  - corrections on linked payments;
  - a negative historical balance;
  - removing newer-stage keys while correction receipts remain.
- **Stage-1 and stage-2 exports with edits.** Ids over 64 characters, malformed emails, year-10000 times, a paid request set back to pending, holds above the balance, and a negative implied opening balance are all refused.
- **Limits.**
  - Reset of 1,000 users with distinct passwords and 50,000 dated payments: 3.0 s. A login during the reset was answered at once.
  - Mixed load with 50 in flight: highest latency 1.9 s.
  - 100 concurrent full-history corrections: at most 0.64 s each.
  - 18 MB export: 0.26 s; import: 0.45 s.
- **Stage-1 and stage-2 case memory.**
  - Path-spelling replays on pay, capture and payments.
  - Near-integer amounts on all five create paths. Near-integer and `2^53+1` fixture balances are refused.
  - Fixture link-id fields are ignored.
  - TTL just under its bound (3155760000) survives export, wait and import, with an exact `expires_at`.

### Not probed
The 375 px rendering case (S2-R15) and the other UI rows. They need a browser, and the brief allows HTTP only.

All /tmp files are removed. The s3 container is left holding the 1,000-user fixture.
