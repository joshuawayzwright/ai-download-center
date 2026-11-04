# SOLO Revenue Rescue Service Page Design

## Intent

Add a genuine fixed-scope commercial service to The Solo Service Provider that Joshua Wright can sell immediately through direct outreach and referrals. The service page must convert a qualified visitor into a reviewed email enquiry without pretending that revenue, rankings, or sales are guaranteed.

## Goals

- Publish a dedicated `revenue-rescue.html` page under the existing commercial domain.
- Sell three clearly bounded service levels: A$395 Conversion Leak Audit, A$1,250 SOLO Revenue Rescue, and Implemented Rescue from A$2,500.
- Reuse the approved Solo Service Provider visual identity, public business details, contact address, and local brand asset.
- Provide a mobile-safe, accessible enquiry flow that prepares a reviewable email rather than silently collecting data.
- Make the service discoverable from existing site navigation, the homepage founder call-to-action, site footers, and the sitemap.
- Preserve a reversible branch/PR workflow and verify a protected preview before production merge.

## Non-goals

- Do not activate Stripe, checkout, subscriptions, deposits, or payment collection.
- Do not change the ten digital products from `COMING SOON`.
- Do not open public SOLO AI authentication, chat, or paid features.
- Do not create a new domain, repository, database, CRM, analytics account, or duplicate infrastructure.
- Do not add fake testimonials, case studies, client logos, performance percentages, or guaranteed outcomes.
- Do not send form data to a server, third party, or database.

## Constraints

- Existing repository: `joshuawayzwright/ai-download-center`.
- Existing production site source: `powerhouse-website/`.
- Existing public business email: `joshuawright@thesoloserviceprovider.com.au`.
- Existing public phone: `0452 272 820` / `+61 452 272 820`.
- Existing ABN: `63 638 672 067`.
- Existing visual palette: dark navy/charcoal, steel, gold, restrained electric blue, rust accents.
- Existing approved business emblem: `/assets/approved-stage/business-app-icon-512.png`.
- Australian English and AUD pricing.
- No dependency installation is required; the site remains static HTML/CSS/JavaScript.

## Approved approach

Create a standalone static service page with page-specific CSS and small inline enquiry JavaScript. Reuse the existing public emblem by local site path and link to the existing legal pages. Extend `site-navigation.js` as a progressive enhancement to insert a `SERVICES` link across existing site pages, redirect the homepage `WORK WITH ME` action to the service page, and add a Revenue Rescue footer link where the shared footer pattern is present. Add the new URL to `sitemap.xml`.

This approach is preferred over editing every HTML page because it changes fewer files and reduces regression risk. It is preferred over creating a new app or backend because the first commercial requirement is a credible lead-generation page, not software automation or payment collection.

## User flow

1. Prospect receives a direct link through personalised outreach, referral, social profile, or site navigation.
2. Prospect reviews the problem definition, deliverables, boundaries, process, and package pricing.
3. Prospect selects a package or fit check.
4. Prospect enters name, business, website, package, and current problem.
5. The browser prepares a pre-addressed email in the prospect's own email application.
6. The prospect reviews and sends the message.
7. Joshua manually confirms fit, scope, scheduling, invoice/payment method, and access requirements before work begins.

## Safety and honesty boundaries

- The page must state that revenue and rankings are not guaranteed.
- Implementation requires an agreed scope, access review, backups, and approval.
- AI assistance must be described as human-reviewed.
- The enquiry form must not use `fetch`, `XMLHttpRequest`, analytics submission, or hidden storage.
- `Implemented Rescue` must remain a starting price subject to scope.
- GST treatment must not be represented incorrectly; the diagnostic card says it is confirmed on invoice.

## Acceptance criteria

- `/revenue-rescue.html` renders at desktop and 412-pixel mobile widths without horizontal overflow.
- The three approved packages, exact prices, deliverables, disclaimers, contact details, and legal links are present.
- Package buttons set the form package selection.
- A valid form submission produces an encoded `mailto:` URL addressed to the approved business email.
- The page contains a canonical URL and Service schema metadata.
- Existing navigation gains one non-duplicated `SERVICES` link when JavaScript runs.
- The homepage `WORK WITH ME` button points to `/revenue-rescue.html` when JavaScript runs.
- The new URL exists in `powerhouse-website/sitemap.xml`.
- No checkout URL, payment code, public SOLO AI change, product-state change, or secret is introduced.
