# Stage 1 — requirement list

Source: `pocketful/spec/stage-1.md` (read-only). One row per testable requirement.
Status values: open, tested, passing, failing, disputed, not testable (with the reason).
Tests are named `file::function` under `work/acceptance/tests/stage_1/`.

## §1 Scope and invariants

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-001 | "The sum of wallet balances always equals the total seeded by the last `POST /_test/reset`." | invariants | test_export_import.py::test_export_is_an_atomic_snapshot_under_writes<br>test_load.py::test_random_payments_among_ten_wallets<br>test_load.py::test_ring_of_three_wallets<br>test_load.py::test_settlements_and_payments_at_once<br>test_model_fixture.py::test_seeded_total_is_the_last_reset<br>test_splits_feed.py::test_paid_splits_conserve_the_total | tested |
| S1-002 | "No wallet balance may be negative, including transiently." | invariants | test_export_import.py::test_export_is_an_atomic_snapshot_under_writes<br>test_load.py::test_drain_one_wallet_in_parts<br>test_load.py::test_random_payments_among_ten_wallets<br>test_load.py::test_ring_of_three_wallets<br>test_load.py::test_settlements_and_payments_at_once<br>test_settlements.py::test_settlement_never_overdraws_any_wallet | tested |
| S1-003 | "A payment request may move money at most once." | invariants | test_idempotency.py::test_concurrent_identical_requests<br>test_load.py::test_one_request_paid_by_fifty_keys<br>test_load.py::test_pay_decline_and_cancel_race<br>test_payments_requests.py::test_pay_replay_after_paid | tested |
| S1-004 | "All amounts are exact integer counts of minor units." | invariants | test_model_fixture.py::test_balances_near_two_to_the_53_stay_exact<br>test_model_fixture.py::test_integral_number_forms_are_the_same_amount | tested |
| S1-005 | "Money moves only between existing wallets." | invariants | test_model_fixture.py::test_money_moves_only_between_existing_wallets | tested |

## §2 Delivery and deployment

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-006 | "Deliver an HTTP service, a `Dockerfile` and a `RUN.md` with a command that builds and starts the service without manual setup." | delivery | test_runtime.py::test_stage_folder_has_dockerfile_and_run_md_with_a_command | tested |
| S1-007 | "The image must run on its own with `-e PORT=<port>` and a port mapping." | delivery | test_runtime.py::test_service_runs_alone_with_port_env_and_a_mapping | tested |
| S1-008 | "Runtime networking has no outbound access." | delivery | — | not testable by this suite: the suite reaches the service through a published port, and Docker cannot publish ports from a network-less container; the harness `--mode isolated` run covers it |
| S1-009 | "All runtime dependencies, initialization and seed data must work within that single container. Compose configuration is not used to start the service." | delivery | test_runtime.py::test_service_runs_alone_with_port_env_and_a_mapping | tested |
| S1-010 | "CPU \| 2 vCPU" / "Memory \| 2 GiB" | limits | test_runtime.py::test_service_runs_alone_with_port_env_and_a_mapping | tested |
| S1-011 | "Start to first healthy response \| 60 s" | limits | test_runtime.py::test_first_healthy_response_within_60_seconds | tested |
| S1-012 | "Concurrent requests \| up to 50 in flight" | limits | test_idempotency.py::test_concurrent_identical_requests<br>test_load.py::test_fifty_in_flight_on_a_large_state<br>test_load.py::test_random_payments_among_ten_wallets | tested |
| S1-013 | "Per-request timeout \| 5 s (10 s for `POST /_test/reset`)" | limits | test_export_import.py::test_large_export_and_import_within_10_seconds<br>test_load.py::test_fifty_in_flight_on_a_large_state<br>test_load.py::test_large_fixture_resets_within_10_seconds_and_logs_in<br>test_load.py::test_random_payments_among_ten_wallets<br>test_load.py::test_ring_of_three_wallets | tested |
| S1-014 | "Disk \| ephemeral; state need not survive a container restart" | limits | — | not testable: states a freedom, not an obligation |
| S1-015 | "Runtime assets and dependencies must be included in the image." | delivery | — | not testable by this suite: same reason as S1-008 (needs a container with no outbound network) |

## §3 Runtime contract

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-016 | "Listen on `0.0.0.0` using the `PORT` environment variable, default `8080`." | runtime | test_runtime.py::test_default_port_is_8080<br>test_runtime.py::test_service_runs_alone_with_port_env_and_a_mapping | tested |
| S1-017 | "GET /health  ->  200  {"status": "ok"}" | health | test_runtime.py::test_health_body_and_no_auth<br>test_runtime.py::test_health_ignores_a_bad_token | tested |
| S1-018 | "Return 200 once the service and its data store can serve requests, within 60 seconds of container start." | health | test_runtime.py::test_first_healthy_response_within_60_seconds | tested |
| S1-019 | "Replace all service state with the fixture in the request body (§4)." → 204 No Content | reset | test_load.py::test_large_fixture_resets_within_10_seconds_and_logs_in<br>test_runtime.py::test_reset_returns_204_with_no_auth | tested |
| S1-020 | "When reset returns 204, subsequent requests must see only that fixture." | reset | test_export_import.py::test_reset_clears_imported_state<br>test_runtime.py::test_reset_replaces_everything<br>test_runtime.py::test_token_from_before_a_reset_is_unauthenticated | tested |
| S1-021 | "Repeated resets are supported." | reset | test_model_fixture.py::test_seeded_total_is_the_last_reset<br>test_runtime.py::test_repeated_resets | tested |
| S1-022 | "This test endpoint must be enabled in the delivered image and requires no authentication." | reset | test_runtime.py::test_reset_ignores_a_bogus_authorization_header<br>test_runtime.py::test_reset_returns_204_with_no_auth | tested |
| S1-023 | "Requests and responses are `application/json; charset=utf-8`." | conventions | test_runtime.py::test_health_body_and_no_auth<br>test_runtime.py::test_responses_are_json_utf8<br>test_runtime.py::test_utf8_body_is_read_as_utf8 | tested |
| S1-024 | "Timestamps in responses are RFC 3339 with an explicit offset" | conventions | test_runtime.py::test_timestamps_have_explicit_offsets | tested |
| S1-025 | "Unknown fields in a request body are ignored, never an error." | conventions | test_model_fixture.py::test_fixture_fields_outside_the_format_are_ignored<br>test_payments_requests.py::test_requester_cannot_be_forged<br>test_runtime.py::test_unknown_body_fields_are_ignored_everywhere<br>test_settlements.py::test_unknown_fields_ignored | tested |
| S1-026 | "Unknown query parameters are ignored." | conventions | test_runtime.py::test_unknown_query_parameters_are_ignored<br>test_splits_feed.py::test_activity_ignores_request_filters | tested |
| S1-027 | "IDs are opaque strings of at most 64 characters." | conventions | test_runtime.py::test_ids_are_strings_of_at_most_64_characters | tested |

