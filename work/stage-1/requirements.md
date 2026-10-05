# Stage 1 — requirement list

Source: `pocketful/spec/stage-1.md` (read-only). One row per testable requirement.
Status values: open, tested, passing, failing, disputed, not testable (with the reason).
Tests are named `file::function` under `work/acceptance/tests/stage_1/`.

## §1 Scope and invariants

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-001 | "The sum of wallet balances always equals the total seeded by the last `POST /_test/reset`." | invariants | | open |
| S1-002 | "No wallet balance may be negative, including transiently." | invariants | | open |
| S1-003 | "A payment request may move money at most once." | invariants | | open |
| S1-004 | "All amounts are exact integer counts of minor units." | invariants | | open |
| S1-005 | "Money moves only between existing wallets." | invariants | | open |

## §2 Delivery and deployment

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-006 | "Deliver an HTTP service, a `Dockerfile` and a `RUN.md` with a command that builds and starts the service without manual setup." | delivery | | open |
| S1-007 | "The image must run on its own with `-e PORT=<port>` and a port mapping." | delivery | | open |
| S1-008 | "Runtime networking has no outbound access." | delivery | — | not testable by this suite: the suite reaches the service through a published port, and Docker cannot publish ports from a network-less container; the harness `--mode isolated` run covers it |
| S1-009 | "All runtime dependencies, initialization and seed data must work within that single container. Compose configuration is not used to start the service." | delivery | | open |
| S1-010 | "CPU \| 2 vCPU" / "Memory \| 2 GiB" | limits | | open |
| S1-011 | "Start to first healthy response \| 60 s" | limits | | open |
| S1-012 | "Concurrent requests \| up to 50 in flight" | limits | | open |
| S1-013 | "Per-request timeout \| 5 s (10 s for `POST /_test/reset`)" | limits | | open |
| S1-014 | "Disk \| ephemeral; state need not survive a container restart" | limits | — | not testable: states a freedom, not an obligation |
| S1-015 | "Runtime assets and dependencies must be included in the image." | delivery | — | not testable by this suite: same reason as S1-008 (needs a container with no outbound network) |

## §3 Runtime contract

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-016 | "Listen on `0.0.0.0` using the `PORT` environment variable, default `8080`." | runtime | | open |
| S1-017 | "GET /health  ->  200  {"status": "ok"}" | health | | open |
| S1-018 | "Return 200 once the service and its data store can serve requests, within 60 seconds of container start." | health | | open |
| S1-019 | "Replace all service state with the fixture in the request body (§4)." → 204 No Content | reset | | open |
| S1-020 | "When reset returns 204, subsequent requests must see only that fixture." | reset | | open |
| S1-021 | "Repeated resets are supported." | reset | | open |
| S1-022 | "This test endpoint must be enabled in the delivered image and requires no authentication." | reset | | open |
| S1-023 | "Requests and responses are `application/json; charset=utf-8`." | conventions | | open |
| S1-024 | "Timestamps in responses are RFC 3339 with an explicit offset" | conventions | | open |
| S1-025 | "Unknown fields in a request body are ignored, never an error." | conventions | | open |
| S1-026 | "Unknown query parameters are ignored." | conventions | | open |
| S1-027 | "IDs are opaque strings of at most 64 characters." | conventions | | open |

