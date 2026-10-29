# Commercial website release — 28 October 2026

## Owner instruction and scope

Joshua explicitly requested: “the website live with all products say coming soon”.
This authorizes this website cutover and supersedes the older pending-cutover
approval item in issue #31. It does not authorize AI spending, purchases, or an
uncontrolled public inference service.

The release is assembled on `main` commit
`6940d9299c06c75713e59b050597a5a8ff66e29a`, retaining its current support email,
telephone and unrelated portfolio changes. It carries selected, reviewed website
and catalogue improvements from `feat/solo-customer-access`; it does not merge
that entire development branch.

## Website changes

- All ten launch products have equal cards labelled **COMING SOON** on the
  homepage and store. Catalogue status is `coming_soon_not_for_sale`.
- Proposed prices and checkout fields are null; no customer purchase buttons
  are presented. Existing historical Stripe records are retained.
- The current professional Terms, Privacy and Refunds layouts and corrected
  free sampler are included.
- Approved business and SOLO AI artwork and **CONNECT & FOLLOW OUR JOURNEY**
  are retained. There is no founder photograph.
- The public SOLO AI page states actual availability and offers early-access
  contact. It does not present a non-operational conversation input as a product.
- Current support details from main are retained, including the Contact page's
  telephone link. No contact message has been sent.

## Verification before deployment

- Exactly ten product cards on the homepage and store.
- No public prices or actionable checkout links on customer pages.
- Local file and fragment links checked across eight customer/historical pages.
- Existing directory catalogue validation passes: 983 entries, 12 categories.
- Approved artwork files are unchanged.
- The SOLO hero button reaches the availability panel; the keyboard skip link
  uses the existing approved focus styling.
- Sampler contact-only correction: three displayed emails and the mailto link
  use current support details. Both pages visually checked; text differs only
  in those email substitutions and 2× rendering has zero changed pixels outside
  the three contact regions. Final PDF SHA-256:
  `a06b1ef7b7fd308b7c687d467dffc1557199a07d59c0c49560fca035dd23160d`.

## Verified production outcome

- Website release [PR #35](https://github.com/joshuawayzwright/ai-download-center/pull/35)
  merged as `fc35fc3e6872268b07c401822d41b3a2bb77e697`.
- A real browser check found the sticky header covering a product label after
  anchor navigation. Follow-up `eabe97ad26141c8096fc533951dbc6482fb78f74`
  corrected section offsets; the label is now below the header on the live site.
- Production deployment **`dpl_7Bg2jvu7yKdHk5mfa8GqCHKrD3Nt`** is Ready at that
  runtime commit. Fresh Vercel alias inspection maps the commercial domain to it.
- [Homepage](https://thesoloserviceprovider.com.au/),
  [store](https://thesoloserviceprovider.com.au/digital-products.html) and
  [Terms](https://thesoloserviceprovider.com.au/terms.html) were opened in Chrome.
  Each listing has ten COMING SOON cards. Approved images load; the tested
  1363 × 936 desktop viewport has no horizontal overflow. Terms has its eight
  contents links and professional policy layout. Actual Samsung acceptance
  remains unverified.
- Fourteen production HTML/style/script/image/PDF requests returned HTTP 200
  and their bytes match source exactly. The legacy chat route returns GET 405;
  an unauthenticated POST returns 503 with public AI disabled.
- [Sanitized live results](evidence/solo-website-and-api-live-2026-10-28.json)
  include source hashes, browser observations and verification scope.
- [Collection screenshot](evidence/solo-coming-soon-live-2026-10-28.jpg) and
  [Terms screenshot](evidence/solo-terms-live-2026-10-28.jpg) capture the real
  production pages, not a design mockup.

## Separately implemented SOLO access work

The customer branch at `9a4c04823fe130ef5f93421fc9538af6f4e1015e` preserves the
published website and current contacts. It adds an explicit production-origin
release rule, prohibits owner-token inference in Production, fixes logout while
sign-in is disabled, and implements persistent login admission using keyed
identifiers. It remains in draft PR #34; it is not the public customer release.

[CI 40537911464](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40537911464)
passed **184 JavaScript + 30 SQL = 214 tests**, zero failures or skips.
Repository quality `40537911429` also passed. Website PR #35 quality
`40534241787` and catalogue `40534241851` passed before cutover.

Protected Preview **`dpl_3fTVU8E1i1NogJuNbq5iV8EEkJah`** is Ready at `9a4c048`.
Six actual HTTP checks passed: disabled account status 200; same-origin logout
200 with both cookie slots cleared; cross-origin logout 403 without clearing;
login 503/auth_disabled; customer-intent chat 503/customer_disabled; chat GET 405.
No signed-in session, email or inference was used in these checks. They do not
replace actual signed-in browser or provider-error acceptance.

The new Auth-admission migration **was not applied**. Two `apply_migration`
requests returned `McpServerError: Invalid or expired requestState`; SQL readback
confirms no new table/RPC, unchanged migration history and disabled chat policy.
The migration is saved and tested. No unmanaged schema/history edit was used.
Customer onboarding/recovery code, production mail delivery, provider charging
controls and actual signed-in/mobile acceptance remain unfinished.

## SOLO AI remains a separate release gate

Real private customer Gemini conversations, durable chat quotas and sessions
have already been verified on the development branch. Public customer signup,
recovery, production configuration and provider charging controls remain gates.
Private tokens must never be presented to customers. No model request, paid
purchase, signup setting or inference entitlement is changed by this release.

## Rollback

Previous production deployment:
`dpl_9KijhLqwcEABqisC59RiLYJgyeV8` (maintenance).

If a material regression is found, restore the commercial domain's alias to that
existing deployment. Do not create a duplicate Vercel project or alter WrightWayz.

The current release checklist remains
[issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).