## §4 Model

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-028 | "The service has **one currency**, declared in the fixture." | model | test_export_import.py::test_currency_survives<br>test_model_fixture.py::test_one_currency_from_the_fixture | tested |
| S1-029 | "JSON `1000`, `1000.0` and `1e3` all represent the same valid minor-unit amount." | amounts | test_model_fixture.py::test_integral_forms_at_the_maximum_are_valid<br>test_model_fixture.py::test_integral_number_forms_are_the_same_amount | tested |
| S1-030 | "Booleans and strings are not numbers here." | amounts | test_model_fixture.py::test_non_numbers_and_non_integral_amounts_are_422 | tested |
| S1-031 | "Every user has a **handle**: unique across the service, matching `^[a-z0-9_]{1,20}$`, and never changing once set." | handles | test_load.py::test_concurrent_signups_one_handle<br>test_model_fixture.py::test_fixture_handle_outside_the_pattern_is_a_reset_error<br>test_model_fixture.py::test_fixture_with_duplicate_handles_is_a_reset_error<br>test_model_fixture.py::test_handle_is_derived_per_character<br>test_model_fixture.py::test_handle_never_changes<br>test_model_fixture.py::test_seeded_handles_are_reported<br>test_payments_requests.py::test_handle_that_cannot_exist | tested |
| S1-032 | "Users identify recipients by handle." | handles | test_model_fixture.py::test_handle_never_changes | tested |
| S1-033 | "Seeded users take their handle from the fixture." | handles | test_model_fixture.py::test_seeded_handles_are_reported | tested |
| S1-034 | "take the local part, lowercase it, replace every character outside `[a-z0-9_]` with `_`, and truncate to 20 characters." | handles | test_model_fixture.py::test_handle_is_derived_per_character | tested |
| S1-035 | "If that handle is already taken the signup fails" | handles | test_load.py::test_concurrent_signups_one_handle<br>test_model_fixture.py::test_two_emails_deriving_one_handle | tested |
| S1-036 | "New users start with a balance of `0`. They can receive money and be asked for money immediately." | users | test_model_fixture.py::test_new_user_starts_at_zero_and_can_receive_and_be_asked | tested |
| S1-037 | "A **payment** moves money from one wallet to another, immediately and atomically." | payments | test_model_fixture.py::test_payment_moves_money_immediately | tested |
| S1-038 | "A request is `pending`, and then exactly one of `paid`, `declined` or `cancelled`." | requests | test_load.py::test_pay_decline_and_cancel_race<br>test_model_fixture.py::test_request_status_moves_once_from_pending | tested |
| S1-039 | "Only the payer may pay or decline it; only the requester may cancel it." | requests | test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels | tested |
| S1-040 | "**A request may exceed the payer's balance.** That is a legal state, not an error at creation time" | requests | test_model_fixture.py::test_request_above_payer_balance_is_created | tested |
| S1-041 | "an attempt to pay it while short is `409 insufficient_funds` and changes nothing. Money can arrive later and the same request then becomes payable." | requests | test_export_import.py::test_pending_request_still_payable_after_import<br>test_model_fixture.py::test_seeded_pending_request_is_payable_and_cancelled_is_not<br>test_model_fixture.py::test_short_payer_gets_409_then_pays_once_funded | tested |
| S1-042 | "**Visibility belongs to the payment, not the request.** The payer chooses it when the money moves." | visibility | test_model_fixture.py::test_payer_chooses_visibility_when_money_moves<br>test_payments_requests.py::test_pay_visibility | tested |
| S1-043 | "A request carries no visibility of its own and never appears in anyone else's feed." | visibility | test_model_fixture.py::test_request_has_no_visibility_and_is_never_in_a_feed | tested |
| S1-044 | "A payment appears for a caller **if and only if** its `visibility` is `public`, **or** the caller is its sender or its receiver." | feed | test_model_fixture.py::test_seeded_payments_follow_the_feed_rule<br>test_settlements.py::test_members_follow_feed_visibility<br>test_splits_feed.py::test_feed_if_and_only_if | tested |
| S1-045 | "Requests never appear in the activity feed" | feed | test_splits_feed.py::test_requests_never_in_the_feed | tested |
| S1-046 | "`GET /requests`, which returns only requests where the caller is the requester or the payer." | requests | test_payments_requests.py::test_list_only_own_newest_first<br>test_splits_feed.py::test_requests_list_never_leaks | tested |
| S1-047 | "A split is not a feed item. The requests it creates are visible to their own two parties, and the payments that eventually fulfil them follow the rule above." | feed | test_splits_feed.py::test_split_is_not_a_feed_item | tested |
| S1-048 | "Visibility is **one value on the payment**, seen identically by both parties and by everyone else." | visibility | test_splits_feed.py::test_feed_if_and_only_if<br>test_splits_feed.py::test_private_is_shown_to_the_receiver | tested |
| S1-049 | "A `private` payment is hidden from third parties, not from its own receiver." | visibility | test_model_fixture.py::test_seeded_payments_follow_the_feed_rule<br>test_splits_feed.py::test_feed_if_and_only_if<br>test_splits_feed.py::test_private_is_shown_to_the_receiver | tested |
| S1-050 | "`amount` is at most `1000000000` on any single request" | amounts | test_model_fixture.py::test_amounts_above_the_maximum_are_refused_exactly<br>test_model_fixture.py::test_integral_forms_at_the_maximum_are_valid | tested |
| S1-051 | "no operation produces a balance outside ±2⁵³. Monetary arithmetic must preserve exact minor-unit values without rounding error." | amounts | test_export_import.py::test_import_with_an_amount_above_two_to_the_53_is_refused_or_exact<br>test_export_import.py::test_values_near_two_to_the_53_round_trip<br>test_model_fixture.py::test_amounts_above_the_maximum_are_refused_exactly<br>test_model_fixture.py::test_balances_near_two_to_the_53_stay_exact | tested |
| S1-052 | Fixture format: `currency`, `minor_units`, `users`, `payments`, `requests` as in the example | fixture | test_model_fixture.py::test_fixture_fields_outside_the_format_are_ignored<br>test_model_fixture.py::test_fixture_users_log_in_and_see_their_profile<br>test_model_fixture.py::test_seeded_ids_are_the_api_ids<br>test_model_fixture.py::test_seeded_payments_follow_the_feed_rule<br>test_model_fixture.py::test_seeded_pending_request_is_payable_and_cancelled_is_not | tested |
| S1-053 | "Seeded users must be able to log in with the given password immediately." | fixture | test_load.py::test_large_fixture_resets_within_10_seconds_and_logs_in<br>test_model_fixture.py::test_fixture_users_log_in_and_see_their_profile<br>test_model_fixture.py::test_seeded_password_is_the_one_given | tested |
| S1-054 | "`balance` is the wallet balance **after** every seeded payment has been applied. ... you do not replay seeded payments against balances." | fixture | test_model_fixture.py::test_seeded_balances_are_not_replayed | tested |
| S1-055 | "A `balance` below zero in a fixture is a reset error: return `422 validation_failed` from `POST /_test/reset` and change nothing." | fixture | test_model_fixture.py::test_fixture_handle_outside_the_pattern_is_a_reset_error<br>test_model_fixture.py::test_negative_seeded_balance_is_a_reset_error_and_changes_nothing | tested |
| S1-056 | "`minor_units` is `0`, `2` or `3`. Fixtures use `EUR` (2), `JPY` (0) and `BHD` (3)." | fixture | test_model_fixture.py::test_minor_units_outside_0_2_3_is_a_reset_error<br>test_model_fixture.py::test_one_currency_from_the_fixture | tested |
| S1-057 | Seeded ids are the service's ids: the `GET /me` example for fixture user `u_ada` shows `"user_id": "u_ada"` (decision D4) | fixture | test_model_fixture.py::test_seeded_ids_are_the_api_ids | tested |

