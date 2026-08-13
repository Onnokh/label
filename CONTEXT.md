# Sleevy

Sleevy is the product name for a read-later app that saves web content from multiple entry points and returns to it with lightweight AI assistance.

## Language

**Saved Item**:
A user's saved relationship to a URL they may want to read, watch, or revisit later.
_Avoid_: Bookmark, pin, tab, article

**Link**:
A normalized web URL shared across Accounts for metadata and enrichment.
_Avoid_: Saved Item, user bookmark, per-account URL copy

**Link Metadata**:
Fetched descriptive data for a Link, such as title, image, favicon, canonical URL, and site name.
_Avoid_: AI enrichment, Saved Item metadata

**Link Enrichment**:
Generated or derived classification data for a Link, such as Type, Tag, Preview Summary, and Enrichment Status.
_Avoid_: Saved Item override, raw fetched metadata

**Read-Later App**:
A product centered on returning to captured content, with categorization and summarization as support features.
_Avoid_: Knowledge library, personal knowledge management system

**V1 Read-Later MVP**:
The first usable milestone that proves capture, enrichment, queue, library filters, and cross-client access.
_Avoid_: Production launch, public beta

**Sleevy**:
The product name for the V1 Read-Later MVP.

**Backend Core**:
The backend API project adapted from the existing bookmarks-core project.
_Avoid_: Separate core package, web app API routes as domain logic, throwaway prototype backend

**App Workspace**:
A runnable monorepo app under `apps/`, such as `apps/api`, `apps/web`, `apps/ios`, or `apps/chrome-extension`.
_Avoid_: Package for deployable app, nested repo

**API Contract**:
The versioned HTTP schema that keeps iOS, web, and API request and response shapes aligned.
_Avoid_: Informal JSON, client-specific DTOs

**Hand-Written DTOs**:
Client transport models written as native Codable structs aligned with the API Contract.
_Avoid_: Hand-copied JSON models, generated full client

**REST API**:
The resource-style HTTP API exposed by the backend for iOS, web, share extension, and automation clients.
_Avoid_: RPC API, client-specific endpoints

**API Reference**:
A public documentation surface that renders the generated OpenAPI description of the REST API for external API users.
_Avoid_: Internal docs, account docs, marketing copy

**Effect HttpApi**:
The Effect-native HTTP route and schema layer used by the API project.
_Avoid_: Express, Fastify, Hono

**Capture Endpoint**:
The REST API endpoint that accepts a URL and creates or updates a Saved Item.
_Avoid_: Create bookmark endpoint, import endpoint

**Capture Result**:
The response outcome from the Capture Endpoint, indicating whether a Saved Item was created or updated.
_Avoid_: Duplicate flag, import status

**Open Action**:
The REST API action that records a Saved Item as opened and therefore read.
_Avoid_: Manual read toggle, generic patch

**Native iOS App**:
The primary iPhone app for viewing the Reading Queue, browsing the Library, and supporting native capture.
_Avoid_: Mobile website, wrapper app

**SwiftUI App**:
The native iOS implementation approach for the app's main screens.
_Avoid_: Web view app, cross-platform wrapper

**Native Motion**:
Native iOS animation and visual polish, including room for Metal shader effects where appropriate.
_Avoid_: Web-style animation, required core workflow

**Enrichment Loading Motion**:
Tasteful native animation, potentially using Metal shaders, that indicates enrichment or loading without distracting from the list.
_Avoid_: Decorative spectacle, blocking progress

**Source**:
A named device or environment from which a user captures URLs, used as a recall cue for finding items later. Each Source belongs to one Account and is identified by its name within that Account. Clients detect the device name automatically; users may override it in settings.
_Avoid_: Capture Channel, integration, client type

**Capture Channel**:
A way a user sends a URL into the app. Stored as a closed enum on each Saved Item: `chrome-extension`, `ios-app`, `ios-share-extension`, `raycast`, `web-companion`, `api`, `public-profile`.
_Avoid_: Integration, source, device

**Chrome Extension**:
A browser Capture Channel that saves the active tab URL with one click using an API Key.
_Avoid_: Browser plugin, Chrome plugin

**iOS Share Extension**:
The native iPhone Capture Channel exposed from the system share sheet.
_Avoid_: Shortcut workaround, mobile web form

**Manual URL Capture**:
A small UI Capture Channel where the user pastes a URL to save it.
_Avoid_: Bookmark form, editor

**Clipboard Capture**:
A one-button native iOS capture flow that previews a URL from the clipboard before saving, or opens empty Manual URL Capture when the clipboard does not contain a URL.
_Avoid_: Paste workflow, import screen, ingest form

**Clipboard URL Preview**:
A lightweight on-device preview shown before saving a clipboard URL.
_Avoid_: Enrichment preview, server preview, metadata fetch

**Capture Capsule**:
An inline native iOS capture surface that appears at the top of the Reading Queue without moving the app chrome.
_Avoid_: Bottom sheet, modal form, full-screen composer

**Pending Capture**:
A native iOS capture that is saved locally when the API is unavailable and synced later.
_Avoid_: Failed capture, offline-only item, draft

**Web Companion**:
The keyboard-driven desktop client for viewing, navigating, and managing Saved Items, with Manual URL Capture and API Key Settings.
_Avoid_: API-hosted UI, passive feed, primary mobile client

**Command Palette**:
A transient modal launcher opened with Cmd+K that combines Saved Item search, page navigation, action commands, and URL capture in a flat grouped list.
_Avoid_: Search bar, settings menu, permanent panel

**Cached Viewing**:
Basic client-side retention of recently loaded Saved Metadata for viewing when connectivity is poor.
_Avoid_: Offline capture, sync queue

**One-Tap Capture**:
A capture experience that saves a URL without requiring categorization, notes, or other decisions first.
_Avoid_: Manual filing, import workflow

**Account**:
The authenticated owner of a private collection of Saved Items.
_Avoid_: Workspace, team, profile, multi-user tenant

**App Session**:
The authenticated session used by the human-facing app after Google login.
_Avoid_: API token, magic link, Sign in with Apple

