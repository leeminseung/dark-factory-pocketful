# Glossary

Terms the requirements define or rely on, in the requirements' own words. "§" refers to the stage spec.

| Term | Meaning | Defined in |
|---|---|---|
| minor units | "All amounts are exact integer counts of minor units." `1000` with `minor_units: 2` is €10.00; with `minor_units: 0` it is ¥1000. | stage 1 §1, §4 |
| currency | "The service has **one currency**, declared in the fixture." | stage 1 §4 |
| `minor_units` | "`0`, `2` or `3`. Fixtures use `EUR` (2), `JPY` (0) and `BHD` (3)." | stage 1 §4 |
| amount | An integer count of minor units; "at most `1000000000` on any single request"; JSON `1000`, `1000.0` and `1e3` are the same amount; "Booleans and strings are not numbers here." | stage 1 §4 |
| wallet / balance | Each user's holding; "No wallet balance may be negative"; "New users start with a balance of `0`." | stage 1 §1, §4 |
| seeded total | "the total seeded by the last `POST /_test/reset`"; the sum of wallet balances always equals it. | stage 1 §1 |
| handle | "unique across the service, matching `^[a-z0-9_]{1,20}$`, and never changing once set. Users identify recipients by handle." | stage 1 §4 |
| derived handle | For a signed-up user: "take the local part, lowercase it, replace every character outside `[a-z0-9_]` with `_`, and truncate to 20 characters." | stage 1 §4 |
| payment | "moves money from one wallet to another, immediately and atomically. It is either sent directly or created by paying a request." | stage 1 §4 |
| request | "asks someone for money. The `requester` will receive; the `payer` is being asked." | stage 1 §4 |
| requester | The user who will receive; the caller of `POST /requests`; the only one who may cancel. | stage 1 §4, §8 |
| payer | The user being asked; the only one who may pay or decline. | stage 1 §4 |
| request status | "`pending`, and then exactly one of `paid`, `declined` or `cancelled`." | stage 1 §4 |
| visibility | `public` or `private`; "belongs to the payment, not the request. The payer chooses it when the money moves." Default `public`. | stage 1 §4, §8 |
| private payment | "hidden from third parties, not from its own receiver." | stage 1 §4 |
| third party | A caller who is neither the sender nor the receiver of a payment (or neither party of a request). | stage 1 §4 |
| activity feed | `GET /activity`: "returns payments only"; a payment appears "if and only if its `visibility` is `public`, or the caller is its sender or its receiver." | stage 1 §4, §8 |
| split | `POST /splits`: "Splits an amount the caller already paid, and asks each of the other participants for their share by creating one `pending` request each." Not a feed item. | stage 1 §8 |
| share | A participant's part of a split: whole minor units, summing to `amount`, differing by at most one; larger shares to the first participants in `participant_handles` order. | stage 1 §9 |
| note | Free text, optional on payments (default `""`), at most 200 characters, "stored and returned verbatim". | stage 1 §8 |
| fixture | The JSON body of `POST /_test/reset`: `currency`, `minor_units`, `users`, `payments`, `requests`, optional `settlement_operator_ids`. | stage 1 §4, §11 |
| reset | `POST /_test/reset`: "Replace all service state with the fixture"; 204; unauthenticated. | stage 1 §3.3 |
| idempotent write path | One of `POST /payments`, `POST /requests`, `POST /requests/{id}/pay`, `POST /splits`, `POST /settlements`; each requires an `Idempotency-Key`. | stage 1 §7, §11 |
| Idempotency-Key | Client-chosen header, "1..255 characters", "scoped to **the authenticated user**". | stage 1 §7 |
| replay | "the same user sending the **same method, the same path and the same body**" with the same key; answered 200 with the original body. | stage 1 §7 |
| same body | "the same JSON value after parsing — key order and whitespace do not matter." | stage 1 §7 |
| claimed key | A key whose first use succeeded; it is "resolved before endpoint field validation or current-resource checks". A key whose request failed with 4xx is not claimed. | stage 1 §7 |
| token | Bearer token from signup or login; "Tokens do not expire. An account may have multiple valid tokens". | stage 1 §6 |
| export | `GET /_test/export`: 200 with `track: "pocketful"`, `format_version: 1`, `state`; "an atomic, read-only snapshot". | stage 1 §10 |
| import | `POST /_test/import`: takes an export and "atomically replaces the service's state, returning 204"; "replacement, not merge". | stage 1 §10 |
| settlement operator | A user listed in the fixture's `settlement_operator_ids`; "may execute a settlement across any wallets". | stage 1 §11 |
| settlement | `POST /settlements`: a batch of 1..32 transfers committed all together or not at all. | stage 1 §11 |
| transfer | One entry of a settlement: `from_handle`, `to_handle`, `amount`, optional `note`, `visibility`. | stage 1 §11 |
| affordable | "every wallet's balance after all incoming and outgoing transfers is nonnegative." | stage 1 §11 |
| member payment | A payment created by a settlement; carries its `settlement_id`, null `request_id`, `created_at` equal to `committed_at`. Nonmembers expose `settlement_id: null`. | stage 1 §11 |
