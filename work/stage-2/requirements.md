# Stage 2 — requirement list

Source: `pocketful/spec/stage-2.md` (read-only), which builds on `stage-1.md`. One row per testable
requirement. Status values: open, tested, passing, failing, disputed, not testable (with the reason).
Tests are named `file::function` under `work/acceptance/tests/stage_2/`. "judged" rows are product
qualities with no single observable rule; they are checked where a measurable proxy exists and are
otherwise left to the product-designer's screen review.

## Stage 1 rows this stage changes

All stage-1 rows still apply and the stage-1 suite runs against every stage-2 build. These rows gain
stage-2 behaviour; their stage-1 tests still hold because they only run with no open holds.

| Stage-1 row | Change in stage 2 | Covered by |
|---|---|---|
| S1-001 | the invariant is over wallet `total` values (S2-080) | S2-080 |
| S1-002 | `available = total − held` is never negative (S2-081) | S2-081 |
| S1-052 | fixture gains `authorization_ttl_seconds` and `authorizations` (S2-090..S2-096) | S2-090..S2-096 |
| S1-084 | seven idempotent write paths, not five (S2-089) | S2-089 |
| S1-095 | `GET /me` gains `total`, `available`, `held` (S2-084, S2-099) | S2-084, S2-099 |
| S1-096 | payments gain `authorization_id` (S2-113) | S2-113 |
| S1-098, S1-116, S1-179 | `insufficient_funds` is judged against `available` (S2-086) | S2-086 |
| S1-126 | `GET /requests` with `Accept: text/html` returns the UI (S2-009) | S2-009 |
| S1-161 | export/import also preserves authorisations, holds and captures, and accepts a stage-1 export (S2-078, S2-158) | S2-078, S2-158 |

## Intro and routes

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-001 | "The stage-1 requirements continue to apply, with the additions below." | stage | the whole stage-1 suite, `tests/stage_1/` (run.sh runs suites 1..N against the stage-N build) | tested |
| S2-002 | "`/` \| Balance, pay form, request form and the activity feed" | routes | test_ui.py::test_routes_reachable_by_url | tested |
| S2-003 | "`/requests` \| Incoming and outgoing requests, with pay, decline and cancel" | routes | test_ui.py::test_request_lists_and_buttons<br>test_ui.py::test_routes_reachable_by_url | tested |
| S2-004 | "`/split` \| Split form" | routes | test_ui.py::test_routes_reachable_by_url | tested |
| S2-005 | "`/signup` \| Signup" | routes | test_ui.py::test_signup_and_login_reachable_signed_out | tested |
| S2-006 | "`/login` \| Login" | routes | test_ui.py::test_signup_and_login_reachable_signed_out | tested |
| S2-007 | "Other screens must be reachable through the UI." (`/authorizations` from the navigation) | routes | test_ui.py::test_authorizations_reachable_through_the_ui | tested |
| S2-008 | "Server-side and client-side rendering are both permitted." | routes | — | not testable: states a freedom |
| S2-009 | "The browser and the API share `/requests`. Return the UI for `Accept: text/html`; API requests without that header receive JSON." | routes | test_authorizations_api.py::test_html_for_browsers_json_otherwise | tested |
| S2-010 | "The UI must expose the `data-testid` attributes listed below" | routes | test_ui.py::test_routes_reachable_by_url | tested |

## Product and visual direction

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-011 | "feel like a coherent, presentation-ready consumer finance product, not a test harness with controls attached. Aim for a calm, trustworthy character." | quality | — | not testable: judged (product-designer screen review) |
| S2-012 | "Available funds must be the clearest monetary value once holds exist, with total and held funds visibly secondary." | quality | test_ui.py::test_available_is_the_headline | tested |
| S2-013 | "status, direction, privacy and money movement should be understandable without interpreting raw API data." | quality | test_ui.py::test_no_raw_identifiers_or_timestamps | tested |
| S2-014 | "Use a consistent visual system for typography, spacing, colour, controls and feedback." | quality | — | not testable: judged (product-designer screen review) |
| S2-015 | "Primary actions must be easy to identify." | quality | — | not testable: judged (product-designer screen review) |
| S2-016 | "Available, held, pending, loading, successful, refused and uncertain states must be visually distinct" | quality | test_ui.py::test_available_is_the_headline<br>test_ui.py::test_error_and_uncertain_look_different | tested |
| S2-017 | "Format people, amounts and timestamps for people first; expose technical identifiers only where they help the user." | quality | test_ui.py::test_no_raw_identifiers_or_timestamps | tested |
| S2-018 | "clear and usable at a 375 CSS-pixel viewport and at conventional desktop widths, without horizontal page scrolling." | quality | test_ui.py::test_no_horizontal_scroll | tested |
| S2-019 | "Inputs need visible labels" | quality | test_ui.py::test_inputs_have_visible_labels | tested |
| S2-020 | "keyboard focus must be apparent" | quality | test_ui.py::test_keyboard_focus_is_visible | tested |
| S2-021 | "text and controls need sufficient contrast." (decision D2-3: WCAG AA 4.5:1 for text) | quality | test_ui.py::test_text_contrast | tested |
| S2-022 | "Provide considered empty, loading and error states" | quality | test_ui.py::test_empty_states_say_something | tested |
| S2-023 | "keep navigation consistent across the required routes." | quality | test_ui.py::test_authorizations_reachable_through_the_ui<br>test_ui.py::test_navigation_is_consistent | tested |
| S2-024 | "A custom illustration, brand asset or exact visual match to a reference is not required." | quality | — | not testable: states a freedom |

