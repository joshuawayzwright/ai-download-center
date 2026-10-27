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

Deployment readiness, browser verification and the production alias must be
recorded separately after the deployment completes. These source checks alone
do not prove a live website or working customer AI service.

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
