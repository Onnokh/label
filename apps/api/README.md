# Sleevy API

Backend API workspace for Sleevy's v1 REST API.

The API serves the Web Companion, native clients, browser extension, Raycast plugin, and personal automation clients.

## Local Development

```sh
bun install
bun --filter @sleevy/api dev
```

The generated OpenAPI document is served at:

```text
GET /openapi.json
```

A lightweight health check is available without authentication:

```text
GET /health
GET /v1/health
```

## Authentication

External systems authenticate with a personal API Key:

```http
Authorization: Bearer <api-key>
```

API Keys belong to one Account, can access the v1 REST API for that Account, and are subject to the v1 API Key Rate Limit.

## Core Endpoints

```http
POST /v1/captures
GET /v1/saved-items
GET /v1/folders
POST /v1/folders
PATCH /v1/folders/{id}
DELETE /v1/folders/{id}
POST /v1/saved-items/{id}/open
POST /v1/saved-items/{id}/read
POST /v1/saved-items/{id}/unread
POST /v1/saved-items/{id}/read-state
PUT /v1/saved-items/{id}/folder
DELETE /v1/saved-items/{id}
```

Example capture request:

```sh
curl -X POST "$SLEEVY_API_URL/v1/captures" \
  -H "Authorization: Bearer $SLEEVY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","captureChannel":"api","tags":["backend"]}'
```

Capture `tags` are optional. When provided, they are stored on the Saved Item for the authenticated Account and must use the v1 Tag vocabulary: `ai`, `tools`, `typescript`, `security`, `design`, `backend`, or `front-end`.

Capture `folderId` is optional on the wire for older clients. When supplied with a Folder id, capture files the Saved Item there. When `folderId` is `null` or omitted, capture files the Saved Item in the Library root, including a duplicate capture.

`PATCH /v1/folders/{id}` accepts `name`, `emoji`, `color`, and `isPublished`, all optional. An omitted field keeps its stored value, so a name-only request works exactly as before. A Folder with `isPublished` true is a Published Folder, and a Public Profile shows every Saved Item inside it. Publishing and unpublishing take effect at once.

Folder Views use Saved Item listing with a folder selector:

```http
GET /v1/saved-items?folder=none
GET /v1/saved-items?folder={folder-id}
```

Saved Item responses always return `folder` as either `{ "id": "...", "name": "..." }` or `null`.

## Public Profile Settings

These routes read and change one Account's **Handle** and **Profile Visibility**. They need an App Session and are not reachable with an API Key: the v1 REST API does not expose account administration to API Keys.

```http
GET /v1/profile
GET /v1/profile/handle-availability?handle={handle}
POST /v1/profile/handle
PATCH /v1/profile/handle
PUT /v1/profile/visibility
```

A Handle is 3 to 30 characters of `a-z`, `0-9`, `-`, and `_`, is stored lowercase, is unique across Accounts after lowercasing, and may not use a reserved path name. `POST` claims one, `PATCH` renames it and releases the old spelling at once. `PUT /v1/profile/visibility` takes `{"visibility": "public"|"private"}`; turning it private keeps the Handle reserved to that Account.

## Public Profile Endpoints

These routes need no credentials at all. They serve one Account's published content once its Profile Visibility is public.

```http
GET /v1/public/profiles/{handle}
GET /v1/public/profiles/{handle}/saved-items?page={n}
GET /v1/public/profiles/{handle}/activity
GET /v1/public/indexable-profiles?page={n}
```

A Handle nobody holds and a Handle whose Profile Visibility is private answer identically, so these routes never disclose which Handles exist.

The profile response carries the Handle, the join date, the published Saved Item count, and `isIndexable`, which the API computes: true only when the Account is at least 7 days old and publishes at least 5 Saved Items. Callers render a robots directive from that value rather than deciding it themselves.

`saved-items` returns 50 items to a numbered page, newest first by Saved Item creation time, so a Duplicate Save never reorders a page. Each item carries only the original URL, host, title, favicon variants, image, Type, Tags, Preview Summary, and save date. The Folder, the Source name, the Capture Channel, the Read State, the Saved Item id, and the update timestamps are withheld.

A Saved Item appears only when Profile Visibility is public and the Saved Item is in a Published Folder. A Saved Item in no Folder is never public. Everything else adds nothing to the count.

`activity` returns per-day save counts over a rolling 52 weeks, bucketed by Saved Item creation time in UTC. Counts are first captures only, and they include every Saved Item, published or not — so the activity grid can show a save the item list does not list.

Successful public responses carry `Cache-Control: public, max-age=300`. A not-found response is not cached.

## Rate Limits

Requests over the API Key Rate Limit receive `429 Too Many Requests` with `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers.

The Public Profile routes carry no API Key, so the API Key Rate Limit cannot apply. They take the Public Profile Rate Limit instead: 60 requests per minute per client address across the whole `/v1/public/` prefix, with the same `429` shape and headers. The address comes from `CF-Connecting-IP`, the only trustworthy client address behind the production proxy.

## Error Responses

Errors use a small tagged JSON shape:

```json
{
  "_tag": "Unauthorized",
  "message": "Missing or invalid credentials."
}
```

Every public error includes `_tag` and `message`. Some errors include extra fields with useful context, such as the rejected `url` or missing `savedItemId`.

Current v1 errors:

| Status | `_tag` | Meaning |
| --- | --- | --- |
| 400 | `InvalidUrlError` | The capture payload did not contain a valid URL. |
| 400 | `InvalidFolderNameError` | A Folder name was blank or longer than 80 characters. |
| 400 | `InvalidHandleError` | A Handle broke the length, character, or reserved-name rules. |
| 401 | `Unauthorized` | The request is missing valid session or API Key credentials. |
| 404 | `SavedItemNotFoundError` | The Saved Item does not exist for the authenticated Account. |
| 404 | `FolderNotFoundError` | The Folder does not exist for the authenticated Account. |
| 404 | `ProfileNotFoundError` | The authenticated Account has not claimed a Handle yet. |
| 404 | `PublicProfileNotFoundError` | No Public Profile answers for that Handle. Also returned when the Handle exists but its Profile Visibility is private. |
| 409 | `FolderNameConflictError` | A Folder with the normalized name already exists. |
| 409 | `HandleConflictError` | The Handle is already claimed, or this Account already holds one. |
| 429 | `RateLimitExceeded` | The API Key or the client address exceeded its request budget. |
