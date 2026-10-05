# Case memory

Defects that passed the acceptance suite and were caught later by a review. Read at the start of each stage.

- Import an export after editing a record's id to more than the stated maximum length, or an email to a malformed
  value: import must refuse it the same way reset does. (Stage 1, S1-R1, round-1 review.)
- Retry an idempotent write at a path spelled differently but routed to the same resource (trailing slash,
  percent-encoded id): it must replay, not act again. (Stage 1, S1-R2, round-1 review.)
- Import an export with timestamps outside the formattable range (huge epoch values, year 10000), then read and write:
  no 5xx, no non-RFC 3339 output, and a failed write must not commit money or claim its key. (Stage 1, S1-R11 / F1,
  test-designer probe in round 2 and final review.)
- Import an export whose records contradict each other (a paid request set back to pending, links to missing records,
  split shares not summing to the total, corrupted idempotency records): refuse with 422; never let a request be paid
  twice. (Stage 1, S1-R12 / F2, test-designer probe in round 2 and final review.)
- Send amounts that are non-integers very close to an integer (1.0000000000000001, 1000000000.0000000001) and
  integers just above 2^53: must be refused, not rounded. Same for fixture balances. (Stage 1, S1-R13, S1-R14, final review.)
- Put a field in a fixture record that the fixture format does not define (e.g. a link id): it must be ignored, not
  read or rejected. (Stage 1, S1-R15, final review.)
- Reset with a large fixture (1000+ users, all distinct passwords) and send a login during it: reset must finish within
  its time limit and other requests within theirs. (Stage 1, S1-R16 / S1-013, final review and round-3 probe.)
- Reset with a configuration value (a lifetime or duration) just under its accepted bound, export, wait a few seconds,
  and import the unchanged export; also create records later and check derived timestamps are exact, never clamped.
  A bound that depends on the current time fails this. (Stage 2, S2-R10/S2-R11 / S2-102, round-2 probe and final review.)
- Page through a list that is longer than one page while another client writes between page reads: no row may appear
  twice. (Stage 2, S2-R12, final review.)
- Remove one newer-stage key from an export so it looks like an older-stage export: import must refuse it unless it
  really is the older format, not silently drop links. (Stage 2, S2-R13, final review.)
- Edit any single field of a stored idempotency receipt in an export (ids, amounts, notes, statuses, handles, nested
  records): import must refuse it; unedited exports with later legitimate state changes must still import and replay.
  (Stage 2, S2-R14 and F2 / S1-158 / S2-158, final review and round-3 probe; present since stage 1.)
- On a form with retry keys, after a confirmed success, edit a field and change it back, then submit: a new operation
  must be sent. (Stage 2, S2-R1, round-1 review.)
- Render the headline money figure at the largest legal balance in every currency at 375 px: no horizontal scroll.
  (Stage 2, S2-R15, final review.)
