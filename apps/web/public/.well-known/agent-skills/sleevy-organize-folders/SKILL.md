---
name: sleevy-organize-folders
description: Organize the user's Sleevy queue into folders, move saved items between them, and remove items or folders. Use when the user wants to tidy their reading list. Deletion is permanent, so always confirm first.
license: UNLICENSED
homepage: https://sleevy.app
---

# Organize a Sleevy queue

Sleevy is one person's read-later queue. This skill covers tidying it: folders,
moving items, and removing things.

## When to use this

The user wants to group saved links, move something into a folder, clear out
items they are done with, or manage the folders themselves.

## Connect

Streamable HTTP MCP endpoint: `https://api.sleevy.app/mcp`. Listing folders needs
`folders:read`; creating and updating needs `folders:write`; removing needs
`folders:delete`. Moving a saved item between folders needs
`saved-items:write`.

## Folders

- `list_folders` — every folder, with its name, emoji, and colour.
- `add_folder` — create one. The name must be unique within the account; a
  duplicate is rejected with `409`.
- `set_saved_item_folder` — move a saved item into a folder, or pass a null
  folder to take it out of the one it is in. A saved item belongs to at most
  **one** folder.

A folder can also be *published* to the person's public profile. Do not publish
or unpublish one unless they asked for it; it changes what strangers can see.

## Removing things

**Confirm with the person before every removal.** Both of these are permanent
and there is no undo.

- `remove_folder` — deletes the folder and **keeps** the saved items that were
  in it. They become unfiled.
- `delete_saved_item` — deletes the saved item itself.

The distinction matters and users routinely get it wrong. If someone says
"delete that folder and everything in it", say plainly that removing the folder
keeps the items, and ask whether they want the items deleted too.

A bulk cleanup is still worth confirming. "Delete everything I have read" should
be read back as a count and a sample before you act on it.

## Tidying in bulk

Page `list_saved_items` with `limit` and `nextCursor`, decide per item, then act.
Over REST, send an `Idempotency-Key` on each write so a retry after a timeout
cannot act twice.

## Errors

Failures are JSON with `code`, `message`, and `resolution`. A `404` means the ID
does not belong to this account — re-list to get current IDs. A `409` on folder
creation means the name is taken; read the existing folder instead of retrying.