## §5 Errors

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-058 | "Every 4xx and 5xx response carries this body: `{ "error": { "code": ..., "message": ... } }`" | errors | test_errors_auth.py::test_error_body_shape_on_every_error_status<br>test_runtime.py::test_a_64_kilobyte_header_gets_status_and_error_body<br>test_runtime.py::test_unknown_path_is_404_with_error_body<br>test_runtime.py::test_unparseable_request_target_gets_an_error_body | tested |
| S1-059 | "400 \| `malformed_request` \| Unparseable body, or a field of the wrong JSON type" | errors | test_errors_auth.py::test_body_that_is_not_an_object<br>test_errors_auth.py::test_deeply_nested_body_is_refused_not_crashed<br>test_errors_auth.py::test_field_of_wrong_json_type_is_400<br>test_errors_auth.py::test_unparseable_body_is_400 | tested |
| S1-060 | "400 \| `missing_idempotency_key` \| Required `Idempotency-Key` header absent or empty" | errors | test_errors_auth.py::test_empty_idempotency_key_is_400<br>test_idempotency.py::test_key_required_on_each_path<br>test_settlements.py::test_operator_needs_a_key | tested |
| S1-061 | "401 \| `unauthenticated` \| Missing, malformed or unknown bearer token" | errors | test_errors_auth.py::test_missing_malformed_or_unknown_token_is_401<br>test_errors_auth.py::test_token_of_another_user_case_changed_is_unknown | tested |
| S1-062 | "403 \| `forbidden` \| Authenticated, but not permitted to touch this resource" | errors | test_errors_auth.py::test_error_body_shape_on_every_error_status<br>test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels | tested |
| S1-063 | "404 \| `not_found` \| No such resource, or not visible to this caller" | errors | test_errors_auth.py::test_error_body_shape_on_every_error_status<br>test_runtime.py::test_unknown_path_is_404_with_error_body | tested |
| S1-064 | "409 \| `idempotency_key_reuse` \| Key already used by this caller with a different request body" | errors | test_idempotency.py::test_same_key_different_body_is_409 | tested |
| S1-065 | "422 \| `validation_failed` \| A required field or query parameter is missing, or a stated rule is violated with no more specific code" | errors | test_errors_auth.py::test_missing_required_field_is_422<br>test_errors_auth.py::test_signup_missing_field_is_422<br>test_model_fixture.py::test_fixture_handle_outside_the_pattern_is_a_reset_error<br>test_model_fixture.py::test_fixture_with_duplicate_handles_is_a_reset_error<br>test_model_fixture.py::test_minor_units_outside_0_2_3_is_a_reset_error<br>test_settlements.py::test_entry_missing_field<br>test_settlements.py::test_missing_transfers | tested |
| S1-066 | "A field of the correct JSON type with an invalid format or out-of-range value gives 422 `validation_failed`" | errors | test_errors_auth.py::test_non_string_note_is_422_on_every_endpoint | tested |
| S1-067 | "invalid `amount` values (including strings and booleans), non-string `note` values (including `null`), and any `visibility` other than `public` or `private` are 422 `validation_failed`." | errors | test_errors_auth.py::test_bad_visibility_is_422_on_payments_and_pay<br>test_errors_auth.py::test_non_string_note_is_422_on_every_endpoint<br>test_model_fixture.py::test_non_numbers_and_non_integral_amounts_are_422<br>test_settlements.py::test_entry_note_and_visibility_rules | tested |
| S1-068 | "Omission alone selects the optional-field defaults." | errors | test_errors_auth.py::test_omission_selects_defaults | tested |
| S1-069 | "An integer-valued **query parameter** is written as plain decimal digits: `1e9`, `4.0` and `+4` are 422 `validation_failed`" | errors | test_errors_auth.py::test_integer_query_parameters_are_plain_digits<br>test_errors_auth.py::test_plain_digit_forms_are_accepted | tested |
| S1-070 | "`Idempotency-Key` \| 1 to 255 characters \| 422 `validation_failed`" | errors | test_errors_auth.py::test_idempotency_key_length_bounds<br>test_errors_auth.py::test_idempotency_key_length_counts_characters_not_bytes<br>test_errors_auth.py::test_key_length_enforced_on_every_idempotent_path | tested |
| S1-071 | "`limit` \| integer 1 to 200 \| 422 `validation_failed`" | errors | test_errors_auth.py::test_plain_digit_forms_are_accepted<br>test_splits_feed.py::test_activity_bad_paging | tested |
| S1-072 | "`offset` \| integer 0 or more \| 422 `validation_failed`" | errors | test_errors_auth.py::test_plain_digit_forms_are_accepted<br>test_splits_feed.py::test_activity_bad_paging | tested |
| S1-073 | "Requests must not produce 5xx responses, including under concurrent load." | errors | test_errors_auth.py::test_body_that_is_not_an_object<br>test_errors_auth.py::test_deeply_nested_body_is_refused_not_crashed<br>test_load.py::test_fifty_in_flight_on_a_large_state<br>test_load.py::test_random_payments_among_ten_wallets<br>test_runtime.py::test_a_64_kilobyte_header_gets_status_and_error_body<br>test_runtime.py::test_unparseable_request_target_gets_an_error_body<br>test_splits_feed.py::test_split_with_a_thousand_unknown_participants | tested |