**Prototype Auth**:
A temporary pre-production authentication approach used before paid Apple Developer Program setup is justified.
_Avoid_: Production auth, public login

**API Key**:
A personal credential used by external systems and non-interactive clients to access an Account through the REST API.
_Avoid_: Capture Token, personal access token, session, password

**API Key Scope**:
A granted capability that limits which REST API actions an API Key may perform for its Account.
_Avoid_: App Session permission, account role, unrestricted access

**API Key Rate Limit**:
A single per-key request budget of 20 requests per minute applied uniformly across the v1 REST API.
_Avoid_: Endpoint-specific quota, enrichment quota, global app limit, App Session limit

**Rate Limit Response**:
The 429 response returned when an API Key exceeds its API Key Rate Limit.
_Avoid_: Unauthorized, validation error, silent retry

**API Key Settings**:
A small Web Companion settings surface for creating, copying, and revoking API Keys.
_Avoid_: Admin panel, developer portal

**Read-List Access**:
Permission for an automation client to retrieve Saved Items from an Account.
_Avoid_: Capture, public feed

**Enrichment**:
Post-capture processing that adds metadata such as title, content type, tag, or summary to a Link.
_Avoid_: Saving, ingest

**Hard Metadata**:
Deterministic metadata collected without AI, such as title, host, image URL, favicon, canonical URL, and Type.
_Avoid_: AI enrichment, manual categorization

**AI Enrichment**:
Server-side Enrichment that uses an AI provider to generate a Preview Summary and Tag.
_Avoid_: On-device AI, manual categorization

**Enrichment Job**:
An asynchronous backend task that performs Enrichment for a Link after capture.
_Avoid_: Save request, synchronous enrichment

**Enrichment Status**:
A coarse client-visible state: pending, enriched, or failed.
_Avoid_: Stage details, debug log

**Basic Link**:
A Link with only its Original URL and minimal capture metadata.
_Avoid_: Failed item, broken item

**Hydration**:
The client-side update where a newly saved item gains enriched metadata after initially appearing with minimal data, typically after refresh.
_Avoid_: Refresh, reload

**Type**:
A content kind assigned from hard rules, such as Video, Website, Article, or Repository, where Website is the fallback.
_Avoid_: Category, user tag, folder

**Type Icon**:
A small visual indicator for a Saved Item's Type.
_Avoid_: Type chip, row badge text

**Tag**:
A subject area from the closed v1 vocabulary: AI, Tools, TypeScript, Security, Design, Backend, or Front-end.
_Avoid_: Category, folder, arbitrary label

**Saved Item Tags**:
Hard user-owned Tags stored on the Saved Item relationship between an Account and a Link.
_Avoid_: AI tags, Link tags, folder

**Enrichment Tags**:
AI-generated Tags stored on Link Enrichment as shared derived metadata.
_Avoid_: Saved Item Tags, manual tags, folder

**Effective Tags**:
The Tags exposed to clients for filtering, using Saved Item Tags when present and otherwise Enrichment Tags.
_Avoid_: Raw tags, combined tags, tag source

**No Tag Filter**:
A Library filter that shows Saved Items without any Tags.
_Avoid_: None tag, generated tag value

**Folder**:
A user-created flat container with an Account-unique normalized name for intentionally organizing Saved Items, where each Saved Item may be in at most one Folder, independently of subject-based Tags.
_Avoid_: Tag, category, AI classification

**Folder Read Access**:
The `folders:read` API Key Scope that permits a client to list existing Folder identifiers and names for capture-time assignment without creating or changing them.
_Avoid_: Folder management, folder write access, account administration

**Folder Write Access**:
The `folders:write` API Key Scope that permits a client to create or rename Folders when explicitly granted.
_Avoid_: Implicit capture permission, account administration, unrestricted default client access

**Folder Delete Access**:
The `folders:delete` API Key Scope that permits a client to delete Folders when explicitly granted.
_Avoid_: Delete Saved Items, implicit write access, unrestricted default client access

**Folder Endpoint**:
A REST API operation used by product apps and authorized API clients for Folder listing or management.
_Avoid_: Client-specific folder storage, UI-only state, unrestricted API folder management

**Folder Assignment Endpoint**:
The idempotent REST API operation `PUT /v1/saved-items/{id}/folder` that replaces one Saved Item's Folder membership with a Folder identifier or No Folder.
_Avoid_: Bulk move endpoint, capture endpoint, tag update

**Folder Not Found**:
The HTTP 404 API response returned when an operation references a Folder that does not exist in the authenticated Account.
_Avoid_: Cross-account disclosure, silent No Folder fallback, implicit folder creation

**Folder Name Conflict**:
The HTTP 409 API response returned when a Folder create or rename attempts to use an existing normalized Folder name in the same Account.
_Avoid_: Validation error, implicit merge, duplicate Folder

**Invalid Folder Name**:
The HTTP 400 API response returned when a Folder create or rename supplies a blank or over-80-character name.
_Avoid_: Name conflict, database error, client-only validation

**No Folder Filter**:
A retrieval state for Saved Items that do not belong to a Folder, used by the API and as the Library home content rather than requiring a user-facing label.
_Avoid_: Unfoldered, Inbox, default folder

**Delete Folder Action**:
A destructive organization action that deletes a Folder while leaving its Saved Items in the Library without a Folder.
_Avoid_: Delete Saved Items, delete contents, cascade delete

**Move to Folder Action**:
A Saved Item write action that assigns one Saved Item to a Folder or to No Folder.
_Avoid_: Bulk filing, tag editing, capture-time filing

**Folder View**:
A Library navigation destination showing both read and unread Saved Items assigned to one Folder, within which normal Library filters may be applied.
_Avoid_: Folder filter chip, Inbox, separate library

**Web Folder Route**:
A path-based Web Companion destination for a Folder View, using `/library/folders/{id}`, while `/library` remains the unfiled Library home.
_Avoid_: Folder query-only navigation, named No Folder route, Inbox route

**Folder Selector**:
The Saved Item list query parameter `folder`, whose value is a Folder identifier or `none` for the No Folder destination.
_Avoid_: Client-only folder filtering, empty folder identifier, Inbox selector

