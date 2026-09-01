# Readwise Reader — example vault

This vault points at the bundled mock server, so the plugin can be exercised
end to end without a Readwise account.

1. `node example-vault/mock-readwise/server.mjs`
2. `npm run dev` in the repo root, so `main.js` is built
3. Open this folder as a vault, enable **Readwise Reader** in community plugins
4. **Settings → Readwise Reader → Sync now**

Then open [[Reading list]] — the panel (highlighter icon in the ribbon) will
show that note's highlights.

The mock deliberately includes a Kindle book, which has no Reader document and
therefore cannot be linked to a note. The sync reports it as skipped rather than
pretending it does not exist.
