# powerhouse-website (retired)

This folder used to hold a copy of The Solo Service Provider website and the SOLO AI API. That copy had fallen out of date.

**The live website and SOLO AI API are in the private [`joshuawayzwright/solo-commerce`](https://github.com/joshuawayzwright/solo-commerce) repository** (`public-static-release/`). That is what Vercel deploys to thesoloserviceprovider.com.au, and what the SOLO AI Android app calls (`/api/solo-chat`). Make website and API changes there.

What stays here:

| Path | Why |
|---|---|
| `assets/` and `assets/approved-stage/` | Approved brand images referenced by the brand rules and other repositories |
| `../supabase/migrations/`, `../supabase/templates/` | SOLO AI database migrations and email templates |
| `../supabase/tools/solo-member-access.cjs` | Member-access planning tool (tested in `tests/solo-database/`) |
| `../apps/solo-android/` | The SOLO AI Android app |

The removed files are still in this repository's git history.
