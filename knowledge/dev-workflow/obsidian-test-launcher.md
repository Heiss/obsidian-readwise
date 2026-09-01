---
type: Dev note
title: obsidian-test launcher
description: How nix run .#obsidian-test opens the bundled example vault, and why the launch path differs on Linux vs macOS.
tags: [nix, flake, obsidian, dev-workflow]
timestamp: 2026-07-21T00:00:00Z
---

# obsidian-test launcher

`nix run .#obsidian-test` (defined in `flake.nix`) builds the plugin, copies
`main.js`/`manifest.json`/`styles.css` into
`example-vault/.obsidian/plugins/linkwarden/`, starts the mock Linkwarden server
(`example-vault/mock-linkwarden/server.mjs` on port 8788), then opens Obsidian on
`example-vault/`.

## Isolation: never touch the user's real Obsidian install

The launcher runs a **fully isolated** Obsidian instance whose config lives in a
throwaway `example-vault/.obsidian-runtime/` inside the repo (gitignored). The
vault is registered there (marked `open: true`) — Obsidian only opens a vault
already in its list, see [Obsidian URI vault switching](obsidian-uri-vault-switching.md).
The user's `~/Library/Application Support/obsidian/` (macOS) or
`~/.config/obsidian/` (Linux) is **never** modified.

The isolated `obsidian.json` layout matches Electron's `userData` dir
(`<config>/obsidian/obsidian.json`), so the same file works for both launch
mechanisms:

- **Linux**: `XDG_CONFIG_HOME="$config_root" obsidian`.
- **macOS**: XDG is ignored, so isolate via Electron's flag instead:
  `obsidian --user-data-dir="$config_root/obsidian"`.

A distinct user-data dir also means the test instance runs **alongside** any
Obsidian the user already has open, instead of colliding with it.

## Pitfall: `obsidian` vs `obsidian-cli`, and the instance collision

nixpkgs' obsidian ships two binaries: `bin/obsidian` (execs the GUI app) and
`bin/obsidian-cli` (Obsidian's official remote-control CLI, which must be enabled
in *Settings → General → Advanced*). The GUI launcher is correct here.

The earlier "Command line interface is not enabled…" failure on macOS was **not**
because `obsidian` is the CLI — it isn't. It was a second GUI instance sharing
the running app's `userData` and getting forwarded to the primary instance.
Isolating with `--user-data-dir` avoids that forwarding entirely. Do **not**
"fix" this by opening a vault through `obsidian://open?path=` — that URI only
opens a file in the *current* vault (see the linked gotcha).