## §4 Model

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-028 | "The service has **one currency**, declared in the fixture." | model | | open |
| S1-029 | "JSON `1000`, `1000.0` and `1e3` all represent the same valid minor-unit amount." | amounts | | open |
| S1-030 | "Booleans and strings are not numbers here." | amounts | | open |
| S1-031 | "Every user has a **handle**: unique across the service, matching `^[a-z0-9_]{1,20}$`, and never changing once set." | handles | | open |
| S1-032 | "Users identify recipients by handle." | handles | | open |
| S1-033 | "Seeded users take their handle from the fixture." | handles | | open |
| S1-034 | "take the local part, lowercase it, replace every character outside `[a-z0-9_]` with `_`, and truncate to 20 characters." | handles | | open |
| S1-035 | "If that handle is already taken the signup fails" | handles | | open |
| S1-036 | "New users start with a balance of `0`. They can receive money and be asked for money immediately." | users | | open |
| S1-037 | "A **payment** moves money from one wallet to another, immediately and atomically." | payments | | open |
| S1-038 | "A request is `pending`, and then exactly one of `paid`, `declined` or `cancelled`." | requests | | open |
| S1-039 | "Only the payer may pay or decline it; only the requester may cancel it." | requests | | open |
| S1-040 | "**A request may exceed the payer's balance.** That is a legal state, not an error at creation time" | requests | | open |
| S1-041 | "an attempt to pay it while short is `409 insufficient_funds` and changes nothing. Money can arrive later and the same request then becomes payable." | requests | | open |
| S1-042 | "**Visibility belongs to the payment, not the request.** The payer chooses it when the money moves." | visibility | | open |
| S1-043 | "A request carries no visibility of its own and never appears in anyone else's feed." | visibility | | open |
| S1-044 | "A payment appears for a caller **if and only if** its `visibility` is `public`, **or** the caller is its sender or its receiver." | feed | | open |
| S1-045 | "Requests never appear in the activity feed" | feed | | open |
| S1-046 | "`GET /requests`, which returns only requests where the caller is the requester or the payer." | requests | | open |
| S1-047 | "A split is not a feed item. The requests it creates are visible to their own two parties, and the payments that eventually fulfil them follow the rule above." | feed | | open |
| S1-048 | "Visibility is **one value on the payment**, seen identically by both parties and by everyone else." | visibility | | open |
| S1-049 | "A `private` payment is hidden from third parties, not from its own receiver." | visibility | | open |
| S1-050 | "`amount` is at most `1000000000` on any single request" | amounts | | open |
| S1-051 | "no operation produces a balance outside ±2⁵³. Monetary arithmetic must preserve exact minor-unit values without rounding error." | amounts | | open |
| S1-052 | Fixture format: `currency`, `minor_units`, `users`, `payments`, `requests` as in the example | fixture | | open |
| S1-053 | "Seeded users must be able to log in with the given password immediately." | fixture | | open |
| S1-054 | "`balance` is the wallet balance **after** every seeded payment has been applied. ... you do not replay seeded payments against balances." | fixture | | open |
| S1-055 | "A `balance` below zero in a fixture is a reset error: return `422 validation_failed` from `POST /_test/reset` and change nothing." | fixture | | open |
| S1-056 | "`minor_units` is `0`, `2` or `3`. Fixtures use `EUR` (2), `JPY` (0) and `BHD` (3)." | fixture | | open |
| S1-057 | Seeded ids are the service's ids: the `GET /me` example for fixture user `u_ada` shows `"user_id": "u_ada"` (decision D4) | fixture | | open |

## §5 Errors

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-058 | "Every 4xx and 5xx response carries this body: `{ "error": { "code": ..., "message": ... } }`" | errors | | open |
| S1-059 | "400 \| `malformed_request` \| Unparseable body, or a field of the wrong JSON type" | errors | | open |
| S1-060 | "400 \| `missing_idempotency_key` \| Required `Idempotency-Key` header absent or empty" | errors | | open |
| S1-061 | "401 \| `unauthenticated` \| Missing, malformed or unknown bearer token" | errors | | open |
| S1-062 | "403 \| `forbidden` \| Authenticated, but not permitted to touch this resource" | errors | | open |
| S1-063 | "404 \| `not_found` \| No such resource, or not visible to this caller" | errors | | open |
| S1-064 | "409 \| `idempotency_key_reuse` \| Key already used by this caller with a different request body" | errors | | open |
| S1-065 | "422 \| `validation_failed` \| A required field or query parameter is missing, or a stated rule is violated with no more specific code" | errors | | open |
| S1-066 | "A field of the correct JSON type with an invalid format or out-of-range value gives 422 `validation_failed`" | errors | | open |
| S1-067 | "invalid `amount` values (including strings and booleans), non-string `note` values (including `null`), and any `visibility` other than `public` or `private` are 422 `validation_failed`." | errors | | open |
| S1-068 | "Omission alone selects the optional-field defaults." | errors | | open |
| S1-069 | "An integer-valued **query parameter** is written as plain decimal digits: `1e9`, `4.0` and `+4` are 422 `validation_failed`" | errors | | open |
| S1-070 | "`Idempotency-Key` \| 1 to 255 characters \| 422 `validation_failed`" | errors | | open |
| S1-071 | "`limit` \| integer 1 to 200 \| 422 `validation_failed`" | errors | | open |
| S1-072 | "`offset` \| integer 0 or more \| 422 `validation_failed`" | errors | | open |
| S1-073 | "Requests must not produce 5xx responses, including under concurrent load." | errors | | open |