## §6 Authentication

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-074 | "POST /auth/signup ... ->  201  { "user_id", "display_name", "token" }" | auth | test_errors_auth.py::test_signup_and_login_shapes | tested |
| S1-075 | "POST /auth/login ... ->  200  { "user_id", "display_name", "token" }" | auth | test_errors_auth.py::test_seeded_user_login_shape<br>test_errors_auth.py::test_signup_and_login_shapes | tested |
| S1-076 | "Email already registered \| 409 `email_taken`" | auth | test_errors_auth.py::test_email_already_registered_is_409<br>test_load.py::test_concurrent_signups_one_handle | tested |
| S1-077 | "Password shorter than 8 characters \| 422 `validation_failed`" | auth | test_errors_auth.py::test_password_shorter_than_8_characters | tested |
| S1-078 | "`email` not of the form `local@domain` \| 422 `validation_failed`" | auth | test_errors_auth.py::test_email_not_local_at_domain | tested |
| S1-079 | "Wrong password or unknown email on login \| 401 `unauthenticated`" | auth | test_errors_auth.py::test_wrong_password_or_unknown_email_is_401<br>test_model_fixture.py::test_seeded_password_is_the_one_given | tested |
| S1-080 | "The handle derived from the email (§4) is already taken \| 409 `handle_taken`, and no account is created" | auth | test_errors_auth.py::test_handle_taken_creates_no_account<br>test_load.py::test_concurrent_signups_one_handle<br>test_model_fixture.py::test_two_emails_deriving_one_handle | tested |
| S1-081 | "Every other endpoint requires a bearer token, except `/health`, `/_test/reset` and the two above." | auth | test_errors_auth.py::test_auth_endpoints_need_no_token<br>test_errors_auth.py::test_missing_malformed_or_unknown_token_is_401 | tested |
| S1-082 | "Tokens do not expire. An account may have multiple valid tokens and concurrent sessions." | auth | test_errors_auth.py::test_multiple_tokens_are_all_valid | tested |
| S1-083 | "Passwords must be stored using a password-hashing function ... Plaintext password storage is not permitted." | auth | test_errors_auth.py::test_plaintext_passwords_are_not_stored<br>test_errors_auth.py::test_seeded_plaintext_passwords_are_not_stored | tested |

