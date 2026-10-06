# Pocketful — stage 4

An HTTP service for payments, requests, splits, an activity feed, operator settlements,
payment authorizations (holds, captures, voids), historical balances, statements, payment
corrections, refunds and operator correction batches, with browser screens.
Node.js 22, no third-party packages; all state is held in memory.

## Build and start

From this folder:

```sh
docker build -t pocketful-stage-4 . && docker run --rm -e PORT=8080 -p 8080:8080 pocketful-stage-4
```

The service listens on `0.0.0.0:$PORT` (default `8080`) and answers `GET /health` with
`200 {"status": "ok"}` as soon as it is listening. Seed it with `POST /_test/reset`.

## Without Docker

```sh
PORT=8080 node src/main.js
```

## Tests

```sh
npm test
```

Runs the service's own tests (`test/*.test.js`) against an in-process server; needs Node 22 or later.

Screen checks (layout and browser behaviour the Node tests cannot see):

```sh
python3 test/screen_checks.py
```

Needs Python with Playwright and Chromium (`pip install playwright && playwright install chromium`). It
starts the service on a free port, seeds it and checks the screens at 375 px and 1280 px; exit 0 means all pass.

## Layout

| Path | Holds |
|---|---|
| `src/main.js` | entry point |
| `src/server.js` | HTTP plumbing: body parsing, authentication, idempotency wrapper, error responses |
| `src/routes.js` | every endpoint and what must be established before its handler runs |
| `src/state.js` | the in-memory state; `movePayments`, the one gate every balance change goes through, and `correctPayments`, the one gate for corrections |
| `src/validate.js`, `src/paging.js` | shared field rules and list parameters |
| `src/idempotency.js` | §7 key resolution and replay |
| `src/fixture.js`, `src/snapshot.js` | reset fixtures, export and import |
| `src/handlers/` | one module per resource |
| `src/records.js` | the one validator for reset and import, and building a State |
| `src/ledger.js` | history: balances and holds as of an instant, statements, overdraft checks |
| `src/pages.js`, `public/` | the screens (single page) and their bundled assets |