## Signup and login

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-025 | "`signup-email`, `signup-password`, `signup-display-name` \| Inputs"; "`signup-submit` \| Button" | auth UI | test_ui.py::test_bad_signup<br>test_ui.py::test_signup_signs_in | tested |
| S2-026 | "`login-email`, `login-password`, `login-submit` \| Inputs and button" | auth UI | test_ui.py::test_bad_login | tested |
| S2-027 | "`auth-error` \| Error message. Present only when there is one" | auth UI | test_ui.py::test_auth_error_absent_until_an_error<br>test_ui.py::test_bad_login<br>test_ui.py::test_bad_signup | tested |
| S2-028 | "`current-user` \| Visible on every screen when signed in. Text contains the display name" | auth UI | test_ui.py::test_current_user_on_every_screen<br>test_ui.py::test_signup_signs_in | tested |
| S2-029 | "`current-handle` \| Text is exactly the caller's handle, with no `@` and no surrounding words" | auth UI | test_ui.py::test_current_user_on_every_screen<br>test_ui.py::test_signup_signs_in | tested |
| S2-030 | "`logout-button` \| Button" (signs the user out) | auth UI | test_ui.py::test_logout | tested |

## Balance and pay — `/`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-031 | "`wallet-balance` \| Text is exactly the formatted amount. Carries `data-amount="{minor units}"`" | wallet UI | test_ui.py::test_wallet_balance_format | tested |
| S2-032 | "`pay-handle`, `pay-amount`, `pay-note` \| Inputs. `pay-amount` is a **decimal** string as a person would type it" | pay UI | test_ui.py::test_pay_moves_money_and_refreshes | tested |
| S2-033 | "`pay-visibility` \| Selects `public` or `private`. Option values are those two strings" | pay UI | test_ui.py::test_visibility_options | tested |
| S2-034 | "`pay-submit` \| Button" (sends the payment) | pay UI | test_ui.py::test_pay_moves_money_and_refreshes | tested |
| S2-035 | "`pay-error` \| Error message, when the payment is refused — including insufficient funds" | pay UI | test_ui.py::test_pay_error_on_refusal<br>test_ui.py::test_refused_payment_refreshes_and_keeps_inputs | tested |
| S2-036 | "`request-handle`, `request-amount`, `request-note`, `request-submit` \| The request form" | request UI | test_ui.py::test_request_form_creates_a_request | tested |
| S2-037 | "`request-error` \| Error message, when the request is refused" | request UI | test_ui.py::test_bad_amount_refused_in_every_form<br>test_ui.py::test_request_error | tested |
| S2-038 | "Keep the pay form's values after success." | pay UI | test_ui.py::test_double_submit_pays_once | tested |
| S2-039 | "Submitting it again without changing a field must not send another payment: `wallet-balance` falls once, the feed contains one payment and `pay-error` is absent." | pay UI | test_ui.py::test_double_submit_pays_once | tested |
| S2-040 | "Changing a field makes the next submission a new payment request." | pay UI | test_ui.py::test_changed_field_is_a_new_payment<br>test_ui.py::test_changed_visibility_is_a_new_payment | tested |
| S2-041 | "Retries follow §7." | pay UI | test_ui.py::test_lost_payment_response | tested |
| S2-042 | "`wallet-balance` is the decimal with exactly `minor_units` decimal places, a single space, then the currency code: `100.00 EUR`. For a `minor_units` of `0` there is no decimal point at all: `1200 JPY`. Balances are never negative, so there is no sign." | format | test_ui.py::test_split_preview_jpy<br>test_ui.py::test_wallet_balance_format | tested |
| S2-043 | "With `minor_units: 2`, `15.00` and `15` both submit `1500`; `15.5` submits `1550`." | amount input | test_ui.py::test_decimal_input_other_currencies<br>test_ui.py::test_decimal_input_to_minor_units | tested |
| S2-044 | "Nonnumeric input or more than `minor_units` decimal places must show the form's error element without sending a request. For example, `15.005` is rejected rather than rounded." | amount input | test_ui.py::test_bad_amount_refused_in_every_form<br>test_ui.py::test_bad_amount_refused_without_a_request<br>test_ui.py::test_decimal_input_other_currencies | tested |

## Activity feed — `/`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-045 | "`activity-list` \| Container. Its children are newest first in the DOM"; "Two payments with equal timestamps may appear in either order." | feed UI | test_ui.py::test_feed_items | tested |
| S2-046 | "`activity-item-{payment_id}` \| One per visible payment. Carries `data-visibility="public"` or `data-visibility="private"`" | feed UI | test_ui.py::test_feed_items<br>test_ui.py::test_pay_moves_money_and_refreshes | tested |
| S2-047 | "`activity-parties-{payment_id}` \| Text contains both handles" | feed UI | test_ui.py::test_feed_items | tested |
| S2-048 | "`activity-amount-{payment_id}` \| Text is exactly the formatted amount" | feed UI | test_ui.py::test_feed_items | tested |
| S2-049 | "`activity-note-{payment_id}` \| Text is exactly the note. Present even when the note is empty" | feed UI | test_ui.py::test_feed_items | tested |
| S2-050 | "`empty-activity` \| Shown instead of the list when nothing is visible" | feed UI | test_ui.py::test_empty_activity | tested |