## §6 Authentication

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-074 | "POST /auth/signup ... ->  201  { "user_id", "display_name", "token" }" | auth | | open |
| S1-075 | "POST /auth/login ... ->  200  { "user_id", "display_name", "token" }" | auth | | open |
| S1-076 | "Email already registered \| 409 `email_taken`" | auth | | open |
| S1-077 | "Password shorter than 8 characters \| 422 `validation_failed`" | auth | | open |
| S1-078 | "`email` not of the form `local@domain` \| 422 `validation_failed`" | auth | | open |
| S1-079 | "Wrong password or unknown email on login \| 401 `unauthenticated`" | auth | | open |
| S1-080 | "The handle derived from the email (§4) is already taken \| 409 `handle_taken`, and no account is created" | auth | | open |
| S1-081 | "Every other endpoint requires a bearer token, except `/health`, `/_test/reset` and the two above." | auth | | open |
| S1-082 | "Tokens do not expire. An account may have multiple valid tokens and concurrent sessions." | auth | | open |
| S1-083 | "Passwords must be stored using a password-hashing function ... Plaintext password storage is not permitted." | auth | | open |

## §7 Idempotency

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-084 | "Five write paths require an idempotency key: `POST /payments`, `POST /requests`, `POST /requests/{id}/pay`, `POST /splits` and `POST /settlements`." | idempotency | | open |
| S1-085 | "The key is scoped to **the authenticated user**. Two different users may use the same key string with no interaction between them." | idempotency | | open |
| S1-086 | "The same key with the same body on a different path is a different request, not a replay, and must succeed normally." | idempotency | | open |
| S1-087 | "First use of the key \| The normal response, **201**" | idempotency | | open |
| S1-088 | "Replay: same key, same body \| **200**, body identical to the original response as a JSON value" | idempotency | | open |
| S1-089 | "Same key, different body \| 409 `idempotency_key_reuse`" | idempotency | | open |
| S1-090 | "Key reused after the original request failed with 4xx \| Treated as a first use" | idempotency | | open |
| S1-091 | ""Same body" means the same JSON value after parsing — key order and whitespace do not matter." | idempotency | | open |
| S1-092 | "For concurrent identical requests with an unused key, exactly one returns 201. The others return 200 with the same body. The operation takes effect only once." | idempotency | | open |
| S1-093 | "A successful replay returns the original response, even after the resource changes or is cancelled. It makes no further state changes." | idempotency | | open |
| S1-094 | "an already claimed key is resolved before endpoint field validation or current-resource checks. Thus changing a successful request to an invalid body with the same key still returns `409 idempotency_key_reuse`." | idempotency | | open |

