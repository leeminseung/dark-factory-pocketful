# Black-box probe of d0f71b1 (http://127.0.0.1:62722): findings

I probed the service over HTTP only. I used my own fixtures through `POST /_test/reset` and tampered copies of the service's own `GET /_test/export`. The container answered `/health` throughout and never stopped. All /tmp probe files are removed, and the service was left reset to an empty EUR fixture.

Shorthand used below: a token is `Bearer <token>`, and `K` is a fresh `Idempotency-Key`. The "standard fixture" is EUR/2 with ada (10000), bob (2500) and cy (0), all with password "correct horse".

---

## Blocking findings

### F1. Non-integral amounts are accepted and silently rounded, including past the maximum
Rows: **S1-099 / S1-107 / S1-135 / S1-029 / S1-051 / S1-004**
- "`amount` below 1, above 1000000000, or not an integer | 422 `validation_failed`"
- "API amounts must have an integral numeric value"
- "Monetary arithmetic must preserve exact minor-unit values without rounding error."

**Requests** (ada seeded with balance 3000000000):
- `POST /payments` with K and raw body `{"to_handle":"bob","amount":1000000000.0000000001}` → **201**, `"amount":1000000000`, and 1e9 moved.
- The same with `1000000000.00000001` → **201**, amount 1000000000.
- Standard fixture: `{"to_handle":"bob","amount":1.0000000000000001}` → **201** amount 1, and `{"to_handle":"bob","amount":0.99999999999999999}` → **201** amount 1.
- `POST /requests` `{"payer_handle":"ada","amount":2.0000000000000001,"note":""}` → 201 amount 2.
- `POST /splits` `{"participant_handles":["ada","bob"],"amount":3.0000000000000001,"note":""}` → 201 amount 3.
- For comparison, `1000000000.5` → 422 correctly.

**Expected:** 422 `validation_failed`. Each value is not an integer, and the first is also above 1000000000.
**Actual:** the amount is read as a double, rounded, and the money moves.
**Why blocking:** a stated amount rule is broken, and money moves on a value the client did not send.

### F2. A fixture balance above 2^53 is accepted and silently rounded
Rows: **S1-051 / S1-055 / S1-019** — "no operation produces a balance outside ±2⁵³. Monetary arithmetic must preserve exact minor-unit values without rounding error."

**Requests:**
- `POST /_test/reset` with users q (`balance: 9007199254740993`, i.e. 2^53+1) and r (`balance: 0`) → **204**.
- `GET /me` as q → `"balance":9007199254740992`.
- After q pays r 1, q's balance is 9007199254740991.

**Expected:** the stored balance is exact, or the fixture is refused with 422. It must not be silently changed.
**Actual:** the balance is stored rounded. The seeded total is no longer the one the fixture declared.

### F3. Valid fixtures and imports whose total is above 2^53 are refused
Rows: **S1-019 / S1-051** — "Replace all service state with the fixture…"; the only range rule is "no operation produces a balance outside ±2⁵³".

**Requests:**
- `POST /_test/reset` with two users, each `balance: 4503599627370497` (2^52+1) → **422** "seeded balances exceed 2^53 in total".
- Import has the same check ("balances exceed 2^53 in total").

**Expected:** 204. No individual balance is outside ±2^53, and the text sets no limit on the total.
**Actual:** 422, and the previous state is kept.
**Why blocking:** a fixture that breaks no stated rule is refused. This one is arguable if a total cap is read into invariant 1, but the text does not state such a cap.

### F4. Reset reads a request `payment_id` the fixture format does not define, and can fail on it
Rows: **S1-025 / S1-052** — "Unknown fields in a request body are ignored, never an error." (case-memory item: "a reset read a field that is not part of the fixture format").

**Requests:**
1. A standard fixture with payment p_1 and request `{"id":"rq_1",…,"status":"paid","payment_id":5}` → **400** `malformed_request` "requests[0].payment_id must be a string". Nothing is reset.
2. A request with `"status":"pending","payment_id":"p_1"` → 204. `GET /requests` then shows a **pending** request carrying `"payment_id":"p_1"`.
3. `"status":"declined","payment_id":"p_1"` → a declined request with a payment_id.
4. `"status":"paid","payment_id":"p_zzz"` → 204, and the request points at a payment that does not exist. Meanwhile seeded p_1 shows `request_id: null`.

**Expected:** fields outside the fixture format are ignored, so case 1 gives 204 and every request shows `payment_id: null` from the fixture.
**Actual:** reset fails on a field outside the format, and records with contradictory links are served.