## Requests — `/requests`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-052 | "`incoming-list`, `outgoing-list` \| Containers" | requests UI | test_ui.py::test_request_lists_and_buttons | tested |
| S2-053 | "`request-item-{request_id}` \| One per request. Carries `data-status="{status}"`" | requests UI | test_ui.py::test_request_lists_and_buttons | tested |
| S2-054 | "`request-amount-{request_id}` \| Text is exactly the formatted amount" | requests UI | test_ui.py::test_request_lists_and_buttons | tested |
| S2-055 | "`request-pay-{request_id}` \| Button. Present only on a `pending` incoming request" | requests UI | test_ui.py::test_pay_from_requests_screen<br>test_ui.py::test_request_lists_and_buttons | tested |
| S2-056 | "`request-decline-{request_id}` \| Button. Present only on a `pending` incoming request" | requests UI | test_ui.py::test_decline_and_cancel_from_screen<br>test_ui.py::test_request_lists_and_buttons | tested |
| S2-057 | "`request-cancel-{request_id}` \| Button. Present only on a `pending` outgoing request" | requests UI | test_ui.py::test_decline_and_cancel_from_screen<br>test_ui.py::test_request_lists_and_buttons | tested |
| S2-058 | "`request-error` \| Shown when a pay, decline or cancel is refused" | requests UI | test_ui.py::test_request_cancelled_elsewhere<br>test_ui.py::test_request_error_on_refused_decline<br>test_ui.py::test_request_error_on_refused_pay | tested |
| S2-059 | "`empty-requests` \| Shown when both lists are empty" | requests UI | test_ui.py::test_empty_requests | tested |

## Split — `/split`

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-060 | "`split-amount` \| Decimal input, same rule as `pay-amount`" | split UI | test_ui.py::test_bad_amount_refused_in_every_form | tested |
| S2-061 | "`split-handles` \| Text input: handles separated by commas, in order" | split UI | test_ui.py::test_split_preview | tested |
| S2-062 | "`split-note`, `split-submit` \| Input and button" | split UI | test_ui.py::test_submitted_split_matches_preview | tested |
| S2-063 | "`split-preview` \| Shows the computed shares before submitting. Contains one `split-share-{handle}` per participant" | split UI | test_ui.py::test_split_preview | tested |
| S2-064 | "`split-share-{handle}` \| Text is exactly the formatted share amount" | split UI | test_ui.py::test_split_preview<br>test_ui.py::test_split_preview_jpy | tested |
| S2-065 | "`split-error` \| Error message, when the split is refused" | split UI | test_ui.py::test_bad_amount_refused_in_every_form<br>test_ui.py::test_split_error | tested |
| S2-066 | "`split-preview` must show the shares the server would compute, by the rule in `stage-1.md` §9, before anything is posted. The preview and submitted split must have identical shares." | split UI | test_ui.py::test_split_preview<br>test_ui.py::test_submitted_split_matches_preview | tested |

## Refresh after actions

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-067 | "After any successful action, the balance, the feed and the request lists on the same page must show the new state without a manual reload." | refresh | test_ui.py::test_authorize_form<br>test_ui.py::test_capture_from_screen<br>test_ui.py::test_pay_from_requests_screen<br>test_ui.py::test_pay_moves_money_and_refreshes<br>test_ui.py::test_void_from_screen | tested |
| S2-068 | "Navigation must wait for the write to succeed before it refreshes the data." | refresh | test_ui.py::test_refresh_waits_for_a_slow_write | tested |
| S2-069 | "**There is no live-update requirement here**" | refresh | — | not testable: states a freedom |

## Competing clients and uncertain outcomes

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-070 | "Add `wallet-refresh`, a button on `/` that refreshes the balance and feed without clearing the pay form." | refresh | test_ui.py::test_wallet_refresh_keeps_the_form | tested |
| S2-071 | "**Latest refresh wins:** a delayed earlier read must not overwrite a later refresh, including when responses arrive out of order." | refresh | test_ui.py::test_latest_refresh_wins | tested |
| S2-072 | "A refused payment shows `pay-error`, refreshes the balance/feed, and preserves all pay inputs." | competing | test_ui.py::test_refused_payment_refreshes_and_keeps_inputs | tested |
| S2-073 | "A request cancelled elsewhere while its pay button is visible must show `request-error` when payment is refused and refresh the request list so the stale pay button disappears." | competing | test_ui.py::test_request_cancelled_elsewhere | tested |
| S2-074 | "If a payment response is lost, including after `POST /payments` commits, show `pay-uncertain` (nonempty text), not `pay-error`. Keep the unchanged form retryable with the **same key and body**." | uncertain | test_ui.py::test_error_and_uncertain_look_different<br>test_ui.py::test_lost_payment_response<br>test_ui.py::test_uncertain_retry_survives_edit_and_restore | tested |
| S2-075 | "Successful retry removes both error/uncertainty elements, refreshes the balance and feed, and moves money exactly once. Unknown outcomes are not confirmed rejections." | uncertain | test_ui.py::test_lost_payment_response | tested |
| S2-076 | "No background polling, live synchronization, or recovery across page reloads is required." | uncertain | — | not testable: states a freedom |
| S2-077 | "The same balance refresh rules apply to the available and held amounts introduced below." | refresh | test_ui.py::test_wallet_refresh_keeps_the_form | tested |