**Folder Summary**:
An embedded Folder identifier and name returned in a Saved Item response when that item belongs to a Folder.
_Avoid_: Folder contents, folder statistics, folder name without identity

**Reading Queue**:
The primary list of all Saved Items, ordered with the most recently saved item first.
_Avoid_: Library, dashboard, feed

**Inbox**:
The triage surface for recently saved unread Saved Items.
_Avoid_: Reading Queue, Library, feed

**Library**:
A complete browsing surface for Saved Items, with an unfiled root, Folder Views, and filters such as Type or Tag.
_Avoid_: Reading Queue, knowledge base

**Retrieval Surface**:
A browsing surface for finding previously saved content by filters, sorting, and search.
_Avoid_: Inbox, triage surface

**V1 Library**:
A lightweight Library browsing surface that reuses Saved Item list UI across the unfiled root and Folder Views with Type and Tag filters.
_Avoid_: Knowledge base, advanced search

**Queue Tab**:
The native iOS tab that shows the Reading Queue.
_Avoid_: Home, feed

**Home Tab**:
The native iOS tab label for the Inbox.
_Avoid_: Queue Tab, Library Tab

**All Caught Up**:
The empty Inbox state shown when there are no unread Saved Items.
_Avoid_: Empty library, no saved items

**Unread-Only Inbox**:
An Inbox behavior where read Saved Items leave the Home Tab and remain available in the Library.
_Avoid_: Recent-items dashboard, all-items home

**Unread Backlog**:
The complete set of unread Saved Items awaiting user attention.
_Avoid_: Latest unread items, unread preview

**Library Tab**:
The native iOS tab that shows the V1 Library filters and list.
_Avoid_: Search tab, knowledge base

**Search Tab**:
The native iOS search-role tab for text retrieval across Saved Items.
_Avoid_: Library Tab, filter drawer

**Read State**:
Whether a Saved Item has been read or watched by the user.
_Avoid_: Status, completion

**Unread Dot**:
A small dot that indicates a Saved Item has not been opened yet.
_Avoid_: Badge, bold unread row

**Delete Action**:
A simple destructive action that removes a Saved Item from the Account.
_Avoid_: Archive, trash, hide

**Original URL**:
The URL captured for a Saved Item and opened when the user wants to consume it.
_Avoid_: Reader link, canonical link

**Normalized URL**:
The comparable form of an Original URL used to detect duplicate saves.
_Avoid_: Raw URL, display URL

**Duplicate Save**:
A capture of a URL whose Normalized URL already belongs to an existing Saved Item.
_Avoid_: Duplicate item, copy

**Renewed Intent**:
A Duplicate Save of a read Saved Item that returns it to the unread Inbox.
_Avoid_: Duplicate copy, ignored recapture

**Saved Metadata**:
The retained descriptive data for a Link, such as title, image, summary, type, tag, and URL.
_Avoid_: Archived content, page copy

**Saved Item Override**:
A user-specific replacement for shared Link metadata in a Saved Item.
_Avoid_: Shared metadata edit, generated tag

**Domain Subtitle**:
A small host/domain label shown under a Saved Item title.
_Avoid_: Full URL, breadcrumb

**External Image URL**:
An image URL discovered during enrichment and loaded directly by clients.
_Avoid_: Proxied image, cached asset

**Last Saved At**:
The timestamp of the most recent capture or Duplicate Save for a Saved Item.
_Avoid_: Updated at, created at

**Preview Summary**:
A short generated sentence that helps the user decide whether to open a Saved Item.
_Avoid_: Full summary, article replacement, abstract

**Stable Row Height**:
A consistent Saved Item row height that keeps scrolling smooth whether enrichment fields are present or missing.
_Avoid_: Variable-height feed

**Public Profile**:
An opt-in public page that shows one Account's Handle, Reading Activity, and public Saved Items.
_Avoid_: Account, social profile, published collection, user page

**Handle**:
The Account-chosen unique public identifier used in a Public Profile URL, claimed when Profile Visibility is first turned on.
_Avoid_: Slug, username, sign-in name, display name

**Profile Visibility**:
The Account setting that turns a Public Profile on or off.
_Avoid_: Per-item share, public folder flag, account privacy settings

**Private Saved Item**:
A Saved Item its Account marked to withhold from the Public Profile.
_Avoid_: Deleted item, archived item, unread item, draft

**Private Folder**:
A Folder its Account marked so that every Saved Item inside it is withheld from the Public Profile.
_Avoid_: Public folder flag, published collection, hidden navigation destination

**Reading Activity**:
Per-day counts of first captures for an Account, shown on a Public Profile as a rolling 52-week grid.
_Avoid_: Read history, reading time, streak, contribution graph

**Public Profile Endpoint**:
An unauthenticated REST API operation under `/v1/public/` that serves one part of a Public Profile to an anonymous visitor.
_Avoid_: Session endpoint, API Key endpoint, account administration

**Public Profile Rate Limit**:
A single per-address request budget of 60 requests per minute applied across every Public Profile Endpoint.
_Avoid_: API Key Rate Limit, per-endpoint quota, per-Account budget

**Search Indexability**:
The server-computed boolean that tells a client whether a Public Profile may be offered to search engines.
_Avoid_: Client-side robots rule, per-page meta decision, sitemap flag

## Relationships

