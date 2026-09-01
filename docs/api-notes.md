# API notes — verified facts and the open checklist

Two APIs, one token (`Authorization: Token <token>`, from
<https://readwise.io/access_token>).

- **Reader v3** — `https://readwise.io/api/v3/` — documents: list, save, update,
  tags. Used for the picker's tier-2 index and for F3.
- **Readwise v2** — `https://readwise.io/api/v2/` — `auth/` and `export/`.
  `export/` is the plugin's highlight source (R3).

## Verified from the official docs (2026-09-01)

| Fact | Value |
| --- | --- |
| Auth header | `Authorization: Token <token>` |
| Token check | `GET /v2/auth/` → `204` |
| List paging | `limit` 1–100, default 100; follow `nextPageCursor` |
| List filters | `id`, `updatedAfter`, `location`, `category`, `tag` (singular, ≤5), `withHtmlContent`, `withRawSourceUrl` |
| Rate limits | 20/min for list, tags, bulk_update, delete; **50/min** for save, update. `429` carries `Retry-After` (seconds) |
| Save result | `201` created, `200` already existed — both return `{ id, url }` |
| Save/update `location` | `new`, `later`, `archive`, `feed` — **not** `shortlist` (which *is* a valid list filter). An unavailable location is silently replaced with the user's default |
| Highlights & notes | are themselves documents, with `parent_id` set to the article and to the highlight respectively |
| Highlight colour | not exposed anywhere in the Reader API |
| Document URL | embeds the triage location: `https://read.readwise.io/<location>/read/<id>` |
| Document id | opaque lowercase alphanumeric, **variable length** (documented examples run 25–28 chars) |

## Open checklist — needs a live token

Nothing below blocks the build; each has a defensive default in the code. Run it
whenever convenient and record the answers here.

```bash
TOKEN=...   # https://readwise.io/access_token

# 1. Does an exported book's unique_url carry the Reader document id?
#    This is the join between a highlight and its binding.
curl -s "https://readwise.io/api/v2/export/" \
  -H "Authorization: Token $TOKEN" |
  python3 -c 'import json,sys; d=json.load(sys.stdin); [print(b["unique_url"], "|", b["source_url"]) for b in d["results"][:5]]'

# 2. How many requests does a full export actually take, and how big is a page?
curl -s "https://readwise.io/api/v2/export/" \
  -H "Authorization: Token $TOKEN" |
  python3 -c 'import json,sys; d=json.load(sys.stdin); print("books on page 1:", len(d["results"]), "| total:", d["count"], "| next:", bool(d.get("nextPageCursor")))'

# 3. Do highlights carry their own tags, or only their book's?
curl -s "https://readwise.io/api/v2/export/" \
  -H "Authorization: Token $TOKEN" |
  python3 -c 'import json,sys; d=json.load(sys.stdin); [print(h.get("tags"), "|", b.get("book_tags")) for b in d["results"][:3] for h in b["highlights"][:3]]'

# 4. Does the location-free document URL resolve?
curl -so /dev/null -w '%{http_code} -> %{redirect_url}\n' "https://read.readwise.io/read/<some-id>"

# 5. How fresh is the export? Highlight something in Reader, then:
curl -s "https://readwise.io/api/v2/export/?updatedAfter=$(date -u -d '5 minutes ago' +%FT%TZ)" \
  -H "Authorization: Token $TOKEN" | head -c 400
```

**When answered:** record the result in the table above, save a redacted response
into `tests/fixtures/`, and delete whichever defensive path the answer makes
unnecessary.
