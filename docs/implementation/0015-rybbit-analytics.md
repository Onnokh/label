# Rybbit Server-Side Analytics Implementation Guide

This document turns [ADR 0015](../adr/0015-rybbit-server-side-product-analytics.md) into an implementation plan. All instrumentation lives in `apps/api`; there is no client-side tracking. The Web Companion's existing Umami script is removed and not replaced.

## Principles

- **Single instrumentation point.** Every tracked action already funnels through the REST API, so the API is the only place events are emitted. One integration covers iOS, the iOS Share Extension, the Chrome Extension, Raycast, the Web Companion, and raw API clients.
- **Never affect the request.** Events are forked and error-swallowed. A slow or failing Rybbit must not change any response, latency, or error.
- **Off by default.** When Rybbit is disabled or unconfigured, the Analytics service is a no-op. Local development and tests send nothing.
- **Pseudonymous only.** `user_id` is the opaque better-auth user id. No email, no original/normalized URLs. Host is omitted in v1. Properties are low-cardinality strings/numbers.

## Event Catalog

All events are `type: "custom_event"`. `user_id` is the authenticated Account's better-auth id.

| `event_name` | Trigger | `user_id` source | Properties |
| --- | --- | --- | --- |
| `login` | better-auth `session.create.after` hook in `BetterAuth.ts` | `session.userId` | `method` (`google` \| `apple`) |
| `logout` | better-auth `session.delete.after` hook in `BetterAuth.ts` | `session.userId` | — |
| `account_created` | new better-auth `user.create.after` hook in `BetterAuth.ts` | `user.id` | — (provider account is not linked yet at user-create time, so `method` is unavailable here) |
| `capture` | `capture` handler in `CapturesHandlers.ts` | `CurrentUser` | `channel`, `result` (`created`\|`updated`), `type`, `has_folder`, `tag_count` |
| `item_opened` | `markOpened` handler in `SavedItemsHandlers.ts` | `CurrentUser` | — |
| `item_deleted` | `remove` handler in `SavedItemsHandlers.ts` | `CurrentUser` | — |
| `item_moved` | `setFolder` handler in `SavedItemsHandlers.ts` | `CurrentUser` | `destination` (`folder`\|`none`) |
| `item_privacy_changed` | `setPrivate` handler in `SavedItemsHandlers.ts` | `CurrentUser` | `is_private` (boolean) |
| `folder_created` | `create` handler in `FoldersHandlers.ts` | `CurrentUser` | — |
| `folder_renamed` | `update` handler in `FoldersHandlers.ts`, only when the request carries a name | `CurrentUser` | — |
| `folder_privacy_changed` | `update` handler in `FoldersHandlers.ts`, only when the request carries the private flag | `CurrentUser` | `is_private` (boolean) |
| `folder_deleted` | `remove` handler in `FoldersHandlers.ts` | `CurrentUser` | — |
| `client_connected` | `exchange` handler in `ConnectHandlers.ts` (API key minted) | `record.userId` | `client`, `scopes_count` |

### Property sources for `capture`

At the capture call site the result already carries everything needed:

| Property | Value | Source |
| --- | --- | --- |
| `channel` | Capture Channel | `payload.captureChannel` (`ios-app`, `ios-share-extension`, `chrome-extension`, `raycast`, `web-companion`, `api`) |
| `result` | `created` \| `updated` | `result.captureResult` |
| `type` | content Type | `result.savedItem.enrichment.type` (`website`/`article`/`video`/`repository`) |
| `has_folder` | boolean | `result.savedItem.savedItem.folderId != null` |
| `tag_count` | number | `result.savedItem.savedItem.tags.length` |

### Deferred (not in v1)

- `enrichment_completed` / `enrichment_failed` — operational health, not usage. Revisit if AI reliability needs watching.
- `markRead` / `markUnread` toggles — low-signal noise.
- `host`/domain on `capture` and `item_opened` — reveals browsing; off to keep events pseudonymous. Reintroduce only as a deliberate decision.

## Rybbit API Shape

```
POST {RYBBIT_API_URL}/api/track
Authorization: Bearer {RYBBIT_API_KEY}
Content-Type: application/json

{
  "site_id": "{RYBBIT_SITE_ID}",
  "type": "custom_event",
  "event_name": "capture",
  "user_id": "<better-auth user id>",
  "properties": "{\"channel\":\"ios-share-extension\",\"result\":\"created\",\"type\":\"article\",\"has_folder\":false,\"tag_count\":2}"
}
```

- `properties` must be a **JSON-encoded string**, not a nested object.
- Values are strings/numbers (booleans serialize fine; coerce to `0`/`1` if Rybbit reports type issues).
- `event_name` ≤ 255 chars; `properties` ≤ 2 KB.
- An API key is required for server traffic — it bypasses bot detection and domain validation that would otherwise drop server-originated events.

## Configuration

Add a `rybbit` section to `AppConfig` in `apps/api/src/runtime/Config.ts`, following the existing `Config.string(...).pipe(Config.withDefault(...))` style:

| Env var | Type | Default | Notes |
| --- | --- | --- | --- |
| `RYBBIT_ENABLED` | boolean | `false` | Master switch. Off in dev/test/local. |
| `RYBBIT_API_URL` | string | `""` | e.g. `https://rybbit.missingmounts.com`. Non-secret. |
| `RYBBIT_SITE_ID` | string | `""` | e.g. `c8631725ed4a`. Non-secret. |
| `RYBBIT_API_KEY` | string | `""` | **Secret.** Coolify env + gitignored local `.env` only. |

`.env.example` (tracked) gets `RYBBIT_ENABLED`, `RYBBIT_API_URL`, `RYBBIT_SITE_ID`, and an **empty** `RYBBIT_API_KEY=`. The real key is set in Coolify and in a local `.env`; it must never be committed.