- A **Read-Later App** contains many **Saved Items**.
- A **Link** may be referenced by many **Saved Items** across Accounts.
- A **Saved Item** belongs to one **Account** and references one **Link**.
- A **Saved Item** optionally references one **Source**.
- A **Source** belongs to one **Account** and is unique by name within that Account.
- An **Account** may have many **Sources**.
- A **Source** is lazily registered by the API when a capture includes a `sourceName` not yet known for the Account.
- A **Link** has shared **Link Metadata** and **Link Enrichment**.
- The **V1 Read-Later MVP** includes native iOS, backend API, web companion, and shared API contract projects.
- The monorepo uses five **App Workspaces**: `apps/api`, `apps/web`, `apps/ios`, `apps/chrome-extension`, and `apps/raycast-plugin`.
- The backend API should be the **Backend Core**, adapted from bookmarks-core, rather than a separate core package plus API wrapper.
- The API uses Postgres through Drizzle for v1 deployment on a single VPS.
- The **API Contract** is generated from Effect route and schema definitions.
- The **REST API** is the client-facing shape of the **API Contract**.
- Product apps and authorized API clients use shared **Folder Endpoints**, with permitted operations determined by authentication and granted **API Key Scopes**.
- Folder records are managed through `GET /v1/folders`, `POST /v1/folders`, `PATCH /v1/folders/{id}`, and `DELETE /v1/folders/{id}`.
- The **Folder Assignment Endpoint** accepts a Folder identifier or `null` for **No Folder**.
- `GET /v1/saved-items` accepts an optional **Folder Selector**: omit it for the complete Library, pass a Folder identifier for a **Folder View**, or pass `none` for **No Folder**.
- The **API Reference** is public and lives at `/docs` in the Web Companion app, while the OpenAPI JSON remains generated by the API project.
- The API implements the **REST API** with **Effect HttpApi**.
- iOS uses **Hand-Written DTOs** with a hand-written API client.
- The public API and adapted backend domain use **Saved Item** terminology rather than bookmark terminology.
- The **Native iOS App** is a primary surface for the **Reading Queue** and **Library**.
- The **Inbox** contains unread **Saved Items** for quick triage, while the **Library** contains the complete saved collection for browsing and filtering.
- The **Library** is the primary **Retrieval Surface** for the complete saved collection.
- A **Folder View** is a Library navigation destination, while **Type** and **Tag** remain filters within Library browsing.
- A **Folder View** contains both read and unread **Saved Items** and does not remove items when they become read.
- The **Home Tab** is the iOS tab label for the **Inbox**, whose screen title is "Inbox".
- The **Home Tab** uses an **Unread-Only Inbox** behavior.
- The **Home Tab** shows the full **Unread Backlog**, not a capped preview.
- The **Home Tab** surfaces the **Unread Backlog** count as lightweight navigation context.
- The **Home Tab** shows **All Caught Up** when the **Unread Backlog** is empty.
- The **Home Tab** keeps **Clipboard Capture** in v1 because new captures enter the unread triage flow.
- A **Duplicate Save** of a read **Saved Item** expresses **Renewed Intent** and returns that item to the **Home Tab** as unread.
- The **Home Tab** supports manual **Read State** changes as secondary triage actions.
- The **Native iOS App** keeps a separate **Search Tab** because search is an idiomatic native tab role, while **Library** remains the browsing and filtering retrieval surface.
- The **Search Tab** retrieves Saved Items across all Folders and unfiled Library content.
- The **Native iOS App** is implemented as a **SwiftUI App** in v1.
- The **Native iOS App** should leave room for **Native Motion**, including Metal shader effects.
- **Enrichment Loading Motion** is the v1 use case for Metal shader effects.
- The **Web Companion** is the keyboard-driven desktop client for **Manual URL Capture**, **API Key Settings**, and managing Saved Items with list navigation, single-key actions, and a **Command Palette**.
- The **Web Companion** supports dragging an individual **Saved Item** onto a **Folder** and also exposes a non-drag **Move to Folder Action**.
- The **Web Companion** presents user-created **Folders** as visible Library navigation destinations suitable for drag-and-drop targets and shows unfiled Saved Items on `/library`.
- The **Web Companion** represents Folder navigation with **Web Folder Routes**, leaving query state available for sorting or filtering within a Folder View.
- The **Web Companion** creates Folders from the Library sidebar and exposes rename and delete through a Folder contextual menu.
- V1 has one **Account** per Google email.
- Any Google email may create an **Account** in v1.
- An **Account** owns a private collection of **Saved Items**.
- An **App Session** authenticates the web app for an **Account**.
- **Prototype Auth** may be used before production **App Session** setup.
- An **API Key** authenticates external systems and non-interactive clients for an **Account**.
- **API Key** support is part of v1.
- An **Account** may have many **API Keys**.
- **API Key Settings** creates, displays, and revokes **API Keys** for an **Account** in the **Web Companion** only.
- V1 **API Keys** use fixed **API Key Scopes** to permit only granted REST API actions.
- The v1 **API Key Scope** vocabulary includes `saved-items:capture`, `saved-items:read`, `saved-items:write`, `saved-items:delete`, `folders:read`, `folders:write`, `folders:delete`, and `account:read`.
- An API Key with **Folder Read Access** may list existing **Folders** for configuring capture-time filing.
- A `folders:read` API response exposes each **Folder** identifier and name only, without Saved Item counts.
- An API Key with **Folder Write Access** may create and rename **Folders**.
- An API Key with **Folder Delete Access** may perform a **Delete Folder Action**.
- An API Key with `saved-items:capture` may assign a known existing **Folder** during capture without also holding **Folder Read Access**.
- An API Key with `saved-items:write` may perform a **Move to Folder Action** for an existing **Saved Item**.
- The v1 **REST API** does not expose account administration through **API Keys**.
- Each **API Key** is subject to an **API Key Rate Limit**.
- The v1 **API Key Rate Limit** applies uniformly to all REST API routes rather than using route-specific budgets.
- The v1 **API Key Rate Limit** applies only to API-key-authenticated requests, not **App Session** requests.
- The v1 **API Key Rate Limit** is 20 requests per minute per **API Key**.
- A request over the **API Key Rate Limit** receives a **Rate Limit Response** with HTTP 429, `Retry-After`, and rate-limit headers.
- A **Link** retains **Saved Metadata**, not the full original content.
- **Saved Metadata** is separated into **Link Metadata** and **Link Enrichment** so fetched page data and generated classification can evolve independently.
- A **Saved Item** retains user-specific state such as read state, last saved time, and overrides.
- A **Saved Item** may have **Saved Item Tags** supplied by API clients or other capture surfaces.
- A **Folder** is owned by one **Account** and organizes that Account's **Saved Items** independently of **Tags**.
- Folders are flat in v1 and do not contain child Folders.
- Folder names are unique within an **Account** after trimming surrounding whitespace and comparing case-insensitively.
- Folder names are trimmed before storage, must contain at least one non-whitespace character, and may be at most 80 characters long.
- Renaming a **Folder** to a conflicting name is rejected and does not merge Folders.
- A conflicting Folder create or rename returns a **Folder Name Conflict**.
- A blank or over-80-character Folder name returns an **Invalid Folder Name** response.
- User-created **Folders** are presented alphabetically in v1, while unfiled items appear on the Library root without a named **No Folder** destination.
- A **Saved Item** belongs to zero or one **Folder**.
- A Saved Item REST representation always includes `folder`, containing a **Folder Summary** when assigned and `null` for **No Folder**.
- Signed-in product apps use an **App Session** to manage **Folders**; API clients may list, create, rename, or delete Folders only when granted the corresponding Folder scopes.
- API clients may assign captures to an existing **Folder** when they know its stable identifier.
- API clients with `saved-items:write` may move existing **Saved Items** into a **Folder** or into **No Folder**.
- Operations that reference a missing, deleted, or other-Account Folder fail with **Folder Not Found**, including capture assignment, membership updates, folder mutation, and Folder View retrieval.
- A **Delete Folder Action** makes contained **Saved Items** unfoldered rather than deleting them.
- Product app confirmation UI for a **Delete Folder Action** must state that Saved Items are kept.
- Product app confirmation UI for a **Delete Folder Action** does not warn about possible external API client configuration.
- Product apps and API clients authorized with `saved-items:write` may perform a **Move to Folder Action** for individual **Saved Items** in v1.
- Shared **Saved Metadata** should not be duplicated per **Account**.
- Saved Item list rows show title with a **Domain Subtitle**.
- **Saved Metadata** may include a **Preview Summary**.
- Saved Item list rows use **Stable Row Height**, showing **Preview Summary** when available without changing row rhythm.
- **Saved Metadata** may include an **External Image URL** loaded directly by iOS and web clients.
- Extracted page content may be used during **Enrichment** but is not persisted in v1.
- A **Link** may later receive AI-generated categorization and summarization.
- A **Saved Item** records which **Capture Channel** created it.
- A **Capture Channel** creates **Saved Items** through **One-Tap Capture**.
- The **Capture Endpoint** is exposed as `POST /v1/captures`.
- The **Capture Endpoint** returns the current **Saved Item** before asynchronous **Enrichment** finishes.
- The **Capture Endpoint** returns a **Capture Result** of created or updated.
- Capture is a behavior that creates or updates a **Saved Item**, not a separate persisted domain object in v1.
- The **iOS Share Extension** is the preferred iPhone **Capture Channel**.
- The **iOS Share Extension** saves into the signed-in **Account**.
- The **iOS Share Extension** saves and dismisses without capture-time filing UI.
- Ordinary first-party **One-Tap Capture** flows do not prompt for a **Folder** in v1.
- The **Chrome Extension** is a **Capture Channel** that saves the active tab URL.
- The **Chrome Extension** uses **One-Tap Capture** with no popup UI in the happy path.
- The **Chrome Extension** authenticates via an **API Key** configured in its options page.
- The **Chrome Extension** shows badge feedback for save results.
- The **Chrome Extension** redirects to its options page when no **API Key** is set.
- **Manual URL Capture** is a minimal paste-and-save UI in the web companion and native iOS app.
- **Clipboard Capture** is the preferred in-app **Manual URL Capture** entry point for the **Native iOS App**.
- **Clipboard Capture** shows a **Clipboard URL Preview** before saving a clipboard URL.
- **Clipboard Capture** requires explicit confirmation before saving a clipboard URL.
- **Clipboard Capture** opens empty **Manual URL Capture** when the clipboard does not contain a URL.
- **Clipboard URL Preview** is lightweight and on-device; backend **Enrichment** still happens only after capture.
- **Capture Capsule** is opened and closed by the same navigation action, which morphs between add and close states.
- **Capture Capsule** appears inline at the top of the **Reading Queue** and should not shift the navigation title, toolbar, or tab chrome.
- **Capture Capsule** uses one subtle editable URL field for both clipboard preview and manual entry.
- **Capture Capsule** follows the **Capture Endpoint** definition of a valid URL rather than introducing stricter client-only URL rules.
- **Capture Capsule** may disable saving for obviously empty or locally unparseable input, while the **Capture Endpoint** remains the final URL validation authority.
- **Capture Capsule** remains visible and locked while save confirmation is in flight.
- **Capture Capsule** collapses after successful capture and the Saved Item appears at the top of the **Reading Queue**.
- **Capture Capsule** keeps the entered URL visible with a compact inline error when capture fails.
- **Capture Capsule** creates a **Pending Capture** when the API is temporarily unavailable.
- The **iOS Share Extension** creates a **Pending Capture** when the API is temporarily unavailable.
- A **Pending Capture** appears in the **Reading Queue** until it syncs.
- **Pending Capture** sync uses the same native iOS behavior for **iOS Share Extension** and **Capture Capsule**.
- **Capture Capsule** collapses once a URL is accepted as a **Pending Capture**.
- A **Duplicate Save** moves the existing **Saved Item** to the top of the **Reading Queue**.
- A **Duplicate Save** does not create another **Saved Item**.
- A **Duplicate Save** sets the existing **Saved Item** to unread.
- A **Duplicate Save** updates the **Source** and **Capture Channel** to the latest capture.
- A **Duplicate Save** is detected per **Account** using **Normalized URL**.
- **Last Saved At** drives newest-first ordering for **Saved Items**.
- **Enrichment** happens after a **Saved Item** has already been saved.
- **Hard Metadata** may be collected during capture and does not require **AI Enrichment**.
- **AI Enrichment** is owned by the backend in v1.
- **Enrichment** runs through an **Enrichment Job**, not inside the save request.
- **Enrichment** is shared per **Link** rather than duplicated per **Account**.
- Clients see **Enrichment Status**, not detailed **Enrichment Job** stages.
- **Enrichment** may assign a **Type** and **Enrichment Tags** to a **Link**.
- **Type** is assigned by hard rules in v1, not by **AI Enrichment**.
- **Enrichment Tags** are chosen by **AI Enrichment** in v1 without hard-rule hints.
- **Type** is assigned with **Hard Metadata** during capture rather than waiting for an **Enrichment Job**.
- Saved Item list rows may show a calm **Type Icon** for the **Type**.
- A newly captured **Saved Item** appears immediately and later receives **Hydration** as **Enrichment** completes.
- If **Enrichment** fails, the **Saved Item** remains usable through a **Basic Link**.
- V1 UI does not show a visible error for failed **Enrichment Status**.
- A **Link** has at most one **Type**.
- A **Link** may have multiple **Tags** in v1.
- The API and persistence model should expose **Type** as a singular value and **Tags** as an array in v1.
- A **Link** always has a **Type** after capture.
- **Website** is the fallback **Type** when hard rules do not identify a more specific content kind.
- The v1 **Type** hard rules are intentionally simple: GitHub or GitLab URLs are Repository, YouTube, youtu.be, or Vimeo URLs are Video, URLs containing "blog" or "article" are Article, and everything else is Website.
- A **Link** may have no **Enrichment Tags** when none are confidently extracted.
- A **Link** has no **Enrichment Tags** when **AI Enrichment** is unavailable or disabled.
- **Tags** must come from a closed app-defined vocabulary in v1.
- The v1 **Tag** vocabulary is developer-oriented because the first Library use case is saving development-heavy material.
- The v1 **Tag** vocabulary is: AI, Tools, TypeScript, Security, Design, Backend, and Front-end.
- When multiple **Enrichment Tags** could apply, **AI Enrichment** chooses all that match the user's likely retrieval intent.
- **Saved Item Tags** are hard data for one Account's Saved Item and do not alter shared **Link Enrichment**.
- API clients may provide **Saved Item Tags** during capture.
- Explicitly configured API clients may provide a **Folder** assignment during capture.
- A Duplicate Save with **Saved Item Tags** updates the existing Saved Item's Tags.
- A Duplicate Save without **Saved Item Tags** preserves any existing Saved Item Tags.
- A Duplicate Save with a **Folder** assignment moves the existing **Saved Item** into that Folder.
- A Duplicate Save without a Folder identifier moves the existing **Saved Item** into **No Folder**.
- Clients receive **Effective Tags** as `tags` in the REST API.
- The **Reading Queue** presents all **Saved Items** in reverse capture order.
- The **Library** provides browsing across unfiled Saved Items and **Folder Views** with filtering and categorization controls.
- The **V1 Library** reuses Saved Item list UI for its root and **Folder Views**, with **Type** and **Tag** filters.
- The **V1 Library** supports at most one active **Type** filter and one active **Tag** filter.
- The **V1 Library** may include a **No Tag Filter** for Saved Items without any **Tags**.
- The Library root in product apps shows Saved Items in the **No Folder Filter** state without requiring a visible **No Folder** navigation destination.
- V1 does not include a general manual tag editor outside capture-time **Saved Item Tags**.
- The **Native iOS App** has a **Queue Tab** and **Library Tab** in v1.
- The **Native iOS App** exposes the **Move to Folder Action** through native item interaction, allowing a Saved Item to return to the Library root without presenting **No Folder** as a named navigation destination.
- The **Native iOS App** navigates into a **Folder View** rather than representing Folders only inside the filter sheet.
- Selecting a **Folder** in the **Native iOS App** pushes a native Folder View on the Library navigation stack, keeping the Library overview as the root.
- The **Native iOS App** presents Folders in a horizontally scrollable Library section, shows Saved Items without a Folder beneath that section on the Library root, and exposes rename and delete through native Folder context menus.
- The iOS Library root list contains only Saved Items without a Folder; filed items appear in their Folder Views rather than being duplicated below the Folder row.
- V1 retrieval uses **V1 Library** filters rather than text search.
- The **Native iOS App** supports **Cached Viewing** and **Pending Capture** for native iOS capture flows in v1.
- V1 does not include reminders or push notifications.
- Each **Saved Item** has a **Read State**.
- **Unread Dot** is the v1 visual indicator for unread **Read State**.
- A **Saved Item** becomes read when the user opens it.
- Opening a **Saved Item** sends the user to its **Original URL** in the browser.
- Clients may open the known **Original URL** immediately while asynchronously notifying the API to update **Read State**.
- The **Open Action** is exposed as `POST /v1/saved-items/{id}/open`.
- A **Delete Action** removes a **Saved Item** without archive or trash behavior in v1.
- V1 has no Saved Item detail screen; list rows are the primary item surface.
- The **Command Palette** searches Saved Items by title and host, surfaces page navigation and action commands, and detects pasted URLs to offer capture.
- The **Command Palette** searches Saved Items across all Folders and unfiled Library content.
- The **Command Palette** suppresses all global keyboard shortcuts while open and restores list selection state on close.
- The **Web Companion** uses app-level selection state in a root-level React context rather than DOM focus for keyboard list navigation.
- An **Account** has at most one **Public Profile**.
- "Profile", alone, in code and in API paths, always names the **Public Profile** record — its **Handle** and its **Profile Visibility**. It never names an **Account**, which is why `/v1/profile` reads and changes those two settings and nothing else about the Account.
- A **Public Profile** is addressed by one **Handle** at `/u/{handle}`.
- A **Handle** is unique across Accounts after lowercasing, is 3 to 30 characters of `a-z`, `0-9`, `-`, and `_`, and may not use a reserved path name.
- A **Handle** stays reserved to its Account while **Profile Visibility** is private. Renaming releases the old spelling at once, and anyone may claim it. Deleting the Account releases the Handle.
- **Profile Visibility** is private by default and becomes public through one explicit confirmed action.
- A **Saved Item** appears on a **Public Profile** only when Profile Visibility is public, the item is not a **Private Saved Item**, its Folder is not a **Private Folder**, and it was created more than one hour ago.
- A **Private Saved Item**, and every Saved Item inside a **Private Folder**, is absent from a Public Profile without a placeholder or a count.
- A **Public Profile** withholds the Folder name, **Source** name, **Capture Channel**, and **Read State** of every listed Saved Item.
- A **Public Profile** shows a **Handle** only, without a display name, biography, or avatar.
- **Reading Activity** counts first captures only, bucketed by Saved Item creation time in UTC, and counts **Private Saved Items**, Saved Items inside a **Private Folder**, and saves from the last hour.
- **Reading Activity** covers a rolling 52 weeks ending on the current UTC day.
- A **Duplicate Save** adds no **Reading Activity**.
- A **Public Profile** becomes eligible for search indexing when its Account is at least 7 days old and has at least 5 public Saved Items.
- A **Public Profile** marks every outbound Saved Item link `rel="ugc nofollow"`.
- A request for an unknown **Handle** and a request for a private **Public Profile** return the same not-found response.
- Every **Public Profile Endpoint** lives under `/v1/public/`, beginning with `GET /v1/public/profiles/{handle}`.
- A **Public Profile Endpoint** requires no **App Session** and no **API Key**.
- `GET /v1/public/profiles/{handle}` returns the **Handle**, the Account join date, the public Saved Item count, and **Search Indexability**.
- `GET /v1/public/profiles/{handle}/activity` returns the **Handle**, the inclusive first and last UTC day of the **Reading Activity** window, and one count for every day inside it that has a save.
- The Account join date on a **Public Profile** is when the **Account** was created, not when its **Handle** was claimed.
- `GET /v1/public/profiles/{handle}/saved-items` returns one page of that Account's public **Saved Items**, newest first by Saved Item creation time, 50 to a page.
- A public Saved Item page is addressed by page number, and page 1 answers even when an Account publishes nothing, so every page of a **Public Profile** is a URL a crawler can reach.
- A public Saved Item representation carries the **Original URL**, host, title, favicon variants, image, **Type**, **Effective Tags**, **Preview Summary**, and the Saved Item creation time, and nothing else.
- **Search Indexability** is true only when the **Account** is at least 7 days old and has at least 5 public **Saved Items**.
- `GET /v1/public/indexable-profiles` returns one page of the **Handles** whose **Public Profile** has **Search Indexability**, 1000 to a page, each with the creation time of the newest **Saved Item** that Public Profile shows.
- A **Public Profile** without **Search Indexability** is absent from `GET /v1/public/indexable-profiles`, and the route answers with an empty page rather than a not-found when no Handle qualifies.
- The **Web Companion** serves `/sitemap.xml` from that listing together with its own fixed marketing and documentation URLs, and serves the fixed URLs alone when the listing cannot be read.
- Every **Public Profile Endpoint** is subject to the **Public Profile Rate Limit** rather than the **API Key Rate Limit**.
- A request over the **Public Profile Rate Limit** receives a **Rate Limit Response**.
- A successful **Public Profile Endpoint** response may be cached for five minutes; a not-found response is not cached.
- The public **Saved Item** rule is resolved in SQL and owned by Postgres, which decides the one-hour boundary.
- A signed-in visitor may capture a listed Saved Item into their own Account through the `public-profile` **Capture Channel**.
- Marking a Saved Item or a Folder private is a **Web Companion** action in v1.

