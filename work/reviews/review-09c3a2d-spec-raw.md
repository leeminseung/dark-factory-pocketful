## Spec review of 09c3a2d (stage 1): no blocking findings, 3 non-blocking

`npm test` passes 59/59. I also started the service on port 18731 and sent about 150 requests by hand, covering every table row in §5–§11. Everything I started is stopped, the temp files under /tmp are deleted, and nothing in the worktree was written.

**Limitation:** a permission denial (flagged as "PII data handling") stopped me reading the body of `stage-1/src/fixture.js` past line 69, and all of `src/snapshot.js`, `src/passwords.js` and `src/main.js`. I checked reset (§3.3/§4), export/import (§10) and password storage (§6) only through HTTP behaviour. **Nobody has looked at whether passwords are actually hashed (§6).** If that needs checking, someone has to read `passwords.js` directly or allow the read.

### Finding 1 (non-blocking): the idempotency scope uses the raw URL path, but routing normalises it
- **Where:** `stage-1/src/server.js:79` builds the scope from `url.pathname` (raw). `routes.js:39` strips trailing slashes before matching, and `server.js:66` percent-decodes path parameters.
- **Requirement (§7):** "A replay means the same user sending the **same method, the same path and the same body**." Also: "The same key with the same body on a different path is a different request, not a replay, and must succeed normally."
- **Evidence:**
  - `POST /payments` with key `ts` and body `{"to_handle":"bob","amount":5}` returned 201.
  - The same request to `POST /payments/` returned a second 201 with a new `payment_id`. Ada's balance went 10000 → 9990, so money moved twice.
  - `POST /requests/rq_1/pay` with key `e1` and body `{}` returned 201. `POST /requests/rq%5F1/pay` with the same key and body returned `409 request_not_pending`. A replay should have returned 200 with the original payment.
- **Why non-blocking:** read literally, `/payments/` is a "different path", so succeeding normally is allowed. But the service treats both spellings as one endpoint and gives them separate key spaces, which defeats retry safety for a client whose path normalisation differs. Fix: build the scope from the matched route plus decoded parameters (e.g. `route.path` with `params`).

### Finding 2 (non-blocking, borderline): decline and cancel accept an unparseable body
- **Where:** `stage-1/src/routes.js:28-29` (`noBody: true`) and `server.js:74`.
- **Requirement (§5 table):** "| 400 | `malformed_request` | Unparseable body, or a field of the wrong JSON type |" and "Reserve 400 `malformed_request` for a body that does not parse or a field of the wrong type."
- **Evidence:** `POST /requests/rq_1/decline` with the payer's token and body `{garbage` returned 200 and declined the request. This was a deliberate choice, covered by the test "decline and cancel take no body: none, empty or any body is accepted".
- **Why non-blocking:** §8 defines no body for decline or cancel, so whether junk there is "an unparseable body" is open to reading. A stricter reading would expect 400. Suggested fix: accept an empty body, but run a non-empty one through `parseBody`.

### Finding 3 (non-blocking): pay with no body at all is 400
- **Where:** `stage-1/src/server.js:74` → `parseBody('')`.
- **Requirement (§8, `POST /requests/{id}/pay`):** "The body carries `visibility` only, optional, default `"public"`."
- **Evidence:** `POST /requests/rq_1/pay` with a token and an `Idempotency-Key` but no body returned `400 malformed_request "request body is not valid JSON"`.
- **Why non-blocking:** "optional" is attached to the field, not the body, and an empty body is technically unparseable. Still, a client that omits the body to get the default is refused.

### Minor extras (no action needed)
- Email matching is case-insensitive at signup and login: `DAN.X+1@example.com` → `409 email_taken` after `Dan.X+1@Example.com` signed up. The spec doesn't say this, but it is reasonable.
- Trailing-slash routes are accepted, which no requirement asks for; it only matters because of Finding 1.

### Checked and sound
- **§1 invariants:**
  - 50 concurrent identical-key payments gave exactly one 201 and 49 identical 200s; money moved once.
  - 50 concurrent distinct payments draining a balance never went negative.
  - Settlement netting is checked on final balances before anything is applied.
- **§3:** health, reset 204, a rejected reset leaves the old state live, 404s carry the error body, and the Bearer scheme is case-insensitive.
- **§4:**
  - Integral amounts: `1e3` is accepted; strings and booleans give 422.
  - Handle derivation works: `Zoë😀@x.com` → `zo__`, and a long local part is cut to 20 characters.
  - A request may exceed the payer's balance, and paying it while short is 409 with nothing changed.
  - Feed contract: private payments are visible to both parties and hidden from third parties and operators.
  - Fixture checks behave correctly: negative balance, `minor_units` 1, duplicate handle/email/id, unknown operator or user, bad status. `1e3` is accepted as a balance.
- **§5:**
  - Wrong-type versus out-of-range errors are correct: `to_handle` 5 or null → 400; `note: null`, `visibility: null` or `"Public"` → 422.
  - Query integers `+4`, `4.0`, `1e9`, empty, `0`, `201` and `-1` → 422. Unknown query parameters are ignored.
  - Idempotency-Key: 256 characters → 422, empty or absent → 400.
- **§6:** signup and login, all five table rows, and the derived-handle conflict.
- **§7:** replay is 200 with an identical body regardless of key order; a different body is 409, including an invalid body on a claimed key; the same key on another path is independent; a failed 4xx frees the key; `{}` versus `{"visibility":"public"}` is 409; a paid replay is 200, not `request_not_pending`.
- **§8:** every table row for payments, requests, pay, decline, cancel, `GET /requests` filters, splits and activity paging. Notes round-trip verbatim (NUL, combining characters, emoji); 200 emoji pass and 201 characters fail.
- **§9:** all five table rows, order-dependent extra units, and zero shares produce requests.
- **§10:** export shape is right; import restores tokens, logins, payment and settlement replays and balances without regenerating anything; a second import doesn't duplicate; wrong track or version, missing state or `{}` state give 422; invalid JSON gives 400.
- **§11:**
  - Access: no token gives 401, a non-operator gives 403.
  - Batch shape: 0, 33 or a missing `transfers` → 422; a non-object entry → 422.
  - Entry-error precedence follows input order (404 vs `self_payment`), and collective insufficiency → 409.
  - Results: shared `created_at` equals `committed_at`; a non-member has `settlement_id: null`; replay is 200; a failed batch frees its key; operators get no access to others' requests or private feed items.
