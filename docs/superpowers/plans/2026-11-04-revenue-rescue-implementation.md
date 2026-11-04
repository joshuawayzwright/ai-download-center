# SOLO Revenue Rescue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a tested, reversible Revenue Rescue service page within The Solo Service Provider site without enabling product checkout or public SOLO AI access.

**Architecture:** Add one static HTML service page and one page-specific stylesheet under `powerhouse-website/`. Extend the existing shared navigation script for sitewide discovery and update the sitemap. Add dependency-free Node tests and use Chromium for desktop/mobile rendering verification before a protected preview and production merge.

**Tech Stack:** Static HTML5, CSS, browser JavaScript, Node.js built-in test runner, headless Chromium, GitHub branch/PR, Vercel preview/production deployment.

**Spec:** `docs/superpowers/specs/2026-11-04-revenue-rescue-design.md`

## Global Constraints

- Keep all ten products `COMING SOON`; do not add or reactivate checkout.
- Keep public SOLO AI authentication, chat, recovery, paid features and autonomous modes closed.
- Do not add a database, server-side form, third-party tracker, new dependency, new domain or duplicate infrastructure.
- Use `joshuawright@thesoloserviceprovider.com.au`, `0452 272 820`, ABN `63 638 672 067`, Australian English and AUD.
- Use local approved asset `/assets/approved-stage/business-app-icon-512.png`.
- Do not claim guaranteed revenue, enquiries, rankings or results.
- Merge only after static tests, desktop/mobile rendering checks, PR diff review and preview verification pass.

## Review Focus

- Invalid or incomplete form input must remain controlled by native required fields and must not prepare an email until valid.
- Repeated execution of `site-navigation.js` must not duplicate the Services or footer links.
- Existing pages without the expected founder or footer elements must not throw JavaScript errors.
- A mobile viewport of 412×915 must have no horizontal overflow and must keep primary calls to action usable.
- The service page must not contain payment URLs, network form submission, storage calls or language implying guaranteed outcomes.

---

### Task 1: Add contract tests for the approved service page

**Files:**
- Create: `powerhouse-website/tests/revenue-rescue.test.cjs`

**Interfaces:**
- Consumes: static files in `powerhouse-website/`.
- Produces: dependency-free test command `node --test powerhouse-website/tests/revenue-rescue.test.cjs`.

- [ ] **Step 1: Write failing tests for required metadata, package copy, contact details, local asset path and legal links.**
- [ ] **Step 2: Write failing tests rejecting payment URLs, `fetch`, `XMLHttpRequest`, storage calls and guarantee language.**
- [ ] **Step 3: Write failing tests for navigation script idempotence markers and sitemap inclusion.**
- [ ] **Step 4: Run `node --test powerhouse-website/tests/revenue-rescue.test.cjs` and confirm failure because the service page and integration are absent.**
- [ ] **Step 5: Commit the tests.**

### Task 2: Create the production service page

**Files:**
- Create: `powerhouse-website/revenue-rescue.html`
- Create: `powerhouse-website/revenue-rescue.css`

**Interfaces:**
- Consumes: `/assets/approved-stage/business-app-icon-512.png`, `/site-navigation.js`, `/terms.html`, `/privacy.html`, `/refunds.html`.
- Produces: public route `/revenue-rescue.html`; DOM ids `pricing`, `process`, `faq`, `enquire`, `package-select`, `enquiry-form`, and `form-status`; package anchors with `data-package` values.

- [ ] **Step 1: Add semantic head metadata, canonical URL, Open Graph data, theme colour and Service JSON-LD.**
- [ ] **Step 2: Add the approved branded layout, three package cards, delivery process, honesty boundaries, FAQ and business credentials.**
- [ ] **Step 3: Add the native required-field enquiry form and package preselection behaviour.**
- [ ] **Step 4: Add mailto generation addressed to `joshuawright@thesoloserviceprovider.com.au` and visible status feedback.**
- [ ] **Step 5: Run the contract test and confirm page-specific assertions pass while integration assertions still fail.**
- [ ] **Step 6: Commit the service page.**