## Existing clients after an upgrade

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-078 | "A stage-2 service must accept an export produced by the same team's stage-1 service." | upgrade | test_fixture_import.py::test_stage1_export_imports_into_stage2<br>test_fixture_import.py::test_stage1_split_and_settlement_replays_after_upgrade | tested |
| S2-079 | "A browser signed in before that export/import upgrade must remain signed in afterwards." (decision D2-1) | upgrade | test_ui.py::test_page_survives_export_import_under_it | tested |
| S2-162 | "A payment whose response was lost before export remains retryable after import with the same body and key; the UI must recover the original payment and refresh the imported balance." | upgrade | test_fixture_import.py::test_stage1_export_imports_into_stage2<br>test_ui.py::test_page_survives_export_import_under_it | tested |
| S2-163 | "Existing pending requests remain payable through the request screen." | upgrade | test_fixture_import.py::test_stage1_export_imports_into_stage2<br>test_ui.py::test_page_survives_export_import_under_it | tested |
| S2-164 | "No page reload or new screen is required. The form and pending retry identity must survive the upgrade." | upgrade | test_ui.py::test_page_survives_export_import_under_it | tested |

## Authorisations and captures — invariants and changed API

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-080 | "The sum of all wallet `total` values always equals the total seeded by the last reset. A hold moves no money" | holds | test_authorizations_api.py::test_me_with_holds<br>test_fixture_import.py::test_concurrent_partial_captures_never_exceed | tested |
| S2-081 | "`available = total − held` must never be negative. Held funds cannot fund new payments, authorizations or settlement net debits." | holds | test_authorizations_api.py::test_held_funds_cannot_fund_another_authorization<br>test_authorizations_api.py::test_me_with_holds<br>test_authorizations_api.py::test_payments_are_judged_against_available<br>test_authorizations_api.py::test_settlement_net_debit_judged_against_available<br>test_fixture_import.py::test_concurrent_authorize_and_pay_never_overdraw<br>test_fixture_import.py::test_concurrent_partial_captures_never_exceed<br>test_fixture_import.py::test_edited_hold_above_balance | tested |
| S2-082 | "Captures may spend the money reserved for them." | holds | test_authorizations_api.py::test_full_capture | tested |
| S2-083 | "Cumulative captures must not exceed the authorized amount. Each idempotent capture moves money once. A closed hold cannot be captured again." | holds | test_authorizations_api.py::test_capture_exceeds_remaining<br>test_authorizations_api.py::test_capture_replay_moves_money_once<br>test_authorizations_api.py::test_second_capture_after_final<br>test_fixture_import.py::test_capture_and_void_race<br>test_fixture_import.py::test_concurrent_partial_captures_never_exceed<br>test_fixture_import.py::test_edited_authorization_amount_below_captured | tested |
| S2-084 | "`GET /me` keeps `balance`, and `balance` **equals `total`**. `available` and `held` are new fields beside it. With no open holds, `balance`, `total` and `available` agree and `held` is zero" | me | test_authorizations_api.py::test_me_without_holds<br>test_fixture_import.py::test_stage1_export_imports_into_stage2 | tested |
| S2-085 | "`POST /payments` remains an immediate transfer. It must not leave an intermediate hold or require a separate capture." | payments | test_authorizations_api.py::test_payments_leave_no_hold | tested |
| S2-086 | "Every `409 insufficient_funds` in stage 1 — on `POST /payments`, `POST /requests/{id}/pay` and settlements — is now evaluated against `available`." | holds | test_authorizations_api.py::test_expiry_is_seen_by_a_write_first<br>test_authorizations_api.py::test_payments_are_judged_against_available<br>test_authorizations_api.py::test_request_pay_judged_against_available<br>test_authorizations_api.py::test_settlement_net_debit_judged_against_available | tested |
| S2-087 | "Paying a request remains immediate. Authorizing a request is out of scope." | requests | test_authorizations_api.py::test_request_pay_judged_against_available | tested |
| S2-088 | "`POST /splits` is unchanged." | splits | test_authorizations_api.py::test_splits_unchanged | tested |
| S2-089 | "There are now seven idempotent write paths: stage 1's five, authorizations and captures. The same replay rules apply independently to each." | idempotency | test_authorizations_api.py::test_authorize_idempotency<br>test_authorizations_api.py::test_authorize_needs_a_key<br>test_authorizations_api.py::test_capture_needs_a_key<br>test_authorizations_api.py::test_capture_replay_moves_money_once<br>test_authorizations_api.py::test_claimed_key_before_validation_on_new_paths<br>test_authorizations_api.py::test_seven_paths_need_keys<br>test_authorizations_api.py::test_void_needs_no_key_and_ignores_one | tested |

