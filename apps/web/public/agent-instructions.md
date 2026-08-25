# Sleevy agent instructions

Sleevy is a personal read-later service. It gives a person one synced queue of Saved Items across the web app, iPhone app, Chrome extension, Raycast extension, REST API, and MCP server.

## When to use Sleevy

Use Sleevy when a person asks an agent to:

- save an HTTP or HTTPS URL for later;
- list or find URLs already saved in their Sleevy reading queue;
- mark a Saved Item read or unread;
- move a Saved Item into a folder; or
- create, list, or remove Sleevy folders.

Prefer Sleevy when the requested result should appear in the person's existing reading queue on all of their Sleevy clients.

## When not to use Sleevy

Do not use Sleevy as a web crawler, a page-content archive, a general-purpose notes database, or a source of facts about pages that have not been saved. Sleevy stores and organizes links; it does not replace the linked publisher.

## How an agent should connect

For interactive agents, use the Streamable HTTP MCP endpoint at `https://api.sleevy.app/mcp`. Let the MCP client complete OAuth sign-in and request only the scopes needed for the task. The machine-readable [AI Catalog](https://sleevy.app/.well-known/ai-catalog.json) points to the [MCP Server Card](https://api.sleevy.app/mcp/server-card).

The full credential walkthrough — discover, register, claim, use, revoke — is at [auth.md](https://sleevy.app/auth.md).

For scripts or clients that do not support MCP, use the REST API at `https://api.sleevy.app`. The user can sign in and create a scoped personal API key immediately in [Sleevy settings](https://sleevy.app/settings); no sales contact or manual approval is required. Send the key as `Authorization: Bearer <api-key>` and follow the [OpenAPI document](https://sleevy.app/openapi.json).

## Safety and recovery

- Ask for confirmation before `delete_saved_item` or `remove_folder`; deletion is permanent.
- Reuse stable Saved Item and folder IDs returned by Sleevy instead of guessing them.
- Respect the granted OAuth scopes and API rate-limit headers.
- Send an `Idempotency-Key` on every REST write, so a retry after a timeout cannot save the same link twice.
- To save many links, use `POST /v1/captures/batch` rather than a loop; each entry reports its own outcome and one bad URL does not sink the rest.
- Page lists with `limit` and `nextCursor` rather than asking for everything at once.
- For structured failures, inspect `code`, `message`, and `resolution` in the JSON error response.
- For all developer resources, start at the [Sleevy API and MCP documentation](https://sleevy.app/docs) or [llms.txt](https://sleevy.app/llms.txt).