The Analytics service treats the integration as disabled when `RYBBIT_ENABLED` is false or `RYBBIT_API_URL` / `RYBBIT_SITE_ID` / `RYBBIT_API_KEY` are empty.

## Module Design

### `apps/api/src/modules/analytics/RybbitClient.ts` (new)

A plain `async` function over `fetch`, mirroring the `Effect.tryPromise(() => fetch(...))` convention used in `AiEnricher.ts`. Plain async so the better-auth hooks (which are not Effects) can call it directly.

- Signature: `trackEvent(config, { name, userId, properties? }): Promise<void>`.
- Builds the payload above, `JSON.stringify`s `properties`, POSTs with the Bearer key.
- Applies a 2–3s timeout (`AbortSignal.timeout`).
- **Catches and swallows its own errors** (logs at debug) so no caller — Effect or hook — can throw because of analytics.
- Returns immediately as a no-op when the config is disabled/incomplete.

### `apps/api/src/modules/analytics/Analytics.ts` (new)

An Effect `Context.Service` exposing `track(event)`:

- Reads `AppConfig`.
- When enabled: `track` wraps `RybbitClient.trackEvent` in `Effect.tryPromise` (errors already swallowed inside the client; `Effect.ignore` is belt-and-suspenders).
- When disabled: `track` is `Effect.void`.
- Register `Analytics.layer` in `apps/api/src/runtime/AppLayer.ts` alongside the other services, provided with `AppConfig`.

### Emission pattern (handlers)

Identical to the existing fire-and-forget enrichment fork in `CapturesHandlers.ts`:

```ts
const analytics = yield* Analytics
yield* analytics
  .track({ name: "capture", userId, properties: { channel, result, type, has_folder, tag_count } })
  .pipe(Effect.ignore, Effect.forkDetach)
```

### Auth events (better-auth hooks)

`BetterAuth.ts` already has `session.create.after` and `session.delete.after` hooks that look up the user and `console.log` login/logout. `config.rybbit` is already in scope inside `BetterAuth.make`.

- Replace the `console.log` calls with `await trackEvent(config.rybbit, { name: "login" | "logout", userId: session.userId, properties })`.
- Add a `user.create.after` hook for `account_created`.
- Login `method` comes from the `lastLoginMethod()` plugin already enabled.
- `trackEvent` swallows errors, so hooks remain safe.

## Files

| File | Change |
| --- | --- |
| `apps/api/src/modules/analytics/RybbitClient.ts` | **New.** Plain async `fetch` client, self-contained error handling + timeout. |
| `apps/api/src/modules/analytics/Analytics.ts` | **New.** Effect service; no-op when disabled; registered in AppLayer. |
| `apps/api/src/runtime/Config.ts` | Add `rybbit` config section. |
| `apps/api/src/runtime/AppLayer.ts` | Provide `Analytics.layer`. |
| `apps/api/src/api/CapturesHandlers.ts` | Emit `capture`. |
| `apps/api/src/api/SavedItemsHandlers.ts` | Emit `item_opened`, `item_deleted`, `item_moved`. |
| `apps/api/src/api/FoldersHandlers.ts` | Emit `folder_created`, `folder_renamed`, `folder_deleted`. |
| `apps/api/src/api/ConnectHandlers.ts` | Emit `client_connected`. |
| `apps/api/src/modules/auth/BetterAuth.ts` | Emit `login`, `logout`, `account_created` from hooks. |
| `.env.example` | Add `RYBBIT_ENABLED`, `RYBBIT_API_URL`, `RYBBIT_SITE_ID`, empty `RYBBIT_API_KEY`. |
| `docker-compose.yml` | Pass the four `RYBBIT_*` env vars into the `api` service. |
| `apps/web/src/routes/__root.tsx` | **Remove** the Umami `<script>` entry. |

## Implementation Flow

1. Add the `rybbit` config section and `.env.example` / compose env entries.
2. Implement `RybbitClient` (plain async, timeout, error-swallowing).
3. Implement the `Analytics` Effect service + no-op layer; register in `AppLayer`.
4. Emit events from the four handler files using `Effect.ignore` + `Effect.forkDetach`.
5. Wire the better-auth hooks for `login`, `logout`, `account_created`.
6. Remove the Umami script from the Web Companion.
7. Set `RYBBIT_*` (including the secret key) in Coolify and a local `.env`.

## Verification

- **Disabled (default):** with `RYBBIT_ENABLED=false`, no network calls occur; all flows behave exactly as today.
- **Enabled locally:** with the four vars set, performing each action produces the corresponding event in the Rybbit dashboard with the expected properties and `user_id`.
- **Non-blocking:** with Rybbit unreachable (wrong URL), every request still succeeds with unchanged latency and no surfaced error.
- **No PII:** inspect outgoing payloads — only the pseudonymous id and low-cardinality properties; no email, URLs, or host.
- **Auth path:** login, logout, and first sign-in emit `login` / `logout` / `account_created` with the correct `method`.

## Completion Checklist

- [ ] `rybbit` config section reads the four env vars with safe defaults.
- [ ] `RYBBIT_API_KEY` appears only as an empty placeholder in `.env.example`; the real key is never committed.
- [ ] `RybbitClient` swallows its own errors and applies a timeout.
- [ ] `Analytics` service is a no-op when disabled/unconfigured and registered in `AppLayer`.
- [ ] All eleven v1 events emit from their specified triggers via fork + ignore.
- [ ] Auth hooks emit `login`, `logout`, and `account_created`.
- [ ] Umami script removed from the Web Companion.
- [ ] Requests are unaffected when Rybbit is slow, down, or disabled.