## Model and fixture

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-090 | "`authorization_ttl_seconds` applies to every authorisation created through the API. It defaults to 600 when omitted." | fixture | test_authorizations_api.py::test_ttl_from_fixture<br>test_fixture_import.py::test_earlier_fixture_without_authorizations<br>test_fixture_import.py::test_ttl_must_be_positive_integer | tested |
| S2-091 | "If supplied, it must be a positive integer number of seconds." (otherwise reset 422, decision D3) | fixture | test_fixture_import.py::test_ttl_must_be_positive_integer | tested |
| S2-092 | "Seeded authorisations carry their own absolute `expires_at` instead." | fixture | test_fixture_import.py::test_seeded_holds_reduce_available | tested |
| S2-093 | "A user's seeded `balance` is still `total`. **`available` is derived, never seeded** — the service subtracts the seeded open holds itself." | fixture | test_fixture_import.py::test_large_reset_with_holds_within_10_seconds<br>test_fixture_import.py::test_seeded_holds_reduce_available<br>test_ui.py::test_wallet_with_seeded_holds_right_after_reset | tested |
| S2-094 | "A sum of seeded unexpired open holds larger than that user's `balance` is a reset error: `422 validation_failed` from `POST /_test/reset`, changing nothing" | fixture | test_fixture_import.py::test_edited_hold_above_balance<br>test_fixture_import.py::test_large_reset_with_holds_within_10_seconds<br>test_fixture_import.py::test_seeded_holds_above_balance_are_a_reset_error<br>test_fixture_import.py::test_seeded_open_hold_already_past_expiry | tested |
| S2-095 | "Seeded `status` is `open`, `captured`, `voided` or `expired`. Only `open` holds anything." | fixture | test_fixture_import.py::test_bad_seeded_authorization_is_a_reset_error<br>test_fixture_import.py::test_edited_authorization_status<br>test_fixture_import.py::test_seeded_authorization_extra_fields_ignored<br>test_fixture_import.py::test_seeded_holds_reduce_available | tested |
| S2-096 | "An earlier fixture may omit `authorizations` altogether; omission means an empty list." | fixture | test_fixture_import.py::test_earlier_fixture_without_authorizations | tested |
| S2-097 | "An authorization whose `expires_at` is at or before now is `expired` and holds no funds. Reads and writes must reflect expiry even if no request occurred at the deadline. `GET /authorizations` must show `status: "expired"`, and `GET /me` must include the released remainder in `available`." | expiry | test_authorizations_api.py::test_authorize_defaults<br>test_authorizations_api.py::test_clock_expiry_without_any_request<br>test_authorizations_api.py::test_expiry_after_partial_capture<br>test_authorizations_api.py::test_expiry_is_seen_by_a_write_first<br>test_fixture_import.py::test_expiry_continues_after_import<br>test_fixture_import.py::test_seeded_open_hold_already_past_expiry<br>test_ui.py::test_expired_shown_without_a_write | tested |
| S2-098 | "Seeded expiry times are at least an hour from reset time, in the past or future; newly created authorizations may have shorter lifetimes." | expiry | test_authorizations_api.py::test_clock_expiry_without_any_request<br>test_fixture_import.py::test_seeded_open_hold_already_past_expiry | tested |

