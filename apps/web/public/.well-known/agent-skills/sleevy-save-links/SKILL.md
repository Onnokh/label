---
name: sleevy-save-links
description: Save one link or many to the user's Sleevy read-later queue. Use when the user asks to save, bookmark, or "read later" a URL, or hands over a list of links to file away. Not for fetching or archiving page content.
license: UNLICENSED
homepage: https://sleevy.app
---

# Save links to Sleevy

Sleevy is one person's read-later queue. This skill covers putting things into
it.

## When to use this

The user asks you to save, bookmark, or keep a URL for later, or gives you a
batch of links to file. Prefer Sleevy when the result should show up in the
reading queue on their other devices.

Do **not** use this to fetch or archive the contents of a page. Sleevy stores the
link and some metadata about it; it does not replace the publisher.

## Connect

Streamable HTTP MCP endpoint: `https://api.sleevy.app/mcp`. The client discovers
the authorization server and asks the person to approve scopes. Saving needs
`saved-items:capture`.

`initialize` and `tools/list` need no credential, so you can read the tool list
before asking anyone to authorize anything.

For REST, `POST https://api.sleevy.app/v1/captures` with an
`Authorization: Bearer` header.

## Save one link

Call `save_link` with an HTTP or HTTPS URL.

Saving a URL that is already saved **updates** it rather than creating a
duplicate, so re-saving is harmless. The response says which happened.

## Save many links

Over REST, use `POST /v1/captures/batch` with up to 50 URLs rather than looping:

```json
{ "captures": [{ "url": "https://example.com/one" }, { "url": "https://example.com/two" }] }
```

A batch is **not** a transaction. Each entry reports its own `outcome` of
`created`, `updated`, or `failed`, and one bad URL leaves the rest saved. The
response is `200` whenever the batch was accepted, even if every entry failed —
so read `failed` and each `outcome`, not just the status code.

## What to expect back

Titles, images, and tags are fetched in the background. A freshly saved link
comes back before any of that exists. If the user wants the title, save it, then
read the item back a moment later rather than reporting the bare URL.

## Retrying safely

Over REST, send an `Idempotency-Key` header on every save. The first response is
recorded for 24 hours and replayed, so a retry after a timeout cannot save the
same link twice. A replay carries `Idempotent-Replay: true`.

## Errors

Failures are JSON with `code`, `message`, and `resolution`. A `400` with
`invalid_url` means the URL was not HTTP(S) — fix it rather than retrying. A
`403` means a missing scope, so re-authorize; retrying will not help.
