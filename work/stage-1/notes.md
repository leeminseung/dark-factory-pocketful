# Stage 1 — implementer notes

## Design decisions

- **In-memory state on one Node event loop.** Every handler that changes money runs its check and
  its change synchronously, with no `await` in between, so no other request can interleave.
  That one fact gives §1 atomicity, §7 "exactly one 201" for concurrent identical keys, and §11
  all-or-nothing settlements without locks. Disk state is not required (§2). The cost: the service is
  one process, and any future handler that awaits between check and change would break the
  guarantee. `runIdempotent` refuses an operation that returns a Promise, to catch that.
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
- **Passwords**: scrypt (N=16384, r=8, p=1, 16-byte random salt). Import accepts only hashes with these
  parameters, so an imported state cannot request an expensive derivation.
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

(none yet)