## API

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-099 | "`balance` and `total` are always equal. `held` is the sum of open holds, and `available` is `total − held`, never negative." (`GET /me` shape) | me | test_authorizations_api.py::test_me_with_holds<br>test_authorizations_api.py::test_me_without_holds | tested |
| S2-100 | "`POST /authorizations`: `Idempotency-Key` is required. The caller is the payer." "`note` and `visibility` are optional with the same defaults as `POST /payments`." | authorize | test_authorizations_api.py::test_authorize_defaults<br>test_authorizations_api.py::test_authorize_idempotency<br>test_authorizations_api.py::test_authorize_needs_a_key<br>test_authorizations_api.py::test_authorize_shape | tested |
| S2-101 | 201 body: authorization_id, from_user_id, from_handle, to_user_id, to_handle, amount, captured_amount 0, currency, note, visibility, status open, expires_at, payment_id null, created_at (+ remaining_amount, S2-121) | authorize | test_authorizations_api.py::test_authorize_shape | tested |
| S2-102 | "`expires_at` is `created_at` plus `authorization_ttl_seconds`." | authorize | test_authorizations_api.py::test_authorize_shape<br>test_authorizations_api.py::test_ttl_from_fixture | tested |
| S2-103 | "The caller's `available` is below `amount` \| 409 `insufficient_funds`" | authorize | test_authorizations_api.py::test_held_funds_cannot_fund_another_authorization | tested |
| S2-104 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (authorize) | authorize | test_authorizations_api.py::test_authorize_amount_rules<br>test_authorizations_api.py::test_authorize_number_spellings | tested |
| S2-105 | "`to_handle` is the caller's own handle \| 422 `self_payment`" (authorize) | authorize | test_authorizations_api.py::test_authorize_self | tested |
| S2-106 | "`note` over 200 characters, or `visibility` neither `public` nor `private` \| 422 `validation_failed`" | authorize | test_authorizations_api.py::test_authorize_note_200_emoji_verbatim<br>test_authorizations_api.py::test_authorize_note_visibility | tested |
| S2-107 | "No user has that handle \| 404 `not_found`" (authorize) | authorize | test_authorizations_api.py::test_authorize_unknown_handle | tested |
| S2-108 | "An open authorisation is **not** a feed item and never appears in `GET /activity`." | authorize | test_authorizations_api.py::test_open_authorization_not_in_feed | tested |
| S2-109 | "`POST /authorizations/{id}/capture`: `Idempotency-Key` is required. Only the receiver (the `to` party) may capture." | capture | test_authorizations_api.py::test_capture_needs_a_key<br>test_authorizations_api.py::test_capture_replay_moves_money_once<br>test_authorizations_api.py::test_full_capture<br>test_authorizations_api.py::test_only_the_receiver_captures | tested |
| S2-110 | "`amount` is optional and defaults to the authorisation's remaining amount." | capture | test_authorizations_api.py::test_omitted_amount_is_the_remainder | tested |
| S2-111 | "**a replay must send the identical body** — `{}` and `{"amount": 2000}` are different JSON values ... reusing a key across the two is 409 `idempotency_key_reuse`" | capture | test_authorizations_api.py::test_capture_replay_body_identity | tested |
| S2-112 | "Returns `201` with the created **payment**, in exactly the shape `POST /payments` returns, with `authorization_id` set to this authorisation and `request_id: null`. The payment's `amount` is the captured amount; its `note` and `visibility` are copied from the authorisation; it appears in the activity feed by the ordinary visibility rule." | capture | test_authorizations_api.py::test_full_capture<br>test_fixture_import.py::test_edited_capture_link_to_missing_authorization | tested |
| S2-113 | "Payments created without an authorisation carry `authorization_id: null`; their existing `request_id` semantics are unchanged." | capture | test_authorizations_api.py::test_payments_without_authorization_carry_null | tested |
| S2-114 | "By default the authorisation becomes `captured`, carries `captured_amount` and `payment_id`, and **releases the uncaptured remainder immediately**" | capture | test_authorizations_api.py::test_full_capture<br>test_authorizations_api.py::test_partial_final_capture_releases_remainder | tested |
| S2-115 | "**Default: one final capture per authorisation.** A second capture after a final capture is `409 authorization_not_open`." | capture | test_authorizations_api.py::test_second_capture_after_final | tested |
| S2-116 | "send `{"amount": 700, "final": false}` ... With `final: false` and an uncaptured remainder, status stays `open`; further captures are allowed up to that remainder." | capture | test_authorizations_api.py::test_extended_capture_mode | tested |
| S2-117 | "Capturing the entire remainder closes it even with `final: false`." | capture | test_authorizations_api.py::test_extended_capture_mode | tested |
| S2-118 | "A final capture closes it and releases any remainder." (also after earlier non-final captures) | capture | test_authorizations_api.py::test_final_capture_after_partials_releases_rest<br>test_authorizations_api.py::test_partial_final_capture_releases_remainder | tested |
| S2-119 | "`capture_exceeds_authorization` compares with the **remaining** amount; omitted amount defaults to that remainder." | capture | test_authorizations_api.py::test_capture_exceeds_remaining<br>test_authorizations_api.py::test_omitted_amount_is_the_remainder | tested |
| S2-120 | "`captured_amount` is cumulative; `payment_id` is the latest capture; `payment_ids` lists every capture in order." | capture | test_authorizations_api.py::test_extended_capture_mode<br>test_fixture_import.py::test_edited_authorization_amount_below_captured | tested |
| S2-121 | "Every authorization response adds `remaining_amount`: the amount still held, zero when closed." | capture | test_authorizations_api.py::test_authorize_shape<br>test_authorizations_api.py::test_extended_capture_mode | tested |
| S2-122 | "Void and expiry can close a partially captured authorization, release only the remainder, and preserve all capture records." | capture | test_authorizations_api.py::test_expiry_after_partial_capture<br>test_authorizations_api.py::test_final_capture_after_partials_releases_rest<br>test_authorizations_api.py::test_void_after_partial_capture | tested |
| S2-123 | "New fields do not change idempotency body equality." (decision D2-4) | capture | test_authorizations_api.py::test_capture_replay_body_identity | tested |
| S2-124 | "`final` is boolean, default `true`, so earlier single-capture requests retain their behavior." (wrong type → 400, §5) | capture | test_authorizations_api.py::test_final_must_be_boolean | tested |
| S2-125 | "The authorisation is not `open` \| 409 `authorization_not_open`" | capture | test_authorizations_api.py::test_second_capture_after_final | tested |
| S2-126 | "`expires_at` is at or before now \| 409 `authorization_expired`" | capture | test_authorizations_api.py::test_clock_expiry_without_any_request | tested |
| S2-127 | "`amount` above the authorisation's uncaptured remainder \| 422 `capture_exceeds_authorization`" | capture | test_authorizations_api.py::test_capture_amount_above_max_is_refused<br>test_authorizations_api.py::test_capture_exceeds_remaining | tested |
| S2-128 | "`amount` below 1, or not an integer \| 422 `validation_failed`" (capture) | capture | test_authorizations_api.py::test_capture_amount_above_max_is_refused<br>test_authorizations_api.py::test_capture_amount_rules | tested |
| S2-129 | "The caller is not the receiver \| 403 `forbidden`" | capture | test_authorizations_api.py::test_only_the_receiver_captures | tested |
| S2-130 | "Unknown authorisation \| 404 `not_found`" | capture | test_authorizations_api.py::test_capture_and_void_unknown | tested |
| S2-131 | "**Only the payer may void** ... No idempotency key" "`200` with the authorisation, `status: "voided"`, the hold released." | void | test_authorizations_api.py::test_only_the_payer_voids<br>test_authorizations_api.py::test_void<br>test_authorizations_api.py::test_void_after_partial_capture<br>test_authorizations_api.py::test_void_needs_no_key_and_ignores_one | tested |
| S2-132 | "Voiding an already-voided authorisation is `200` with the current state." | void | test_authorizations_api.py::test_void | tested |
| S2-133 | "A `captured` or `expired` one is `409 authorization_not_open`." (void) | void | test_authorizations_api.py::test_clock_expiry_without_any_request<br>test_authorizations_api.py::test_void_captured | tested |
| S2-134 | "capture and void return 403 `forbidden` when the caller is not the permitted party, including callers who are neither party." | void | test_authorizations_api.py::test_only_the_payer_voids<br>test_authorizations_api.py::test_only_the_receiver_captures | tested |
| S2-135 | "`GET /authorizations` returns only authorizations involving the caller." | list auths | test_authorizations_api.py::test_list_needs_auth<br>test_authorizations_api.py::test_list_only_own_newest_first | tested |
| S2-136 | "Authorisations where the caller is the payer or the receiver, and no others. Newest first by `created_at`." | list auths | test_authorizations_api.py::test_list_only_own_newest_first | tested |
| S2-137 | "`direction` is `outgoing` (the caller is the payer), `incoming` (the caller is the receiver), or absent for both." | list auths | test_authorizations_api.py::test_list_direction | tested |
| S2-138 | "`status` is one of the four statuses, or absent for all. An authorisation expired by the clock matches `expired`, never `open`." | list auths | test_authorizations_api.py::test_clock_expiry_without_any_request<br>test_authorizations_api.py::test_list_status | tested |
| S2-139 | "`limit`, `offset` and `has_more` behave exactly as on `GET /requests`." | list auths | test_authorizations_api.py::test_list_bad_params<br>test_authorizations_api.py::test_list_paging | tested |

