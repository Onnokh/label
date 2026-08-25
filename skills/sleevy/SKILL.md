---
name: sleevy
description: Save a link to the user's Sleevy read-later queue, and find, organize, or update what is already saved there. Use when the user asks to save or bookmark a URL for later, read back their reading queue, mark something read or unread, or manage their Sleevy folders. Not for crawling pages, archiving page content, or answering questions about pages that have not been saved.
homepage: https://sleevy.app
license: UNLICENSED
---

# Sleevy

Sleevy is a personal read-later service. It gives one person a single synced
queue of Saved Items across a web app, an iPhone app, a Chrome extension, a
Raycast extension, a REST API, and an MCP server.

## When to use this

Use Sleevy when the user asks to:

- save an HTTP or HTTPS URL for later;
- list or search the URLs already in their Sleevy queue;
- mark a Saved Item read or unread;
- move a Saved Item into a folder; or
- create, list, or remove Sleevy folders.

Prefer it whenever the result should show up in the reading queue on the user's
other Sleevy clients.

## When not to use this

Sleevy stores and organizes links. It is not a web crawler, a page-content
archive, a general notes database, or a source of facts about pages that have
not been saved. If the user wants the *content* of a page, fetch the page; if
they want to come back to it later, save it here.

## Connect

Connect to the Streamable HTTP MCP endpoint:

```
https://api.sleevy.app/mcp
```

The MCP client discovers Sleevy's OAuth authorization server, opens a browser
for sign-in, and asks the user to approve scopes. No API key is required.

For a client that cannot speak MCP, use the REST API at `https://api.sleevy.app`
with a personal API key the user creates at <https://sleevy.app/settings>. The
full walkthrough is at <https://sleevy.app/auth.md> and the schema is at
<https://sleevy.app/openapi.json>.

## Tools

| Tool | Does | Scope |
| --- | --- | --- |
| `list_saved_items` | List saved items, newest first, paged by cursor | `saved-items:read` |
| `save_link` | Save an HTTP(S) link to the queue | `saved-items:capture` |
| `set_saved_item_read_state` | Mark an item read or unread | `saved-items:write` |
| `set_saved_item_folder` | Move an item into a folder, or out of one | `saved-items:write` |
| `delete_saved_item` | Permanently delete an item | `saved-items:delete` |
| `list_folders` | List the user's folders | `folders:read` |
| `add_folder` | Create a folder | `folders:write` |
| `remove_folder` | Remove a folder, keeping its items | `folders:delete` |

A session only sees the tools its granted scopes cover, so ask for the narrowest
set that does the job.

## How to work with it

**Page through lists.** `list_saved_items` returns a `nextCursor`. Keep calling
with it until it comes back `null`. Do not build a cursor yourself.

**Reuse the IDs Sleevy gives you.** Saved Item and folder IDs are stable. Look
one up by listing rather than guessing it.

**Confirm before deleting.** `delete_saved_item` and `remove_folder` cannot be
undone. Ask the user first, every time, even if they asked for a bulk cleanup.
Removing a folder keeps the items inside it; deleting a Saved Item does not.

**Expect enrichment to lag.** A freshly saved link comes back before its title,
image, and tags are fetched. If the user wants the title, save it, then read the
item back a moment later.

**Retry safely.** Over REST, send an `Idempotency-Key` header on writes so a
retry after a timeout cannot save the same link twice. To save many links at
once, use `POST /v1/captures/batch` rather than a loop.

**Slow down before you are refused.** Responses carry `RateLimit-Limit`,
`RateLimit-Remaining`, and `RateLimit-Reset`. A `429` carries `Retry-After`.

**Read the error.** Failures are JSON with `code`, `message`, and `resolution`.
A `403` means a missing scope, so retrying will not help — re-authorize instead.

## More

- Documentation: <https://sleevy.app/docs>
- MCP guide: <https://sleevy.app/docs/mcp>
- Authentication: <https://sleevy.app/auth.md>
- Agent index: <https://sleevy.app/llms.txt>