### F5. Import accepts invalid or contradictory states (S1-158), with downstream failures
Row: **S1-158** — "missing fields, wrong track/version or an invalid state give 422 `validation_failed` without changing the destination."

Each case below was made by taking `GET /_test/export`, changing one field, and sending it to `POST /_test/import`. Every one returned **204**:

| Change | What happened after the 204 |
|---|---|
| `payments[0].created_at_ms = 1e20` | `GET /activity` for both parties → **500** `internal_error` (also S1-073) |
| `state.last_timestamp_ms = 1e20` | Every later `POST /payments` and `POST /requests` → **500**, and `GET /activity` → 500. The service is unusable for writes until the next reset/import. |
| `payments[0].created_at_ms = 253402300800000` | `GET /activity` returns `"created_at":"+010000-01-01T00:00:00.000+00:00"`, which is not RFC 3339 (S1-024) |
| `state.last_timestamp_ms = 253402300799999` | New payments are stamped `9999-12-31T23:59:59.999+00:00` |
| Paid request set to `status:"pending"` while its payment (with `request_id`) still exists | `POST /requests/{id}/pay` → 201 again. Ada pays the same request **twice** (9850 → 9800), against S1-003 "A payment request may move money at most once". |
| `idempotency[0].scope = "not json"` | Replaying the original `POST /payments` with key k1 and the same body → **201** and a second payment. The retry identity is lost and the client is charged twice (S1-088/S1-164). |
| `idempotency[0].fingerprint = "{{"` | An identical replay → 409 `idempotency_key_reuse` |
| Other contradictions also accepted | Paid request with `payment_id:null`; request `payment_id` pointing at no payment; payment `request_id` / `settlement_id` pointing at nothing; paid request amount ≠ its payment amount; settlement with empty `payment_ids`; settlement `committed_at_ms = 1e20`; split shares not summing to its amount; duplicate idempotency entries; duplicate token strings mapped to two users; empty-string token |

**Expected:** 422 `validation_failed` with the destination unchanged.
**Actual:** 204, followed by 500s, non-RFC-3339 timestamps, double payment of one request, and lost or broken retries.

Import validation that does work: wrong track or version, missing state, bad currency, bad minor_units, bad balances, bad hashes, bad handles, duplicate users, unknown parties, missing arrays, negative or missing timestamps.

### F6. 5xx responses after an import (S1-073)
Row: **S1-073** — "Requests must not produce 5xx responses."
This is the same reproduction as the first two rows of F5:
- After importing `created_at_ms = 1e20`: `GET /activity` → 500 `{"error":{"code":"internal_error",…}}`.
- After importing `last_timestamp_ms = 1e20`: `POST /payments` with K and `{"to_handle":"bob","amount":1}` → 500, and `POST /requests` → 500.

### F7. A non-RFC-3339 timestamp is served (S1-024)
Row: **S1-024** — "Timestamps in responses are RFC 3339 with an explicit offset". This is the year-10000 case in F5: `created_at` is `+010000-01-01T00:00:00.000+00:00`.

### F8. A login that overlaps a reset is held past the 5-second limit
Row: **S1-013** — "Per-request timeout | 5 s (10 s for `POST /_test/reset`)" (case-memory item: "a sign-in that overlapped a reset was held past the stated time limit").

**Requests:**
- `POST /_test/reset` with 701 users, all password "correct horse" → 204 in 9.24 s.
- One second after it started, `POST /auth/login` `{"email":"ada@example.com","password":"correct horse"}` → **200 after 8.24 s**.
- At the same moment `/health`, `/me` and `/payments` each answered in 0.01 s.

**Expected:** login answers within 5 s.
**Actual:** 8.24 s. Login is queued behind the reset's password hashing.

### F9. Reset time grows with user count and passes 10 s at about 760 users
Rows: **S1-013 / S1-019**. Reset hashes every seeded password, about 13 ms each, even when the passwords are identical.

| Users | Reset time |
|---|---|
| 200 | 2.7 s |
| 500 | 6.7 s |
| 1000 | **13.2 s** (13.3 s with identical passwords) |
| 2000 | **26.9 s** |

**Expected:** reset completes within 10 s.
**Actual:** it does not at 1000 or more users. This is blocking if the harness seeds that many. The text sets no limit on users, so the worst case is unbounded. For comparison, a 31 MB fixture with 500 users, 10000 payments and 5000 requests reset in 6.9 s.

### F10. A body with invalid UTF-8 is accepted, and the note is altered
Rows: **S1-059 / S1-023 / S1-105** — "400 `malformed_request` | Unparseable body"; "Requests … are `application/json; charset=utf-8`"; "`note` is stored and returned verbatim".

