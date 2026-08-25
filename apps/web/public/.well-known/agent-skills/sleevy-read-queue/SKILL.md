---
name: sleevy-read-queue
description: Read and search the user's Sleevy reading queue, and mark items read or unread. Use when the user asks what is in their reading list, wants to find something they saved, or wants to mark something off.
license: UNLICENSED
homepage: https://sleevy.app
---

# Read the Sleevy queue

Sleevy is one person's read-later queue. This skill covers reading what is in it
and tracking what they have got through.

## When to use this

The user asks what is in their reading list, wants to find a link they saved
earlier, or wants something marked read or unread.

Do **not** use this as a source of facts about pages. Sleevy knows the title, the
site, and a short summary of a saved link — not its contents.

## Connect

Streamable HTTP MCP endpoint: `https://api.sleevy.app/mcp`. Reading needs
`saved-items:read`; changing read state needs `saved-items:write`.

## List what is saved

Call `list_saved_items`. Results come newest first and are **paged**:

- Pass `limit` for the page size, capped at 100.
- The response carries `nextCursor`. Call again with it until it comes back
  `null`.
- Treat the cursor as opaque. Pass it back exactly as given; never build one.
- A cursor belongs to the query that produced it — the same `sort` and folder
  filter.

Over REST the same shape lives at `GET /v1/saved-items?limit=50&cursor=...`.

## Find something specific

There is no full-text search over page contents. Page the list and match on the
title, host, or tags Sleevy returns. If the user describes a link vaguely, list a
page and offer candidates rather than guessing at a single answer.

## Mark things read

`set_saved_item_read_state` takes a saved-item ID and a boolean. It is
idempotent — marking an already-read item read again succeeds and changes
nothing.

Over REST there is also `POST /v1/saved-items/{id}/open`, which records that the
person actually opened the link as well as marking it read. Prefer it when they
followed the link rather than just dismissing it.

## Working with IDs

Reuse the IDs Sleevy returns. They are stable. Never guess one — list first.

## Pacing

Every response carries `RateLimit-Limit`, `RateLimit-Remaining`, and
`RateLimit-Reset`. Slow down before you are refused rather than after. A `429`
carries `Retry-After`.