## §8 API

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-095 | "`GET /me`: `{ "user_id", "display_name", "handle", "balance", "currency", "minor_units" }`" | me | | open |
| S1-096 | `POST /payments` 201 body: payment_id, from_user_id, from_handle, to_user_id, to_handle, amount, currency, note, visibility, request_id null, created_at | payments | | open |
| S1-097 | "`note` is optional and defaults to `""`. `visibility` is optional and defaults to `"public"`." | payments | | open |
| S1-098 | "The caller's balance is below `amount` \| 409 `insufficient_funds`" | payments | | open |
| S1-099 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (payments) | payments | | open |
| S1-100 | "`to_handle` is the caller's own handle \| 422 `self_payment`" | payments | | open |
| S1-101 | "`note` longer than 200 characters \| 422 `validation_failed`" (payments) | payments | | open |
| S1-102 | "`visibility` is neither `public` nor `private` \| 422 `validation_failed`" | payments | | open |
| S1-103 | "No user has that handle \| 404 `not_found`" (payments) | payments | | open |
| S1-104 | "The debit and the credit are one atomic step. A payment is never visible in one wallet and not the other, and a failed payment leaves no trace in either." | payments | | open |
| S1-105 | "`note` is stored and returned verbatim: no trimming, no escaping, no normalisation. Unicode and emoji survive a round trip byte for byte." | payments | | open |
| S1-106 | `POST /requests` 201 body: request_id, requester_id, requester_handle, payer_id, payer_handle, amount, currency, note, status pending, payment_id null, created_at; "The caller is the requester." | requests | | open |
| S1-107 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (requests) | requests | | open |
| S1-108 | "`payer_handle` is the caller's own handle \| 422 `self_request`" | requests | | open |
| S1-109 | "`note` longer than 200 characters \| 422 `validation_failed`" (requests) | requests | | open |
| S1-110 | "No user has that handle \| 404 `not_found`" (requests) | requests | | open |
| S1-111 | "**The payer's balance is not checked here.** A request for more than the payer holds is created normally and sits `pending`." | requests | | open |
| S1-112 | "The body carries `visibility` only, optional, default `"public"`. It is the payer's choice, not the requester's." | pay | | open |
| S1-113 | "**A replay must send the identical body** — `{}` and `{"visibility": "public"}` are different JSON values, so reusing a key across the two is `409 idempotency_key_reuse`" | pay | | open |
| S1-114 | "Returns `201` with the created **payment**, exactly as `POST /payments` returns one, with `request_id` set to this request. The request becomes `paid` and carries the new `payment_id`." | pay | | open |
| S1-115 | "The request is not `pending` \| 409 `request_not_pending`" | pay | | open |
| S1-116 | "The payer's balance is below `amount` \| 409 `insufficient_funds`" (pay) | pay | | open |
| S1-117 | "The caller is not the request's payer \| 403 `forbidden`" | pay | | open |
| S1-118 | "Unknown request \| 404 `not_found`" | pay | | open |
| S1-119 | "Replaying a successful payment returns 200 with its original payment body, including when the request is already `paid`. It moves no additional money and must not return `409 request_not_pending`." | pay | | open |
| S1-120 | "Returns `200` with the request, `status: "declined"`. Declining an already-declined request is `200` with the current state" | decline | | open |
| S1-121 | "A `paid` or `cancelled` request is `409 request_not_pending`." (decline) | decline | | open |
| S1-122 | "Not the payer is `403 forbidden`." (decline); "No idempotency key." | decline | | open |
| S1-123 | "Returns `200` with the request, `status: "cancelled"`. Cancelling an already-cancelled request is `200`." | cancel | | open |
| S1-124 | "A `paid` or `declined` request is `409 request_not_pending`." (cancel) | cancel | | open |
| S1-125 | "Not the requester is `403 forbidden`." (cancel); "No idempotency key." | cancel | | open |
| S1-126 | "Requests where the caller is the requester or the payer, and no others. Newest first by `created_at`." | list requests | | open |
| S1-127 | "`direction` is `incoming` (the caller is the payer), `outgoing` (the caller is the requester) or absent for both." | list requests | | open |
| S1-128 | "`status` is one of the four statuses, or absent for all." | list requests | | open |
| S1-129 | "`limit` defaults to 50, range 1 to 200. `offset` defaults to 0 ... An unknown `direction` or `status` value is also 422." | list requests | | open |
| S1-130 | "`has_more` is true when items exist beyond the last one returned." | list requests | | open |
| S1-131 | "`{ "requests": [ { ...request... } ], "has_more": false }`" | list requests | | open |
| S1-132 | "The caller may be included in `participant_handles` or omitted. Shares follow the equal-split rule in §9, in the order the handles are given." | splits | | open |
| S1-133 | "**A request is created for every participant except the caller**, each for that participant's share, with the caller as requester." | splits | | open |
| S1-134 | "`shares` covers every participant including the caller, in the order given, and always sums to `amount`. `requests` covers every participant except the caller, in the same order." (+ split_id, amount, currency, note, created_at) | splits | | open |
| S1-135 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (splits) | splits | | open |
| S1-136 | "`participant_handles` empty, or containing a duplicate handle \| 422 `validation_failed`" | splits | | open |
| S1-137 | "`note` longer than 200 characters \| 422 `validation_failed`" (splits) | splits | | open |
| S1-138 | "Any handle is unknown \| 404 `not_found`" (splits) | splits | | open |
| S1-139 | "A split whose only participant is the caller is **valid**: it computes one share, creates zero requests, and returns `"requests": []`." | splits | | open |
| S1-140 | "Nothing about a split checks anyone's balance." | splits | | open |
| S1-141 | "Payments visible to the caller by the feed contract in §4, newest first by `created_at`." `{ "payments": [...], "has_more": ... }` | activity | | open |
| S1-142 | "`limit` and `offset` behave exactly as in `GET /requests`." (activity) | activity | | open |

