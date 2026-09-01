---
type: Gotcha
title: Obsidian URI vault switching
description: obsidian://open?path only opens a file inside an already-known vault; it does not switch to an unregistered folder.
tags: [obsidian, uri, dev-workflow]
timestamp: 2026-07-21T00:00:00Z
---

# Obsidian URI vault switching

The `obsidian://open?path=<abs path>` URI does **not** adopt or switch to an
arbitrary vault. Per the [official spec](https://obsidian.md/help/Extending+Obsidian/Obsidian+URI),
`path` "looks for any vault that **contains** the path" — but only among vaults
Obsidian **already has in its vault list**. If no known vault contains the path,
the URI falls back to the **currently open vault** and just opens/creates a file
there.

Observed symptom (hit more than once): calling `obsidian://open?path=<dev vault>`
opened a file in whatever vault was already active instead of opening the dev
vault.

## How to open/switch to a specific vault

1. **Register the vault first** by adding an entry to Obsidian's `obsidian.json`
   vault list (`{ path, ts }`; add `open: true` to auto-open on next launch).
   Config location:
   - Linux: `$XDG_CONFIG_HOME/obsidian/obsidian.json` (can be isolated)
   - macOS: `~/Library/Application Support/obsidian/obsidian.json` (no isolation)
   - Windows: `%APPDATA%/obsidian/obsidian.json`
2. **Then switch by name**: `obsidian://open?vault=<vault-name>` (name is the
   folder basename, or the generated id).

Also note: the modern `obsidian` CLI binary is a remote-control that must be
enabled in *Settings → General → Advanced*; it is **not** a GUI launcher. See
[obsidian-test launcher](obsidian-test-launcher.md).
