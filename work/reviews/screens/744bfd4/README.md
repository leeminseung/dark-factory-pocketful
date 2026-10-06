# Final screenshots — stage 3, accepted revision 744bfd4

Captured by product-designer with Playwright (Chromium) against a Docker build of `stage-3/` at
744bfd4, at 375×812 (`375-*`) and 1280×900 (`1280-*`). Full-page shots unless the name marks a
state (`-error`, `-loading`, `-uncertain`, `-success`, `-fold`, `focus-*`), which show the viewport.

- Front door: `signup`, `signup-error`, `login`, `login-error`.
- `/`: `wallet-held`, `wallet-held-modest`, `wallet-held-fold`, `wallet-empty`, `wallet-jpy`,
  `focus-input`, `focus-button`, `focus-in-panel`, `pay-error-validation`,
  `pay-error-insufficient`, `pay-loading`, `pay-success`, `pay-uncertain`, `pay-retry-success`,
  `refresh-loading`, `activity-loading`, `after-authorize`, `after-authorize-modest`,
  `authorize-error`, `request-form-error`, `jpy-pay-error`, `wallet-after-release`.
- Large balances (headline sizing): `eur-typical`, `eur-10m`, `eur-max`, `eur-max-heldmax`,
  `jpy-typical`, `jpy-max`, `bhd-typical`, `bhd-max` (up to 2^53−1 minor units).
- `/requests`: `requests`, `requests-loading`, `requests-error`, `requests-paid`, `requests-empty`.
- `/split`: `split-initial`, `split-preview`, `split-invalid-amount`, `split-error`, `split-success`.
- `/authorizations`: `authorizations`, `auth-loading`, `reserved-loading`, `auth-error`,
  `auth-captured`, `auth-voided`, `auth-empty`, and at 375 `capture-zero-error`,
  `capture-after-void`, `release-after-capture`.

`index.txt` and `index2.txt` list each shot with the document scrollWidth and clientWidth; no
shot scrolls horizontally.
