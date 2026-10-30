# SOLO Cashflow Control v0.1 — private build, not ready for sale, 28 October 2026

## Outcome

The first actual private Cashflow Control workbook build, **0.1-review**, now
exists as a zero-filled customer template, a fictional worked example and a
guide. This advances the first product in the existing
[ten-product reset](SOLO-10-PRODUCT-RESET.md). It is not a release or approval to
sell: none of the ten replacement products is yet independently verified as
sale-ready.

The two `.xlsx` workbooks each contain three tabs:

| Tab | Implemented purpose |
| --- | --- |
| Cashflow | Twelve-month cash forecast from a fixed as-of date and opening balance, with buffer/shortfall indicators. |
| Invoices | 200 invoice slots; outstanding balances feed expected receipts without counting already-received money again. |
| Cash plan | 36 dated input slots with explicit From dates, keeping amounts tied to their intended periods when the forecast date changes. |

The approved SOLO business bitmap is embedded. All six rendered tabs across
the template and example were visually reviewed. The example is synthetic;
no actual customer or owner financial data was used. Each outstanding invoice
has one expected receipt date; instalment scheduling is outside this version.

## Verified calculations

The private validation record contains **61 checks, all passing**, evaluated
with `@oai/artifact-tool`. It covers partial receipts, settled invoices,
duplicates, invalid/missing inputs, month/year and forecast boundaries, the
final invoice slot, dated-plan stability, buffer warnings and empty-template
behavior. Separate expected arithmetic checks all twelve monthly closing
balances in the fictional example.

The verified example closes month one at **A$6,400** and month twelve at
**−A$3,200**. The blank template returns zero closing cash, no active invoices
and no correction warnings. Missing required inputs visibly block results
rather than silently becoming zero. Changing the as-of period retains dated
plan amounts; missing coverage requires review.

A separate **LibreOfficeDev 26.8.0.0.alpha0** check (build
`2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`) loaded, forcibly recalculated and
exported both workbooks using an isolated profile with `OOXMLRecalcMode=0`.
**56/56 focused comparisons passed:** all twelve example closing balances
matched independent arithmetic, outstanding invoices were A$7,700 and overdue
invoices A$1,000. The template's twelve closing balances and 216 forecast
monetary cells were numeric zero. No formula-error cells appeared across the six
sheets. Three tabs, conditional-format rule counts, drawing links, freeze panes
and formula-cell locations were retained; the originals were unchanged.

This verifies automated calculations and structure in that LibreOffice
development build. A font-cache warning was recorded; native visual and
interactive acceptance was not performed. Actual Microsoft Excel, Google
Sheets and Samsung acceptance also remain pending. The six-step guide has been
reconciled to all three tabs, dated Cash plan/From-date coverage, invoice ID rules
and avoidance of duplicate cash entries.

## Sanitized artifact identification

Only filenames, sizes and hashes are published here. Workbooks, the source
builder, full paid package and private download locations are not committed to
the public repository.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| SOLO-Cashflow-Control-Template.xlsx | 499,466 | `bff37387aa5828383bc5f7327ba5798d70a3d31cbff2cea0265fb34a5c6f4051` |
| SOLO-Cashflow-Control-Example.xlsx | 500,813 | `c88da1effb93b92520e0ebe67b4210a5931bbda7785374d1dcc9af8d52ae29a3` |
| SOLO-Cashflow-Control-Guide.md | 5,363 | `f2712416cdc17cef42558faf707b343cfad94a014927694e961f4d9fca714c95` |
| SOLO-Cashflow-Control-Validation.json | 8,897 | `235ed704295557598b1d6008420b3caca977c532f8d96297a53287b54644ca5e` |
| SOLO-Cashflow-Control-Native-Check.json | 9,304 | `3c44e591fe040800aab626262ba5b8a7f263c1769ad41f9ce519e37043f79d9c` |

## Remaining gates and preserved state

- [x] Verify the recorded build-engine checks and separate native recalculation/structure comparisons.
- [ ] Complete native visual/interactive and application/device acceptance; close any identified defects.
- [ ] Obtain owner acceptance of the private deliverable, reconciled guide and accurate listing.
- [ ] Approve final pricing and verify the correct Stripe purchase, protected delivery and support/refund journey. No price or checkout was activated.
- [ ] Approve and verify the public website cutover separately from AI access and paid-product readiness.

No API, database, Stripe, environment or production change occurred in this
build cycle. The production alias was rechecked and still points to maintenance
deployment **`dpl_9KijhLqwcEABqisC59RiLYJgyeV8`**. Existing SOLO API evidence is
unchanged; this workbook does not establish a public AI release.
[Issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31)
remains the current release checklist. The next product outcome is an accepted,
usable Cashflow Control package with a verified purchase-to-delivery journey.