### Task 3: Connect the page to the existing site without broad HTML rewrites

**Files:**
- Modify: `powerhouse-website/site-navigation.js`
- Modify: `powerhouse-website/sitemap.xml`

**Interfaces:**
- Consumes: existing `.nav`, `#primary-links`, `.founder-actions`, `footer .footerlinks` patterns.
- Produces: one `SERVICES` navigation link, founder call-to-action target `/revenue-rescue.html`, one footer service link and sitemap URL.

- [ ] **Step 1: Insert a non-duplicating Services link before Contact when `#primary-links` exists.**
- [ ] **Step 2: Retarget only the homepage button whose text contains `WORK WITH ME`.**
- [ ] **Step 3: Insert one non-duplicating `Revenue Rescue` link into matching footer link groups.**
- [ ] **Step 4: Preserve the existing mobile navigation event behaviour and no-JavaScript visibility of current links.**
- [ ] **Step 5: Add `https://thesoloserviceprovider.com.au/revenue-rescue.html` to the sitemap.**
- [ ] **Step 6: Run the contract test and confirm all assertions pass.**
- [ ] **Step 7: Commit the integration.**

### Task 4: Verify rendered behaviour and responsive layout

**Files:**
- Create locally only: `verification/desktop.png`
- Create locally only: `verification/mobile.png`
- Create locally only: `verification/render-results.json`

**Interfaces:**
- Consumes: the static service page, stylesheet and navigation script.
- Produces: rendered evidence and exit-code checks; no repository artifact required.

- [ ] **Step 1: Load the exact page markup, CSS and JavaScript into headless Chromium.**
- [ ] **Step 2: Render at 1440×1000 and save a desktop screenshot.**
- [ ] **Step 3: Render at 412×915 and save a mobile screenshot.**
- [ ] **Step 4: Execute a browser check confirming `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.**
- [ ] **Step 5: Execute a browser check confirming package selection changes `#package-select` and a valid submit creates the expected encoded mailto URL without a network request.**
- [ ] **Step 6: Inspect screenshots for clipping, broken hierarchy and unusable calls to action.**

### Task 5: Open, review and verify the pull request

**Files:**
- Create: `docs/superpowers/specs/2026-11-04-revenue-rescue-design.md`
- Create: `docs/superpowers/plans/2026-11-04-revenue-rescue-implementation.md`

**Interfaces:**
- Consumes: tested feature branch.
- Produces: reviewed PR targeting `main`, Vercel preview URL and recorded evidence.

- [ ] **Step 1: Push the spec, plan, tests and implementation to `feat/revenue-rescue-service`.**
- [ ] **Step 2: Open a PR that explicitly states checkout and public SOLO AI remain disabled.**
- [ ] **Step 3: Review the changed-file list and full patch for accidental scope expansion, secrets and product-state changes.**
- [ ] **Step 4: Check GitHub workflow results and resolve any failure attributable to this branch.**
- [ ] **Step 5: Identify the Vercel preview for the PR and verify `/revenue-rescue.html`, homepage navigation, legal links and mobile rendering.**

### Task 6: Merge safely and verify production

**Files:**
- Update project checklist: GitHub issue `#31` comment/current status.

**Interfaces:**
- Consumes: approved PR head SHA and successful preview verification.
- Produces: merged main commit and live production service route.

- [ ] **Step 1: Squash-merge with expected-head protection.**
- [ ] **Step 2: Verify the resulting main commit and production deployment status.**
- [ ] **Step 3: Verify live HTTP status and visible content at `/revenue-rescue.html`.**
- [ ] **Step 4: Verify the live homepage exposes the Services link and the ten products remain `COMING SOON`.**
- [ ] **Step 5: Verify public SOLO AI remains closed and no checkout is exposed.**
- [ ] **Step 6: Record the merge, deployment, tests, live URL and remaining sales-operations work on issue #31.**