## Flagged Ambiguities

These record the reasoning behind decisions that are not obvious from the definitions alone.

- `CapturedLink` from bookmarks-core should be removed for v1; resolved: capture does not need its own persisted domain record.
- iOS is the primary mobile client; the Web Companion is the primary desktop client with its own keyboard-first interaction model (see ADR 0010).
- The **Web Companion** should be separate from the API project; resolved: keep UI framework concerns out of the Effect backend.
- Defer Sign in with Apple until native distribution is production-worthy; use **Prototype Auth** during early validation.
- **Type** should not depend on AI in v1; resolved: use hard rules for type and AI only for tag and preview summary.
- **Enrichment Tags** should not have a non-AI fallback in v1; resolved: no AI means no Enrichment Tags unless the Saved Item has **Saved Item Tags**.
- "category" was too broad; resolved: use **Type** for content kind and **Tag** for subject area.
- AI should not invent arbitrary type or tag names per item; types and tags come from small app-defined fixed sets.
- "unknown" should not be a user-facing **Type**; resolved: use **Website** as the successful fallback instead.
- Tags are not arbitrary user-managed labels; resolved: changing the tag vocabulary is a product change.
- `generatedTags` as an array was considered but rejected for singular tag; resolved: use array `tags` after product decision.
- `generated_type` and `generated_tag` overstate implementation details in storage and API contracts; resolved: use `type` and `tags`.
- Enrichment should not be duplicated for every Account; resolved: shared **Link** records own enrichment metadata, while **Saved Items** own user-specific state and overrides.
- Capture-time organization should not mutate shared **Link Enrichment**; resolved: store capture-supplied Tags as **Saved Item Tags** on the Account's Saved Item.
- **Folders** are not **Tags**; resolved: Folders are user-created containers for deliberate organization, while Tags remain subject-based filters.
- A **Saved Item** cannot belong to multiple **Folders**; resolved: a Folder is an optional single location, while Tags provide overlapping organization.
- Duplicate capture does not preserve Folder membership by omission; superseded: capture treats a Folder identifier as the desired destination and otherwise moves the Saved Item into **No Folder**.
- A requested **Folder** is not best-effort; resolved: missing or inaccessible folder identifiers return HTTP 404 across capture, membership, management, and Folder View retrieval rather than disclosing ownership or silently using **No Folder**.
- Folder membership is **Saved Item** state; resolved: API clients with `saved-items:write` may perform a **Move to Folder Action**, while capture-only clients may file only during capture.
- Folder membership updates use `PUT /v1/saved-items/{id}/folder`; resolved: replacing a single optional Folder assignment is idempotent and distinct from capture-time filing.
- Saved Item responses always include `folder` as a nullable **Folder Summary**; resolved: clients receive a stable response shape while older deployed clients safely ignore the additive field.
- **Folder Read Access** exposes only Folder identifiers and names; resolved: API clients discover destinations without gaining partial Library browsing data.
- Capture-time Folder assignment requires `saved-items:capture`, not **Folder Read Access**; resolved: clients may use a deliberately configured destination without enumerating Folders.
- Capture remains backward-compatible for clients that do not send a Folder identifier; resolved: their duplicate captures intentionally move the renewed Saved Item into **No Folder** under the new folder model.
- The behavioral change for older one-tap clients is accepted; resolved: preserving a single capture destination rule is preferred over retaining Folder membership on legacy recapture.
- Deleting a **Folder** must not delete **Saved Items**; resolved: items become unfoldered, and destructive UI must make that consequence explicit.
- Folder deletion confirmation describes only the direct Saved Item consequence; resolved: v1 does not attempt to warn about untracked external clients that may hold a deleted Folder identifier.
- Folder hierarchy is deferred; resolved: v1 **Folders** are flat because explicit single-folder filing does not require nested navigation or parent-child behavior.
- Saved Items without a **Folder** are surfaced through the **No Folder Filter** state; resolved: this is API and Library-home behavior, not a special Folder, named product destination, or the **Inbox**.
- Folder organization does not add filing UI to ordinary first-party capture flows; resolved: **One-Tap Capture** remains frictionless, while explicitly configured API clients may assign a Folder during capture.
- Initial folder movement is single-item only; resolved: the **Web Companion** supports drag-and-drop plus a non-drag move action, while the **Native iOS App** uses native move interaction, without requiring bulk filing in v1.
- Folders are navigation, not ordinary filters; resolved: a user enters a **Folder View**, then may use Library filters such as **Type** or **Tag** within it.
- Web Folder Views use path-based navigation; resolved: `/library/folders/{id}` represents a destination, while `/library` is the unfiled Library home.
- iOS Folder Views use native stack navigation; resolved: selecting a Folder pushes a destination view with a back path to the Library overview.
- Folder management stays beside navigation; resolved: web uses the Library sidebar with contextual menus, while iOS uses a horizontal Library Folder section with native context menus.
- Product Library roots represent Saved Items without a Folder without labeling that state **No Folder**; resolved: web and iOS show Folder destinations above or beside the unfiled Library home, while the API retains the explicit `folder=none` selector.
- The iOS Library root does not duplicate filed Saved Items; resolved: its item list contains only content without a Folder, so moving an item into a Folder visibly moves it to that destination.
- The Web Companion Library root matches iOS; resolved: `/library` contains unfiled Saved Items and user-created Folder navigation, while filed items are shown in `/library/folders/{id}`.
- Folder membership does not limit global search; resolved: the **Search Tab** and **Command Palette** retrieve across all Folders and unfiled content.
- Folder navigation is backed by the server-side **Folder Selector**; resolved: Folder Views do not require loading and filtering the complete Library on the client.
- **Folder Views** retain read items; resolved: Folders support durable retrieval rather than unread triage like the **Inbox**.
- **Folder** names must be unique within an **Account** after name normalization; resolved: navigation destinations remain distinguishable and renaming never implicitly merges content.
- Duplicate normalized Folder names return HTTP 409; resolved: the name is valid in form but conflicts with an existing Folder resource.
- Invalid Folder names return HTTP 400; resolved: clients may validate eagerly, while the REST API remains the validation authority.
- Folder name validation is shared across clients and API; resolved: trim stored names, reject blank names, and cap them at 80 characters for navigational display.
- Folder ordering is alphabetical in v1; resolved: user-created Folders are stable navigation destinations, while unfiled items remain on the Library root and custom ordering is deferred.
- API clients do not manage folder structure implicitly; resolved: folder management endpoints are reusable by any client, but API clients require `folders:read`, `folders:write`, or `folders:delete` for their corresponding operations.
- Folder organization uses shared REST **Folder Endpoints**; resolved: web and iOS consume the same API surface, while authorization still constrains external clients to granted operations.
- Folder delivery is dependency-ordered; resolved: implement the complete API and contract slice first, then implement the Web Companion and Native iOS App consumers one at a time against that API.
- Newest-first ordering uses **Last Saved At**; resolved: metadata updates should not reshuffle the queue.
- **Source** is not a **Capture Channel**; resolved: Source is a device/environment recall cue (e.g. "Onno's iPhone"), Capture Channel is the mechanism (e.g. `ios-share-extension`). Both are stored on each Saved Item.
- **Source** is lazily registered via the capture endpoint, not eagerly; resolved: the API finds-or-creates a Source by name within the Account when a `sourceName` is provided.
- **Source** is deduplicated by name within an Account; resolved: reinstalls or re-setups reuse the existing Source if the auto-detected name matches.
- **Source** is nullable; resolved: old items and raw API captures without a source name have no Source.
- An **Account** is not a **Public Profile**; resolved: Account stays the private owner and keeps avoiding the word profile, while a Public Profile is a separate audience-facing surface an Account may publish.
- A **Handle** is not a sign-in name; resolved: it is a product identifier stored with the Public Profile rather than an authentication credential.
- Publishing is not per **Folder** and not per collection; resolved: turning **Profile Visibility** on publishes every Saved Item, with **Private Saved Items** and **Private Folders** as the exceptions, because an audience flag on every Folder would add a decision to each Folder a user creates and give Folders a second meaning.
- **Reading Activity** is saves, not reads; resolved: **Read State** stays private and no read-derived statistic appears on a Public Profile.
- **Reading Activity** is bucketed by creation time, not **Last Saved At**; resolved: a **Duplicate Save** would otherwise rewrite past activity.
- **Reading Activity** day buckets use UTC, not the viewer timezone; resolved: per-viewer bucketing would make every response unique and prevent shared caching.
- **Reading Activity** counts private saves; resolved: a count is not a URL, and a grid restricted to public Saved Items would be too empty to be worth showing.
- Public Saved Item responses are not the Saved Item REST representation; resolved: the public shape is an allow-list, so fields added to the private representation later cannot leak.
- A public Saved Item page is not ordered by **Last Saved At**; resolved: Saved Item creation time orders it, so a **Duplicate Save** cannot reorder a published page.
- A public Saved Item page is not addressed by cursor; resolved: numbered pages give every page a shareable URL, which a crawler can reach and infinite scroll cannot.
- The first publish has no review step; resolved: opt-in confirmation copy states the item count and the automatic future behavior, and Sleevy accepts that an existing library publishes in full at that moment.
