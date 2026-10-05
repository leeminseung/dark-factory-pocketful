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