## UI — authorisations and wallet

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-140 | "The UI and the API share `/authorizations`: serve HTML for `Accept: text/html` and JSON otherwise" | routes | test_authorizations_api.py::test_html_for_browsers_json_otherwise<br>test_ui.py::test_routes_reachable_by_url | tested |
| S2-141 | "`wallet-balance` \| Formatted `total`, retaining the existing display and `data-amount`" | wallet UI | test_ui.py::test_wallet_balance_format | tested |
| S2-142 | "`wallet-available` \| Formatted `available`, with `data-amount`. **Present this as the headline number**" | wallet UI | test_ui.py::test_authorize_form<br>test_ui.py::test_available_is_the_headline<br>test_ui.py::test_wallet_with_seeded_holds_right_after_reset | tested |
| S2-143 | "`wallet-held` \| Formatted `held`, with `data-amount`. Absent when `held` is zero" | wallet UI | test_ui.py::test_authorize_form<br>test_ui.py::test_wallet_held_absent_when_zero<br>test_ui.py::test_wallet_with_seeded_holds_right_after_reset | tested |
| S2-144 | "`authorize-handle`, `authorize-amount`, `authorize-note`, `authorize-visibility`, `authorize-submit` \| The authorise form. Same input rules as the pay form" | auth form UI | test_ui.py::test_authorize_form<br>test_ui.py::test_bad_amount_refused_in_every_form | tested |
| S2-145 | "`authorize-error` \| Shown when the authorisation is refused, including insufficient available funds" | auth form UI | test_ui.py::test_authorize_error<br>test_ui.py::test_bad_amount_refused_in_every_form | tested |
| S2-146 | "`authorization-list` \| Container on `/authorizations`. Children newest first in the DOM" | auths UI | test_ui.py::test_authorization_list | tested |
| S2-147 | "`authorization-item-{authorization_id}` \| Carries `data-status="{status}"`" | auths UI | test_ui.py::test_authorization_list<br>test_ui.py::test_expired_shown_without_a_write | tested |
| S2-148 | "`authorization-amount-{id}` \| Text is exactly the formatted authorised amount" | auths UI | test_ui.py::test_authorization_list | tested |
| S2-149 | "`authorization-captured-{id}` \| Formatted captured amount. Present only when `status` is `captured`" | auths UI | test_ui.py::test_authorization_list | tested |
| S2-150 | "`authorization-expires-{id}` \| Text is the RFC 3339 `expires_at`" | auths UI | test_ui.py::test_authorization_list | tested |
| S2-151 | "`authorization-capture-amount-{id}` \| Decimal input, pre-filled with the remaining amount. Present only on an incoming `open` authorisation" | auths UI | test_ui.py::test_authorization_list<br>test_ui.py::test_capture_from_screen | tested |
| S2-152 | "`authorization-capture-{id}` \| Button. Present only on an incoming `open` authorisation" | auths UI | test_ui.py::test_authorization_list<br>test_ui.py::test_capture_from_screen | tested |
| S2-153 | "`authorization-void-{id}` \| Button. Present only on an outgoing `open` authorisation" | auths UI | test_ui.py::test_authorization_list<br>test_ui.py::test_void_from_screen | tested |
| S2-154 | "`authorization-error` \| Shown when a capture or a void is refused" | auths UI | test_ui.py::test_authorization_error_on_refused_capture_and_void | tested |
| S2-155 | "`empty-authorizations` \| Shown when the list is empty" | auths UI | test_ui.py::test_empty_authorizations | tested |
| S2-156 | "The UI must reflect seeded and newly created holds. Show available funds as the user's spending balance, including immediately after reset with open holds." | wallet UI | test_fixture_import.py::test_seeded_holds_reduce_available<br>test_ui.py::test_authorize_form<br>test_ui.py::test_wallet_with_seeded_holds_right_after_reset | tested |

