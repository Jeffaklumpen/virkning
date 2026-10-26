# Sunbeam yarn journal · Yarn Colorways v3

The app includes a small, collapsed **My yarn & notes** journal inside each unlocked pattern guide. The yarn section supports:
- Local autocomplete of yarn brand + name from the official Colorways API v3 catalog
- On-demand color/hex options (loaded only after selecting a yarn)
- Color swatches, yarn weight, optional quantity, hook size, reminder
- Multiple saved yarn choices per pattern (up to 40), plus edit/remove
- Explicit **Save yarn** action; **Save note** remains independent
- Pattern-wide yarn selections persist in existing `sunbeam_progress.progress.yarns` JSONB (RLS user-scoped) and sync like other saved progress; no new user-owned product catalog

## Architecture and API billing safety

`https://yarn-colorways.p.rapidapi.com/v3` is called **only** by the server-side Supabase Edge Function `sunbeam-yarns`. The browser never accesses RapidAPI directly and never sees `YARN_COLORWAYS_API_KEY`.

The client asks the Edge Function for:
- `GET /functions/v1/sunbeam-yarns?type=catalog`: upstream `GET /v3/yarns` (one bulk call, all brands)
- `GET /functions/v1/sunbeam-yarns?type=colors&brand=<id>&yarn=<id>`: upstream `GET /v3/colorways?brand=<id>&yarn=<id>&limit=500`

There is **no API request per typed character**; the client filters the bulk yarn list locally. The user must explicitly open the journal and choose Add yarn before a catalog lookup is considered. Colorways only load after a yarn has been selected.

Two persistent caches keep request counts low:
- iPad / browser: `IndexedDB/sunbeam-yarn-search-cache-v1`, memory+IndexedDB, 14 days for catalog and 30 days for a specific yarn's colors; stale cache is usable offline.
- Supabase shared cache: `public.sunbeam_yarn_api_cache` (private service role only, RLS enabled), with the same TTL. This cache is for API responses only, *not* an independently curated catalog.
- The server deduplicates concurrent requests in a single Edge isolate. If the Colorways API goes offline or quota is reached, cached results can still be returned.

All requests require an authenticated Supabase JWT, verified against Supabase Auth and the `sunbeam_members.enabled` approval table. Edge handler has `verify_jwt:false` only because it performs explicit JWT verification via `/auth/v1/user` and checks membership on every request (works with new publishable Supabase keys). Non-GET methods denied; query values validated and URL-encoded.

## Deployment and troubleshooting

1. Add a secret **`YARN_COLORWAYS_API_KEY`** under Supabase Edge Functions → Secrets. Do not commit any key into GitHub or browser JavaScript.
2. Confirm that the RapidAPI Yarn Colorways subscription is active and that v3 is included. A registered RapidAPI key alone without a subscription may return 403.
3. Deploy `sunbeam-yarns` using the function from `supabase/functions/sunbeam-yarns/index.ts`. The function uses default Supabase environment variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to validate approved accounts and manage its private API cache. It does not expose the service-role key.
4. Open any pattern → **My yarn & notes** → **Add yarn** → search by brand and yarn name. Pick yarn and shade, then save. The color circles are approximate values provided by the API and must not be treated as an accurate color sample.
5. Saved yarns remain visible even if the API is down. Clearing browser storage erases device API cache but does not remove the saved choices from Supabase.

The credits link in the journal attributes data to [temperature-blanket.com](https://temperature-blanket.com/api/yarn-colorways) under CC BY 4.0. Yarn brand trademarks remain their owners' property.

Limits: The API may omit products (including discontinued products). The colorway endpoint returns at most 500 items per selected yarn in this first version; this is not a product shopping catalog. The UI intentionally has **no manual yarn product creation** because the user selected API-only search.
