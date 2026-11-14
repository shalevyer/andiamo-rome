# Andiamo · Rome

A Hebrew RTL trip companion for Shalev and Mia, November 18–23, 2026. The GitHub Pages app includes the itinerary, flights, accommodation, maps, checklists, notes and calendar export. It uses Google Sans, a neutral palette and subtle Art Nouveau details. Mobile dialogs are bottom sheets; events open in a detail view with a separate edit action. Dropdowns use native HTML controls.

## Shared trip

Open the trip invitation once on each device. The share button then copies the same live invitation. Mia does not need a Cloudflare or Wix account. The public URL without an invitation remains an independent local copy. The invitation grants read/write access to the shared itinerary and personal PDFs; share it only with the travelers.

The frontend polls the authenticated Cloudflare Worker every four seconds while visible, and reconnects on focus or when the network returns. Each change is journaled locally and saved in an IndexedDB outbox before it is sent. Unique operation IDs prevent duplicate retries. The backend merges individual fields atomically. Edits to the same field are preserved for explicit review, and deletion tombstones prevent stale edits from bringing items back.

The first connection archives the exact previous browser copy, then merges its changes against the original itinerary. It never replaces the shared trip wholesale. JSON imports and older snapshot invitations follow the same conflict-aware merge path when connected. Settings include previous trip versions, pre-connection backups and exports of pending or conflicting edits.

PDFs use conditional uploads, authenticated downloads and immutable version history. Existing local PDFs are preserved and migrated; conflicting versions require a choice. PDFs are not included in JSON trip backups or committed to GitHub. Previously opened PDFs are cached in IndexedDB for offline access.

Map pins resolve new place names and addresses in the Rome area through the authenticated backend. Photon lookups are serialized and cached in a separate SQLite table (30 days for matches, five minutes for no match), with a browser cache for offline revisits. Only the location text is sent to the provider. Lookup never modifies trip records or replaces manual coordinates; an address change uses a different cache key. `GEOCODER_URL` can override the provider endpoint. Unrecognized locations remain in the itinerary with a prompt to refine the address. Checked places show checkmark pins and list badges; unchecking restores their numbers. Check-ins preserve the current map view.

## Data persistence

The stable browser keys and database names must not change between builds. On the backend, preserve the Worker name, Durable Object binding/class and object identity `rome-2026-v1`. The schema only creates missing tables and inserts the initial trip when no trip exists. Deploying code never runs an overwrite/reset migration. Accepted trip revisions, rejected conflict payloads, idempotency records, deletion tombstones and prior PDF versions remain in the shared database.

The local mirror keeps the prior exact saved bytes before writing. Unreadable originals are archived. Storage failures leave the prior saved trip intact. Clearing a browser's site data removes its access link, offline edits and local PDFs; already synchronized data remains in Cloudflare. Reopen the invitation to reconnect.

## Development and deployment

Use Node.js 22+, `npm install`, `npm run build`, then `npm run dev`. The generated `docs/` directory is published on the `gh-pages` branch. `npm test` checks snapshot links, public bundle hygiene, service-worker versioning and local recovery. Run TypeScript with `tsc --noEmit`.

The backend is in `backend/entry.ts`; deploy with Wrangler using `backend/wrangler.jsonc`. The runtime secret `TRIP_KEY_SHA256` contains only the SHA-256 hash of the shared invitation key. Never commit invitation keys, OAuth credentials, private PDFs, local databases or migration exports. Production CORS allows only the GitHub Pages origin.

For local end-to-end testing, set `ANDIAMO_SYNC_URL=http://127.0.0.1:8787` for the frontend build, configure the local Worker secret and origins in ignored `backend/.dev.vars`, and start Wrangler locally. `scripts/test-sync.mjs` exercises two independent HTTP clients, field conflicts, deletions, retry receipts, file versions and history against localhost only. Its `--after-restart` mode verifies exact database persistence. Local access fixtures live in ignored `work/`. Always rebuild with the default production endpoint before publishing.