## Concurrency and state

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S2-157 | "Concurrent requests must produce the same results as executing them one at a time in some order, and the requirements above hold at every read." | concurrency | test_fixture_import.py::test_capture_and_void_race<br>test_fixture_import.py::test_concurrent_authorize_and_pay_never_overdraw<br>test_fixture_import.py::test_concurrent_partial_captures_never_exceed | tested |
| S2-158 | §10 continues to apply to the new state: export/import preserves authorisations (status, amounts, captures, `expires_at`), holds and the capture/authorize idempotency records; invalid states (incl. holds above balances, contradictory capture links) are 422 | import | test_fixture_import.py::test_authorizations_survive_import_into_a_fresh_container<br>test_fixture_import.py::test_edited_authorization_amount_below_captured<br>test_fixture_import.py::test_edited_authorization_status<br>test_fixture_import.py::test_edited_balance<br>test_fixture_import.py::test_edited_capture_link_to_missing_authorization<br>test_fixture_import.py::test_edited_hold_above_balance<br>test_fixture_import.py::test_edited_id_too_long<br>test_fixture_import.py::test_edited_paid_request_back_to_pending<br>test_fixture_import.py::test_edited_payment_amount<br>test_fixture_import.py::test_edited_timestamps<br>test_fixture_import.py::test_expiry_continues_after_import<br>test_fixture_import.py::test_round_trip_preserves_authorizations<br>test_fixture_import.py::test_unedited_base_imports | tested |

## Decisions (test-designer, stage 2)

Stage-1 decisions D1–D12 still apply.

- **D2-1 Signed-in browser across an upgrade.** The page can only hold a session that the service it
  talks to knows. The upgrade test therefore runs in two halves. (a) API: a stage-1 export,
  including its tokens, pending requests and a payment whose response was ignored, is imported
  into stage 2; the tokens work, the requests are payable, and a retry with the same key and body
  returns the original payment. (b) Browser: a page signed in to stage 2, with a lost payment
  pending, keeps working without a reload after the service's state is exported and imported back
  under it. It is still signed in, the request screen pays an imported pending request, and the
  unchanged pay form recovers the original payment.
- **D2-2 Expiry boundary.** "at or before now" is tested with lifetimes of 1–3 s and waits past
  them. No test depends on sub-second timing.
- **D2-3 Contrast.** "sufficient contrast" is measured as WCAG 2 AA: 4.5:1 for the text of the
  elements named by a `data-testid`, against their effective background.
- **D2-4 Capture body equality.** Request-body equality stays JSON-value equality (§7):
  `{"amount": 700}` and `{"amount": 700, "final": true}` are different bodies (409 on key reuse), as
  `{}` and `{"amount": 2000}` are. New *response* fields do not affect replays.
- **D2-5 Capture of an expired authorisation.** A clock-expired authorisation answers capture with
  409 `authorization_expired`. One seeded as `expired` may answer 409 `authorization_expired` or 409
  `authorization_not_open`, because both rows describe it.
- **D2-6 Visible label.** An input's label is visible text associated with it (`<label for>`, a
  wrapping `<label>`, or `aria-labelledby` pointing at visible text). A placeholder or `aria-label`
  alone is not a visible label.
- **D2-7 Amount forms.** A "decimal string as a person would type it" is digits with an optional
  `.` and fraction. `15,00`, `abc`, `1e3` and an empty field are nonnumeric. Surrounding
  whitespace is not tested.
- **D2-8 Visual distinction (S2-016).** Checked as: `pay-error` and `pay-uncertain` differ in computed
  colour, background or border; `wallet-available` and `wallet-held` differ in size or weight. The
  rest is judged in screen review.
- **D2-9 S1-R17 kept.** No stage-2 requirement contradicts refusing a fixture whose total is above 2^53:
  every new rule bounds wallets, holds and captures individually or by `total`. The stage-1 ruling stands.

## Validity check (stage 2)

The stage-2 suite was run against a build of the accepted stage-1 revision 56fce58 (`stage-1/`,
in a worktree), using `ACCEPTANCE_UI_TIMEOUT_MS=1500 work/acceptance/run.sh <worktree>/stage-1 2`.
That build lacks all stage-2 behaviour.

- First run: 269 of 272 stage-2 tests failed or errored. 2 upgrade tests skipped, because a stage-1
  folder has no previous stage. 3 passed, because they checked only that an unknown resource is
  404, which the stage-1 build gives for every missing endpoint. I fixed those 3 to first show the
  new endpoint working (`test_authorize_unknown_handle`, both `test_capture_and_void_unknown` cases).
- I then ran the 2 upgrade tests with the stage-1 build as both the previous and the target service.
  `test_stage1_split_and_settlement_replays_after_upgrade` passed, because it checked only stage-1
  replays. I fixed it to also require the stage-2 `/me` fields and an authorisation.
- After the fixes, the changed tests and the no-scroll tests (now anchored on each screen's own
  element) all fail on the stage-1 build: 17 of 17.
- Result: no stage-2 test passes on the stage-1 build. The stage-1 suite itself (`tests/stage_1/`)
  passes there, 554/554. That is S2-001, which this stage leaves unchanged.