## §7 Idempotency

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-084 | "Five write paths require an idempotency key: `POST /payments`, `POST /requests`, `POST /requests/{id}/pay`, `POST /splits` and `POST /settlements`." | idempotency | test_errors_auth.py::test_key_length_enforced_on_every_idempotent_path<br>test_idempotency.py::test_key_required_on_each_path<br>test_settlements.py::test_operator_needs_a_key | tested |
| S1-085 | "The key is scoped to **the authenticated user**. Two different users may use the same key string with no interaction between them." | idempotency | test_idempotency.py::test_key_scoped_to_user<br>test_settlements.py::test_settlement_keys_are_per_operator | tested |
| S1-086 | "The same key with the same body on a different path is a different request, not a replay, and must succeed normally." | idempotency | test_idempotency.py::test_same_key_same_body_different_path_is_not_a_replay | tested |
| S1-087 | "First use of the key \| The normal response, **201**" | idempotency | test_idempotency.py::test_first_use_201_replay_200_identical_and_no_effect | tested |
| S1-088 | "Replay: same key, same body \| **200**, body identical to the original response as a JSON value" | idempotency | test_export_import.py::test_retries_survive_import<br>test_idempotency.py::test_first_use_201_replay_200_identical_and_no_effect<br>test_settlements.py::test_replay_returns_the_original_complete_response | tested |
| S1-089 | "Same key, different body \| 409 `idempotency_key_reuse`" | idempotency | test_idempotency.py::test_nested_value_change_is_a_different_body<br>test_idempotency.py::test_same_key_different_body_is_409 | tested |
| S1-090 | "Key reused after the original request failed with 4xx \| Treated as a first use" | idempotency | test_idempotency.py::test_key_after_a_4xx_is_a_first_use<br>test_idempotency.py::test_key_after_insufficient_funds_then_funded<br>test_settlements.py::test_failed_settlement_claims_no_key | tested |
| S1-091 | ""Same body" means the same JSON value after parsing — key order and whitespace do not matter." | idempotency | test_idempotency.py::test_nested_value_change_is_a_different_body<br>test_idempotency.py::test_same_json_value_with_other_key_order_and_whitespace_is_a_replay | tested |
| S1-092 | "For concurrent identical requests with an unused key, exactly one returns 201. The others return 200 with the same body. The operation takes effect only once." | idempotency | test_idempotency.py::test_concurrent_identical_requests<br>test_load.py::test_one_request_paid_by_fifty_keys | tested |
| S1-093 | "A successful replay returns the original response, even after the resource changes or is cancelled. It makes no further state changes." | idempotency | test_idempotency.py::test_first_use_201_replay_200_identical_and_no_effect<br>test_idempotency.py::test_replay_after_balance_dropped_still_200<br>test_idempotency.py::test_replay_after_the_request_changed<br>test_settlements.py::test_replay_returns_the_original_complete_response | tested |
| S1-094 | "an already claimed key is resolved before endpoint field validation or current-resource checks. Thus changing a successful request to an invalid body with the same key still returns `409 idempotency_key_reuse`." | idempotency | test_idempotency.py::test_claimed_key_resolved_before_resource_checks<br>test_idempotency.py::test_claimed_key_resolved_before_validation | tested |