## §9 Money and rounding

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-143 | "Shares must be whole minor units, sum exactly to `amount` and differ by at most one minor unit. When the amount does not divide evenly, the larger shares go to the first participants in `participant_handles` order." | rounding | | open |
| S1-144 | "1000 \| 3 \| 334, 333, 333" | rounding | | open |
| S1-145 | "1 \| 3 \| 1, 0, 0" | rounding | | open |
| S1-146 | "10 \| 3 \| 4, 3, 3" | rounding | | open |
| S1-147 | "999 \| 3 \| 333, 333, 333" | rounding | | open |
| S1-148 | "5 \| 5 \| 1, 1, 1, 1, 1" | rounding | | open |
| S1-149 | "Splitting the same amount among the same people in a different `participant_handles` order gives the extra unit to a different person." | rounding | | open |
| S1-150 | "A share of `0` is legal and still produces a request for that participant." | rounding | | open |
| S1-151 | "Each split's shares are independent of previous splits. After any number of splits have been paid in full, wallet balances must still sum exactly to the seeded total." | rounding | | open |

## §10 Export and import

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-152 | "The service must support `GET /_test/export` and `POST /_test/import`. Like reset, these are unauthenticated test endpoints." | export | | open |
| S1-153 | "Return 200 from export with a JSON object containing `track: "pocketful"`, `format_version: 1` and `state` (an implementation-defined JSON object)." | export | | open |
| S1-154 | "Import takes that entire object and atomically replaces the service's state, returning 204. It must accept an unchanged export produced by this service." | import | | open |
| S1-155 | "No dependency on the source process, files, volume, port or network address is allowed." | import | | open |
| S1-156 | "Import is replacement, not merge; repeating it restores the exported state without duplicating anything." | import | | open |
| S1-157 | "Invalid JSON follows §5" (400 `malformed_request`) | import | | open |
| S1-158 | "missing fields, wrong track/version or an invalid state give 422 `validation_failed` without changing the destination." | import | | open |
| S1-159 | "Test control calls have a 10-second timeout." | import | | open |
| S1-160 | "Export is an atomic, read-only snapshot; subsequent source writes do not change it." | export | | open |
| S1-161 | "Preserve accounts and hashed-password login, existing bearer tokens, currency, balances, payments, requests, permissions, all completed idempotent request bodies and original responses." | import | | open |
| S1-162 | "Identities, timestamps and monetary records must not be regenerated or replayed against an already-net balance." | import | | open |
| S1-163 | "Failed request keys remain reusable." | import | | open |
| S1-164 | "Existing receipts, tokens and retries must remain valid after import" | import | | open |
| S1-165 | "Import removes all previous destination data and credentials." | import | | open |
| S1-166 | "Reset clears all state, including imported state." | reset | | open |

