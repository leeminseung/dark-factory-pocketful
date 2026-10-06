# Case memory

Defects from earlier runs of this factory that passed the acceptance suite and were caught
later by a review. Each is written as a case to try, in general terms, followed by what was
seen. A case joins this list only when it can be stated without any one product's terms.

## Numbers and sizes

- **Integers near and above 2^53 − 1** in requests, seeded data and imported state. A parser
  that reads numbers as doubles rounds them silently. Check that each stated limit holds
  exactly and that a larger value is refused before it is stored.
  Seen: an imported counter above 2^53 accepted, after which the next write hung the service.
- **The service's own export, imported back at its largest:** an export bigger than the
  request body limit, and one holding values near the numeric limits.
  Seen: import refused the service's own export once it passed 1 MiB, and again once its
  amounts neared 2^53.

## Malformed requests

- **A request target that cannot be parsed, a deeply nested body, a header of tens of
  kilobytes.** Each gets the status and body the requirements define, never a 500 or an empty
  body.
  Seen: 500 for an unparseable target; 500 for deep nesting on every idempotent write path; 431
  with an empty body for a 64 KB header.

## Text

- **Length limits on keys and headers count characters, not bytes.**
  Seen: a key's length counted in UTF-8 bytes.
- **A browser `maxlength` counts UTF-16 code units,** so each emoji counts twice. Text limited
  in characters needs its own check on screens.
  Seen: a pasted note of 201 emoji silently cut to 200.

## Dates and times

- **Instants before 1970, the years 0000 and 9999, fractions below a millisecond, and offsets
  that move the date across midnight.**
  Seen: valid instants before 1970 refused; digits below the millisecond truncated, so a record
  counted as existing before it happened.
- **Calendar-invalid dates** such as 30 February, in every date the product accepts, seeded
  and imported data included.
  Seen: a reset accepted an impossible date in seeded data.
- **Durations large enough that a computed timestamp leaves the format's range.**
  Seen: a very large time-to-live produced an expiry that was not valid RFC 3339.
- **Two changes to one record in the same millisecond.**
  Seen: the second change was recorded ahead of the service clock.

## Seeded and imported state

- **Seeded records whose fields contradict each other,** such as a status that says expired
  while the expiry time is still ahead. Decide from the requirements which field wins, and
  check every place the record is read.
  Seen: such a record treated as active in one view and as expired in another.
- **Seeded records that carry their own timestamps.** Lists keep their required order.
  Seen: a list stopped being newest first once seeded records carried creation times.
- **Fields the data format does not define.** Ignore or refuse them as the requirements say,
  never treat them as meaningful.
  Seen: a reset read a field that is not part of the fixture format, and could fail on it.
- **Imports that are tampered with, inconsistent or missing required fields.** Refuse them at
  import, instead of accepting them and failing later.
  Seen: an import with a malformed snapshot accepted, after which reading it gave 500; an
  import missing timestamps installed zero times.

## Sessions across a reset or an import

- **A token issued before a reset or an import, a sign-in that overlaps a reset, and a write
  authenticated just before one.** Decide and test what each does afterwards.
  Seen: a write authenticated before a reset committed into the new state; a sign-in that
  overlapped a reset was held past the stated time limit and then refused; an old link sent
  the user to the wrong screen.

## Retries

- **An operation retried after its input was edited and then changed back** keeps its retry
  identity, so an uncertain write is not applied twice.
  Seen: editing a form and restoring its values discarded the retry identity.

## Errors in a batch

- **Several invalid items in one request, together with a problem in the request's shape.**
  The error returned follows the stated precedence.
  Seen: the shape check ran before the item checks it should follow.

## Limits under load

- **Stated time limits measured with the largest state the requirements allow and with
  concurrent requests,** not on an empty service.
  Seen: a read scanned every record under a shared lock, so writes took over 5 s with 50
  requests in flight.

## Screens

- **Lists longer than one page.** The screens follow the paging marker.
  Seen: the screens fetched only the first 200 items and never asked for the next page.

## Changes that broke behaviour

- **A commit labelled as restructuring.** Check that the behaviour around it is unchanged.
  Seen twice: one changed what a reset does; one made an import accept records without
  timestamps.
- **A small fix for a non-blocking finding, above all on a screen.** Check the flows it did
  not mean to touch.
  Seen: a polish fix on a screen sent an old sign-up link to the sign-in page after a reset.