**Request:** `POST /payments` with K, Content-Type application/json, body bytes `{"to_handle":"bob","amount":1,"note":"\xff\xfe"}` (raw invalid UTF-8).
**Expected:** 400 `malformed_request`. A body that is not UTF-8 is not a JSON text.
**Actual:** 201, money moves, and the note is stored as `"��"`.
**Why blocking:** I rate this blocking because the body cannot be parsed as UTF-8 JSON, so the 400 rule applies. The coordinator may judge it differently.

---

## Rows probed and found sound

- **S1-001, S1-002, S1-003, S1-092:** 1500 mixed concurrent payments, settlements and request payments at 50 in flight; the total was conserved, no balance went negative, and each request was paid at most once. 50 concurrent identical requests on all five idempotent paths gave exactly one 201, 49 × 200 and one body.
- **S1-012, S1-013 (apart from F8/F9), S1-160:** 600 mixed requests at 50 in flight on a large state, max latency 0.12 s. A 12.6 MB export took 0.12 s and its import 0.17 s. An export taken during 48 concurrent writers had a conserved sum. Writes running while a reset happened did not leak into the new state, and old tokens got 401.
- **S1-020 – S1-023, S1-058, S1-073 (apart from F6):** unparseable target, `GET *`, absolute-form URI, garbage request line, percent-escapes, headers of 16/64/200 KB, a 60 MB body, and 100000-deep nesting on all ten POST endpoints. Every response had a JSON error body; there were no 5xx.
- **S1-025, S1-026:** unknown body fields and query parameters, repeated query parameters.
- **S1-029, S1-030, S1-050, S1-067, S1-068, S1-097:** integral forms (1E0, 10e-1, 1e3, 1000.0), and null/[]/{}/"1"/true/1e400/-0/2^53+1 → 422. `to_handle` null or a number → 400; note null or non-string → 422; visibility null, PUBLIC or with a trailing space → 422.
- **S1-031, S1-034, S1-035, S1-080, S1-076 – S1-079:** handle derivation per code point (Ä, ß, ﬀ, İ, emoji, combining marks, quotes, `+`/`-`, truncation to 20), handle_taken, email_taken (case-insensitive), password length in code points (7 vs 8 emoji, combining), invalid emails, wrong types.
- **S1-061, S1-081:** case-insensitive scheme, unknown or changed tokens, `Token`/`Basic`/bare token → 401.
- **S1-039, S1-062, S1-063, S1-115 – S1-125, S1-187:** every party allowed or refused on pay/decline/cancel (third party → 403); every state transition; unknown, long or 65-character ids → 404.
- **S1-084 – S1-091, S1-094:** key scoped per user and shared across a user's tokens; same key on another path → 201; key length 255/256; missing key before validation; replays with reordered keys and 7.0 vs 7; keys reusable after a 4xx.
- **S1-098 – S1-111:** amount bounds, self_payment/self_request, unknown handle, notes of 200/201 emoji and combining characters, error precedence with funds.
- **S1-126 – S1-131, S1-141, S1-142, S1-069 – S1-072:** limit 0/1/200/201, `+4`, `4.0`, `1e1`, full-width digits, 0x5, empty, whitespace, huge offset. Paging over 43 items at limit 7 with no gaps or overlaps, has_more exact, newest first. Seeded fixture `created_at` fields are ignored.
- **S1-132 – S1-140, S1-143 – S1-151:** the rounding table, caller in any position, a 300-way split, a 0 share still creating a request, duplicates and unknowns among 100k handles, wrong element types → 400.
- **S1-044 – S1-049, S1-169:** the feed if-and-only-if rule with seeded, settlement and request payments. An operator who is not a party sees no private items or others' requests, and cannot pay, decline or cancel others' requests.
- **S1-167 – S1-186:** 0, 1, 32 and 33 transfers; entry type, amount, note and visibility rules; input-order precedence ahead of funds; affordability by net position (cycles and chains through zero balances); collective shortfall → 409 with nothing moved; members share `created_at` = `committed_at`; non-operator → 403, no token → 401.
- **S1-152 – S1-157, S1-161 – S1-166, S1-186 (untampered exports):** an untampered import restores replays on all five paths byte-identical (including a request later cancelled), tokens, failed-key reuse, settlement membership and balances. Importing twice duplicates nothing.
- **S1-024 (normal operation):** every `created_at` and `committed_at` has a millisecond fraction and `+00:00`; there was no clock drift after 2000 rapid writes.