## §8 API

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-095 | "`GET /me`: `{ "user_id", "display_name", "handle", "balance", "currency", "minor_units" }`" | me | test_model_fixture.py::test_fixture_users_log_in_and_see_their_profile<br>test_model_fixture.py::test_seeded_handles_are_reported<br>test_payments_requests.py::test_me_shape | tested |
| S1-096 | `POST /payments` 201 body: payment_id, from_user_id, from_handle, to_user_id, to_handle, amount, currency, note, visibility, request_id null, created_at | payments | test_payments_requests.py::test_ordinary_payment_has_null_settlement_id<br>test_payments_requests.py::test_payment_response_shape | tested |
| S1-097 | "`note` is optional and defaults to `""`. `visibility` is optional and defaults to `"public"`." | payments | test_errors_auth.py::test_omission_selects_defaults<br>test_payments_requests.py::test_note_and_visibility_defaults<br>test_settlements.py::test_entry_defaults | tested |
| S1-098 | "The caller's balance is below `amount` \| 409 `insufficient_funds`" | payments | test_idempotency.py::test_key_after_insufficient_funds_then_funded<br>test_load.py::test_drain_one_wallet_in_parts<br>test_payments_requests.py::test_insufficient_funds<br>test_payments_requests.py::test_validation_before_funds | tested |
| S1-099 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (payments) | payments | test_payments_requests.py::test_payment_amount_bounds_valid<br>test_payments_requests.py::test_payment_amount_rules<br>test_payments_requests.py::test_validation_before_funds<br>test_settlements.py::test_entry_amount_rules | tested |
| S1-100 | "`to_handle` is the caller's own handle \| 422 `self_payment`" | payments | test_payments_requests.py::test_self_payment | tested |
| S1-101 | "`note` longer than 200 characters \| 422 `validation_failed`" (payments) | payments | test_payments_requests.py::test_payment_note_length_in_characters<br>test_payments_requests.py::test_validation_before_funds<br>test_settlements.py::test_entry_note_and_visibility_rules | tested |
| S1-102 | "`visibility` is neither `public` nor `private` \| 422 `validation_failed`" | payments | test_errors_auth.py::test_bad_visibility_is_422_on_payments_and_pay<br>test_payments_requests.py::test_visibility_values<br>test_settlements.py::test_entry_note_and_visibility_rules | tested |
| S1-103 | "No user has that handle \| 404 `not_found`" (payments) | payments | test_model_fixture.py::test_money_moves_only_between_existing_wallets<br>test_payments_requests.py::test_handle_that_cannot_exist<br>test_payments_requests.py::test_unknown_handle_is_404 | tested |
| S1-104 | "The debit and the credit are one atomic step. A payment is never visible in one wallet and not the other, and a failed payment leaves no trace in either." | payments | test_model_fixture.py::test_payment_moves_money_immediately<br>test_payments_requests.py::test_debit_and_credit_are_one_step<br>test_payments_requests.py::test_insufficient_funds | tested |
| S1-105 | "`note` is stored and returned verbatim: no trimming, no escaping, no normalisation. Unicode and emoji survive a round trip byte for byte." | payments | test_payments_requests.py::test_note_round_trip_verbatim<br>test_payments_requests.py::test_request_note_round_trip_verbatim<br>test_runtime.py::test_utf8_body_is_read_as_utf8 | tested |
| S1-106 | `POST /requests` 201 body: request_id, requester_id, requester_handle, payer_id, payer_handle, amount, currency, note, status pending, payment_id null, created_at; "The caller is the requester." | requests | test_payments_requests.py::test_request_response_shape<br>test_payments_requests.py::test_requester_cannot_be_forged | tested |
| S1-107 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (requests) | requests | test_payments_requests.py::test_request_amount_bounds_valid<br>test_payments_requests.py::test_request_amount_rules | tested |
| S1-108 | "`payer_handle` is the caller's own handle \| 422 `self_request`" | requests | test_payments_requests.py::test_self_request | tested |
| S1-109 | "`note` longer than 200 characters \| 422 `validation_failed`" (requests) | requests | test_payments_requests.py::test_request_note_length | tested |
| S1-110 | "No user has that handle \| 404 `not_found`" (requests) | requests | test_payments_requests.py::test_request_unknown_handle | tested |
| S1-111 | "**The payer's balance is not checked here.** A request for more than the payer holds is created normally and sits `pending`." | requests | test_model_fixture.py::test_request_above_payer_balance_is_created<br>test_payments_requests.py::test_payer_balance_not_checked | tested |
| S1-112 | "The body carries `visibility` only, optional, default `"public"`. It is the payer's choice, not the requester's." | pay | test_model_fixture.py::test_payer_chooses_visibility_when_money_moves<br>test_payments_requests.py::test_pay_visibility | tested |
| S1-113 | "**A replay must send the identical body** — `{}` and `{"visibility": "public"}` are different JSON values, so reusing a key across the two is `409 idempotency_key_reuse`" | pay | test_payments_requests.py::test_pay_replay_needs_identical_body | tested |
| S1-114 | "Returns `201` with the created **payment**, exactly as `POST /payments` returns one, with `request_id` set to this request. The request becomes `paid` and carries the new `payment_id`." | pay | test_payments_requests.py::test_pay_returns_a_payment_and_marks_paid | tested |
| S1-115 | "The request is not `pending` \| 409 `request_not_pending`" | pay | test_load.py::test_one_request_paid_by_fifty_keys<br>test_payments_requests.py::test_not_pending_and_short<br>test_payments_requests.py::test_pay_not_pending | tested |
| S1-116 | "The payer's balance is below `amount` \| 409 `insufficient_funds`" (pay) | pay | test_model_fixture.py::test_short_payer_gets_409_then_pays_once_funded<br>test_payments_requests.py::test_not_pending_and_short<br>test_payments_requests.py::test_pay_insufficient | tested |
| S1-117 | "The caller is not the request's payer \| 403 `forbidden`" | pay | test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels<br>test_payments_requests.py::test_pay_by_requester_is_forbidden | tested |
| S1-118 | "Unknown request \| 404 `not_found`" | pay | test_payments_requests.py::test_pay_unknown_request | tested |
| S1-119 | "Replaying a successful payment returns 200 with its original payment body, including when the request is already `paid`. It moves no additional money and must not return `409 request_not_pending`." | pay | test_idempotency.py::test_claimed_key_resolved_before_resource_checks<br>test_payments_requests.py::test_pay_replay_after_paid | tested |
| S1-120 | "Returns `200` with the request, `status: "declined"`. Declining an already-declined request is `200` with the current state" | decline | test_payments_requests.py::test_decline | tested |
| S1-121 | "A `paid` or `cancelled` request is `409 request_not_pending`." (decline) | decline | test_payments_requests.py::test_decline_paid_or_cancelled | tested |
| S1-122 | "Not the payer is `403 forbidden`." (decline); "No idempotency key." | decline | test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels<br>test_payments_requests.py::test_decline<br>test_payments_requests.py::test_decline_not_payer | tested |
| S1-123 | "Returns `200` with the request, `status: "cancelled"`. Cancelling an already-cancelled request is `200`." | cancel | test_payments_requests.py::test_cancel | tested |
| S1-124 | "A `paid` or `declined` request is `409 request_not_pending`." (cancel) | cancel | test_payments_requests.py::test_cancel_paid_or_declined | tested |
| S1-125 | "Not the requester is `403 forbidden`." (cancel); "No idempotency key." | cancel | test_model_fixture.py::test_only_payer_pays_or_declines_only_requester_cancels<br>test_payments_requests.py::test_cancel<br>test_payments_requests.py::test_cancel_not_requester | tested |
| S1-126 | "Requests where the caller is the requester or the payer, and no others. Newest first by `created_at`." | list requests | test_payments_requests.py::test_list_only_own_newest_first | tested |
| S1-127 | "`direction` is `incoming` (the caller is the payer), `outgoing` (the caller is the requester) or absent for both." | list requests | test_payments_requests.py::test_direction_and_status_together<br>test_payments_requests.py::test_direction_filter<br>test_payments_requests.py::test_has_more_counts_filtered_items | tested |
| S1-128 | "`status` is one of the four statuses, or absent for all." | list requests | test_payments_requests.py::test_direction_and_status_together<br>test_payments_requests.py::test_status_filter | tested |
| S1-129 | "`limit` defaults to 50, range 1 to 200. `offset` defaults to 0 ... An unknown `direction` or `status` value is also 422." | list requests | test_payments_requests.py::test_bad_list_parameters<br>test_payments_requests.py::test_default_limit_is_50 | tested |
| S1-130 | "`has_more` is true when items exist beyond the last one returned." | list requests | test_payments_requests.py::test_default_limit_is_50<br>test_payments_requests.py::test_has_more_boundaries_and_paging<br>test_payments_requests.py::test_has_more_counts_filtered_items<br>test_splits_feed.py::test_activity_paging | tested |
| S1-131 | "`{ "requests": [ { ...request... } ], "has_more": false }`" | list requests | test_payments_requests.py::test_list_only_own_newest_first | tested |
| S1-132 | "The caller may be included in `participant_handles` or omitted. Shares follow the equal-split rule in §9, in the order the handles are given." | splits | test_splits_feed.py::test_caller_omitted<br>test_splits_feed.py::test_rounding_when_caller_is_not_first | tested |
| S1-133 | "**A request is created for every participant except the caller**, each for that participant's share, with the caller as requester." | splits | test_splits_feed.py::test_caller_omitted<br>test_splits_feed.py::test_split_requests_are_ordinary_pending_requests | tested |
| S1-134 | "`shares` covers every participant including the caller, in the order given, and always sums to `amount`. `requests` covers every participant except the caller, in the same order." (+ split_id, amount, currency, note, created_at) | splits | test_splits_feed.py::test_split_response_shape | tested |
| S1-135 | "`amount` below 1, above 1000000000, or not an integer \| 422 `validation_failed`" (splits) | splits | test_splits_feed.py::test_split_amount_bounds<br>test_splits_feed.py::test_split_amount_rules | tested |
| S1-136 | "`participant_handles` empty, or containing a duplicate handle \| 422 `validation_failed`" | splits | test_splits_feed.py::test_split_participants_empty_or_duplicate<br>test_splits_feed.py::test_split_with_a_thousand_unknown_participants | tested |
| S1-137 | "`note` longer than 200 characters \| 422 `validation_failed`" (splits) | splits | test_splits_feed.py::test_split_note_length | tested |
| S1-138 | "Any handle is unknown \| 404 `not_found`" (splits) | splits | test_splits_feed.py::test_split_unknown_handle<br>test_splits_feed.py::test_split_with_a_thousand_unknown_participants | tested |
| S1-139 | "A split whose only participant is the caller is **valid**: it computes one share, creates zero requests, and returns `"requests": []`." | splits | test_splits_feed.py::test_only_the_caller | tested |
| S1-140 | "Nothing about a split checks anyone's balance." | splits | test_splits_feed.py::test_split_checks_no_balance | tested |
| S1-141 | "Payments visible to the caller by the feed contract in §4, newest first by `created_at`." `{ "payments": [...], "has_more": ... }` | activity | test_splits_feed.py::test_activity_shape_and_newest_first | tested |
| S1-142 | "`limit` and `offset` behave exactly as in `GET /requests`." (activity) | activity | test_splits_feed.py::test_activity_bad_paging<br>test_splits_feed.py::test_activity_ignores_request_filters<br>test_splits_feed.py::test_activity_paging | tested |