## §11 Atomic net settlements

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-167 | "The reset fixture may include `settlement_operator_ids`, an array of user ids, default []." | settlements | | open |
| S1-168 | "An operator may execute a settlement across any wallets." | settlements | | open |
| S1-169 | "This permission does not grant access to another user's requests or private activity items." | settlements | | open |
| S1-170 | "`POST /settlements` requires an operator and an idempotency key. No token gives 401; authenticated non-operator gives 403 `forbidden`." | settlements | | open |
| S1-171 | "transfers contains 1..32 objects." | settlements | | open |
| S1-172 | "Each uses ordinary payment amount, note and visibility rules (defaults: empty note, public)." | settlements | | open |
| S1-173 | "Unknown handle is 404" (settlements) | settlements | | open |
| S1-174 | "self-transfer is 422 `self_payment`" | settlements | | open |
| S1-175 | "malformed batch shape is 422 `validation_failed`." | settlements | | open |
| S1-176 | "Entry errors take precedence in input order, before insufficient funds." | settlements | | open |
| S1-177 | "Unknown fields are ignored." (settlements) | settlements | | open |
| S1-178 | "A settlement is affordable when every wallet's balance after all incoming and outgoing transfers is nonnegative." | settlements | | open |
| S1-179 | "Insufficient collective funds gives 409 `insufficient_funds`." | settlements | | open |
| S1-180 | "Either all movements commit together or none do; failed validation claims no idempotency key and creates no payment or revision." | settlements | | open |
| S1-181 | "Return 201 with `settlement_id`, `committed_at` and `payments` in input order." | settlements | | open |
| S1-182 | "Every member is an ordinary payment with `settlement_id` linking the batch; nonmembers expose null for that field." | settlements | | open |
| S1-183 | "Members have null request_id and the same server-assigned created_at, equal to committed_at." | settlements | | open |
| S1-184 | "Constituents follow ordinary activity-feed visibility. The settlement response contains every member's receipt." | settlements | | open |
| S1-185 | "Replays return 200 with the original complete response." (settlements) | settlements | | open |
| S1-186 | "A reset/import must preserve settlement operator permissions, original payments, requests, settlement membership and retry responses." | settlements | | open |

## Decisions (test-designer)

Choices made where the requirements leave room; each test that depends on one names it.

- **D1 Tokens across a reset.** Reset "replace[s] all service state" and "Reset clears all state", so a token
  issued before a reset is `401 unauthenticated` afterwards, even when the same fixture is loaded again.
- **D2 Explicit offset.** RFC 3339 `Z` and `±hh:mm` both count as an explicit offset; a timestamp without
  any offset fails.
- **D3 Other fixture rules.** A fixture that breaks a stated rule — `minor_units` outside 0, 2, 3, a handle not
  matching `^[a-z0-9_]{1,20}$`, two users with one handle — is "a stated rule ... violated with no more
  specific code": `422 validation_failed` from reset, and the previous state is unchanged (as S1-055).
- **D4 Seeded ids.** Fixture ids are the ids the API returns (`GET /me` example: `"user_id": "u_ada"`;
  seeded `p_1` / `rq_1` are the `payment_id` / `request_id`).
- **D5 Characters.** "Characters" in length limits and in handle derivation are Unicode code points: one
  emoji is one character, not 2 UTF-16 units or 4 bytes.
- **D6 Handles outside the pattern.** A `to_handle` / `payer_handle` that cannot be a handle (`ADA`, `@ada`,
  `""`) may be 404 `not_found` or 422 `validation_failed`; the requirements do not choose.
- **D7 Third parties on a request.** pay/decline/cancel by someone who is neither party may be 403
  `forbidden` or 404 `not_found` ("not visible to this caller").
- **D8 Settlement shape versus entries.** The order between a batch-shape error and an entry error is not
  stated; tests check each alone and the stated entry-order and entry-before-funds precedence.
- **D9 Body that is not a JSON object.** A top-level array or scalar body may be 400 `malformed_request` or
  422 `validation_failed`, never 2xx or 5xx.
- **D10 Plaintext passwords.** Export "may contain credentials" but storage must be hashed, so an export
  must not contain a user's plaintext password anywhere in its text.
- **D11 Unstated defaults.** The requirements give no default `note` for `POST /requests` or `POST /splits`;
  tests always send one there.
