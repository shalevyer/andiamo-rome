# Andiamo · Rome

A Hebrew RTL trip companion for Shalev and Mia, November 18–23, 2026.

This public GitHub Pages edition includes the itinerary, flight schedule, accommodation information, map, checklists, notes and calendar export. It preserves the neutral design, Google Sans and subtle Art Nouveau details.

Events open in a read-only detail view with navigation, completion and an explicit edit action. On mobile, dialogs open as bottom sheets with independent scrolling and a drag handle for dismissal.

Edits stay in this browser. “Share updated trip” creates a snapshot link; the recipient reviews it before replacing their saved plan. Later changes require a new link. JSON backup and restore are also available. There is no automatic cross-device sync.

PDFs added in the app stay in this browser's IndexedDB. They are not uploaded, included in snapshot links or JSON backups, or committed to this repository. Original booking codes, personal travel documents, insurance certificates and runtime credentials are excluded from this public edition. Clearing site data removes locally saved edits and documents.

## Development

Use Node.js 22 or newer, run `npm install`, `npm run build`, then `npm run dev`. Run `npm test` for sharing and public bundle checks. The generated `docs/` directory is the GitHub Pages publishing source on the `gh-pages` branch. Do not add private documents or keys to source or build output.