## §9 Money and rounding

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-143 | "Shares must be whole minor units, sum exactly to `amount` and differ by at most one minor unit. When the amount does not divide evenly, the larger shares go to the first participants in `participant_handles` order." | rounding | test_splits_feed.py::test_rounding_rule<br>test_splits_feed.py::test_rounding_table<br>test_splits_feed.py::test_rounding_when_caller_is_not_first | tested |
| S1-144 | "1000 \| 3 \| 334, 333, 333" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-145 | "1 \| 3 \| 1, 0, 0" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-146 | "10 \| 3 \| 4, 3, 3" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-147 | "999 \| 3 \| 333, 333, 333" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-148 | "5 \| 5 \| 1, 1, 1, 1, 1" | rounding | test_splits_feed.py::test_rounding_table | tested |
| S1-149 | "Splitting the same amount among the same people in a different `participant_handles` order gives the extra unit to a different person." | rounding | test_splits_feed.py::test_order_moves_the_extra_unit | tested |
| S1-150 | "A share of `0` is legal and still produces a request for that participant." | rounding | test_splits_feed.py::test_zero_share_still_requests | tested |
| S1-151 | "Each split's shares are independent of previous splits. After any number of splits have been paid in full, wallet balances must still sum exactly to the seeded total." | rounding | test_splits_feed.py::test_paid_splits_conserve_the_total<br>test_splits_feed.py::test_splits_are_independent | tested |

## §10 Export and import

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-152 | "The service must support `GET /_test/export` and `POST /_test/import`. Like reset, these are unauthenticated test endpoints." | export | test_export_import.py::test_export_shape_no_auth | tested |
| S1-153 | "Return 200 from export with a JSON object containing `track: "pocketful"`, `format_version: 1` and `state` (an implementation-defined JSON object)." | export | test_export_import.py::test_export_shape_no_auth | tested |
| S1-154 | "Import takes that entire object and atomically replaces the service's state, returning 204. It must accept an unchanged export produced by this service." | import | test_export_import.py::test_import_round_trip_restores_everything | tested |
| S1-155 | "No dependency on the source process, files, volume, port or network address is allowed." | import | test_export_import.py::test_import_into_another_container | tested |
| S1-156 | "Import is replacement, not merge; repeating it restores the exported state without duplicating anything." | import | test_export_import.py::test_import_replaces_later_writes<br>test_export_import.py::test_import_twice_duplicates_nothing | tested |
| S1-157 | "Invalid JSON follows §5" (400 `malformed_request`) | import | test_export_import.py::test_import_invalid_json | tested |
| S1-158 | "missing fields, wrong track/version or an invalid state give 422 `validation_failed` without changing the destination." | import | test_export_import.py::test_import_invalid_document<br>test_export_import.py::test_import_with_an_amount_above_two_to_the_53_is_refused_or_exact | tested |
| S1-159 | "Test control calls have a 10-second timeout." | import | test_export_import.py::test_large_export_and_import_within_10_seconds | tested |
| S1-160 | "Export is an atomic, read-only snapshot; subsequent source writes do not change it." | export | test_export_import.py::test_export_is_an_atomic_snapshot_under_writes<br>test_export_import.py::test_import_replaces_later_writes | tested |
| S1-161 | "Preserve accounts and hashed-password login, existing bearer tokens, currency, balances, payments, requests, permissions, all completed idempotent request bodies and original responses." | import | test_export_import.py::test_currency_survives<br>test_export_import.py::test_import_into_another_container<br>test_export_import.py::test_import_round_trip_restores_everything<br>test_export_import.py::test_pending_request_still_payable_after_import<br>test_export_import.py::test_permissions_and_settlement_membership_survive<br>test_export_import.py::test_retries_survive_import<br>test_export_import.py::test_tokens_and_logins_survive_import<br>test_export_import.py::test_values_near_two_to_the_53_round_trip | tested |
| S1-162 | "Identities, timestamps and monetary records must not be regenerated or replayed against an already-net balance." | import | test_export_import.py::test_import_round_trip_restores_everything | tested |
| S1-163 | "Failed request keys remain reusable." | import | test_export_import.py::test_failed_keys_stay_reusable | tested |
| S1-164 | "Existing receipts, tokens and retries must remain valid after import" | import | test_export_import.py::test_import_into_another_container<br>test_export_import.py::test_retries_survive_import<br>test_export_import.py::test_tokens_and_logins_survive_import | tested |
| S1-165 | "Import removes all previous destination data and credentials." | import | test_export_import.py::test_import_replaces_later_writes | tested |
| S1-166 | "Reset clears all state, including imported state." | reset | test_export_import.py::test_reset_clears_imported_state<br>test_runtime.py::test_token_from_before_a_reset_is_unauthenticated | tested |

