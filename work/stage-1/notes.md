# Stage 1 — implementer notes

## Design decisions

- **In-memory state on one Node event loop.** Every handler that changes money runs its check and
  its change synchronously, with no `await` in between, so no other request can interleave.
  That one fact gives §1 atomicity, §7 "exactly one 201" for concurrent identical keys, and §11
  all-or-nothing settlements without locks. Disk state is not required (§2). The cost: the service is
  one process, and any future handler that awaits between check and change would break the
  guarantee. `defineRoutes` refuses an async idempotent handler at startup, before it could run (R8), and
  `runIdempotent` still refuses a sync handler that returns a Promise.
- **One money gate.** `State.movePayments` is the only code that changes a balance. It nets the
  batch per wallet, rejects with `insufficient_funds` if any wallet would end below zero, then sets
  each balance once. Single payments, paying a request and settlements all go through it.
- **One state reference per request.** `store.current` is read once per request after the body is
  read. Reset and import build a complete new `State` off to the side and swap it in, so a rejected
  fixture or snapshot changes nothing, and a request that overlaps a reset finishes against the state
  it started with.
- **Idempotency scope = (user, method, path, key)**, with the canonical JSON of the body (sorted keys)
  as the fingerprint. The order is: authenticate → operator check (settlements) → key header →
  parse body → resolve a claimed key → field validation and resource checks. Only 201 results are
  recorded, so a key used by a failed (4xx) attempt stays free.
- **Passwords** (R16, S1-013 F3): scrypt (r=8, p=1), K = scrypt(password, salt), stored with a per-user
  salt as HMAC-SHA256(K, userSalt). Signup always uses full strength, N=16384 (about 25 ms).
  A reset must fit 10 s whatever the user count, so it hashes the fixture as one batch:
  - equal passwords share one derivation;
  - N is the largest power of two from 16384 down to 256 at which the batch fits a 4 s budget on two
    workers. The budget comes from one full-strength derivation measured at startup. For example,
    300 distinct passwords stay at N=16384, 1000 get N=4096, and 3000 get N=1024;
  - a seeded hash below full strength is replaced with a full-strength one at that user's first
    successful login.

  Trade-off: until a seeded user first logs in, their hash is up to 64 times cheaper to attack than a
  signup's, and users seeded with the same password share its scrypt salt. These are test fixtures
  loaded through an unauthenticated test endpoint, and every stored hash is still a salted scrypt
  hash; I chose that over a reset that overruns its limit. Beyond about 20000 distinct passwords,
  even N=256 exceeds the budget. Import accepts only these parameters (N a power of two in
  256..16384).
- **IDs** are generated as `<prefix>_<12 random base64url chars>` and checked against the existing ids,
  so they never collide with ids from a fixture or an import.
- **Timestamps** are kept as epoch ms and formatted as `…T…Z` with `+00:00`. A per-state clock never
  runs backwards, so the creation order of payments and requests matches `created_at` order. Lists
  are newest first by creation order. Seeded payments and requests all get the reset time, in fixture
  order (a later entry counts as newer).

## Interpretations

- **Third party on a request** (pay, decline, cancel by someone who is neither party): 403 `forbidden`.
  §8 says "The caller is not the request's payer | 403", and the supplied check
  `test_only_the_payer_may_pay` expects 403 from a third party. Unknown request ids are 404.
- **Handles that cannot exist** (`ADA`, `@ada`, `""`) as `to_handle`/`payer_handle`/participants: 404
  `not_found` (the endpoint's "no user has that handle" row), not 422.
- **Emails compare case-insensitively** for signup uniqueness and login; the email is stored as given.
- **Wrong JSON types**: 400 `malformed_request` for top-level fields (`to_handle: 7`,
  `participant_handles: "ada"`), except the §5 field rules (`amount`, `note`, `visibility` are 422).
  Inside a settlement's `transfers`, every shape error is 422 (§11 "malformed batch shape is 422").
  A body that is not a JSON object is 400, and so is an empty body: it does not parse, and §7 resolves a
  claimed key only after the body parsed. Decline and cancel define no body: none or an
  empty one is accepted, but a body that is sent must parse as a JSON object (ruling R3).
- **Fixture rules** beyond negative balance (minor_units, handle pattern, duplicate ids/emails/handles,
  unknown user references, unknown operator ids, seeded totals over 2^53) are 422; wrong JSON types
  in a fixture are 400. Seeded payment and request amounts may be 0 (a paid zero share).
- **Settlement checks**: operator first (403), then key, then the batch. Entries are checked one by one in
  input order (fields, then handles, then self-transfer); the first defective entry decides the error;
  funds are checked last, on net totals.
- **Header size**: Node's limit is raised to 1 MiB so a 64 KB header is served normally; anything larger,
  or a request Node cannot parse, is answered from the `clientError` hook with the §5 body (431 or 400,
  code `malformed_request`).
- **Idempotency-Key** bytes are decoded as UTF-8 before counting characters (Node hands headers over as latin1).
- **Offset** accepts any digit string; one past the end gives an empty page.

## Unfixed non-blocking findings

- R4: ruled no change (decisions.md): pay with an empty body stays 400.
- R10, R19, R21 (commit discipline): history cannot be rewritten. 7d084dc was labelled a restructure
  but also made import stricter, and b82da36 claimed "links" were checked when only their form was
  (now done in 01d0aa6). The commits from round 3 on separate restructuring from behaviour, and each
  message states what the commit does.
- R17: kept. A fixture or import whose balances total more than 2^53 is 422. §4 says "no operation
  produces a balance outside ±2⁵³", and in such a state one payment between two wallets could break
  that, so the state is outside the model.
- R23: a synchronous handler that returns a Promise cannot be detected before it runs. Since 667a5f0
  every synchronous handler runs in a State transaction, so when runIdempotent refuses the Promise,
  the changes made so far are undone and no key is recorded (state.test.js). Work the Promise does
  later would still escape; no handler does this, and defineRoutes refuses async handlers.