## §11 Atomic net settlements

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-167 | "The reset fixture may include `settlement_operator_ids`, an array of user ids, default []." | settlements | test_export_import.py::test_permissions_and_settlement_membership_survive<br>test_settlements.py::test_operator_list_defaults_to_empty<br>test_settlements.py::test_reset_sets_operator_permissions<br>test_settlements.py::test_several_operators | tested |
| S1-168 | "An operator may execute a settlement across any wallets." | settlements | test_settlements.py::test_operator_moves_money_between_other_wallets | tested |
| S1-169 | "This permission does not grant access to another user's requests or private activity items." | settlements | test_settlements.py::test_operator_gets_no_access_to_others_requests_or_private_items | tested |
| S1-170 | "`POST /settlements` requires an operator and an idempotency key. No token gives 401; authenticated non-operator gives 403 `forbidden`." | settlements | test_settlements.py::test_no_token_401_non_operator_403<br>test_settlements.py::test_operator_list_defaults_to_empty<br>test_settlements.py::test_operator_needs_a_key | tested |
| S1-171 | "transfers contains 1..32 objects." | settlements | test_settlements.py::test_malformed_batch_shape<br>test_settlements.py::test_one_and_thirty_two_transfers | tested |
| S1-172 | "Each uses ordinary payment amount, note and visibility rules (defaults: empty note, public)." | settlements | test_settlements.py::test_entry_amount_rules<br>test_settlements.py::test_entry_defaults<br>test_settlements.py::test_entry_missing_field<br>test_settlements.py::test_entry_note_and_visibility_rules | tested |
| S1-173 | "Unknown handle is 404" (settlements) | settlements | test_settlements.py::test_unknown_handle | tested |
| S1-174 | "self-transfer is 422 `self_payment`" | settlements | test_settlements.py::test_self_transfer | tested |
| S1-175 | "malformed batch shape is 422 `validation_failed`." | settlements | test_settlements.py::test_malformed_batch_shape<br>test_settlements.py::test_missing_transfers | tested |
| S1-176 | "Entry errors take precedence in input order, before insufficient funds." | settlements | test_settlements.py::test_entry_errors_in_input_order_before_funds | tested |
| S1-177 | "Unknown fields are ignored." (settlements) | settlements | test_settlements.py::test_unknown_fields_ignored | tested |
| S1-178 | "A settlement is affordable when every wallet's balance after all incoming and outgoing transfers is nonnegative." | settlements | test_settlements.py::test_affordable_by_net_position | tested |
| S1-179 | "Insufficient collective funds gives 409 `insufficient_funds`." | settlements | test_settlements.py::test_collective_shortfall_is_409_and_moves_nothing | tested |
| S1-180 | "Either all movements commit together or none do; failed validation claims no idempotency key and creates no payment or revision." | settlements | test_load.py::test_settlements_and_payments_at_once<br>test_settlements.py::test_collective_shortfall_is_409_and_moves_nothing<br>test_settlements.py::test_failed_settlement_claims_no_key<br>test_settlements.py::test_settlement_never_overdraws_any_wallet | tested |
| S1-181 | "Return 201 with `settlement_id`, `committed_at` and `payments` in input order." | settlements | test_settlements.py::test_response_shape | tested |
| S1-182 | "Every member is an ordinary payment with `settlement_id` linking the batch; nonmembers expose null for that field." | settlements | test_payments_requests.py::test_ordinary_payment_has_null_settlement_id<br>test_settlements.py::test_members_are_ordinary_payments | tested |
| S1-183 | "Members have null request_id and the same server-assigned created_at, equal to committed_at." | settlements | test_settlements.py::test_response_shape | tested |
| S1-184 | "Constituents follow ordinary activity-feed visibility. The settlement response contains every member's receipt." | settlements | test_settlements.py::test_members_follow_feed_visibility<br>test_settlements.py::test_response_shape | tested |
| S1-185 | "Replays return 200 with the original complete response." (settlements) | settlements | test_settlements.py::test_replay_returns_the_original_complete_response<br>test_settlements.py::test_settlement_keys_are_per_operator | tested |
| S1-186 | "A reset/import must preserve settlement operator permissions, original payments, requests, settlement membership and retry responses." | settlements | test_export_import.py::test_permissions_and_settlement_membership_survive<br>test_settlements.py::test_reset_sets_operator_permissions | tested |

## Rows added after review (coordinator, 2026-10-06)

| ID | Quote | Area | Tests | Status |
|---|---|---|---|---|
| S1-187 | "404 \| `not_found` \| No such resource" — `POST /requests/{id}/decline` and `/cancel` on an unknown request | decline/cancel | | open |
| S1-188 | "Every amount in the API is an integer count of its minor units" — response amounts are JSON integers even when the request wrote `1000.0` or `1e3` | amounts | | open |
| S1-189 | "After the body has parsed as a JSON object and the caller is authenticated, an already claimed key is resolved" — a claimed key does not override 401 (missing/unknown token) or 400 `malformed_request` (unparseable body), on all five idempotent paths | idempotency | | open |
| S1-190 | "IDs are opaque strings" + D4 (a seeded or imported id names one resource) — ids the service generates never collide with fixture or imported ids | conventions | | open |

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
- **D12 Field rules before funds.** An invalid `amount` or `note` is 422 even when the caller could not
  afford the payment: funds are compared with a valid amount (as §11 orders entry errors before funds).
