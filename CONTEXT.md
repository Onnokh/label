# Label

Label is the provisional name for a read-later product that saves web content from multiple entry points and returns to it with lightweight AI assistance.

## Language

**Saved Item**:
A URL captured because the user may want to read, watch, or revisit it later.
_Avoid_: Bookmark, pin, tab, article

**Read-Later App**:
A product centered on returning to captured content, with categorization and summarization as support features.
_Avoid_: Knowledge library, personal knowledge management system

**V1 Read-Later MVP**:
The first usable milestone that proves capture, enrichment, queue, library filters, and cross-client access.
_Avoid_: Production launch, public beta

**Label**:
The provisional product name for the V1 Read-Later MVP.
_Avoid_: Final brand assumption

**Backend Core**:
The backend API project adapted from the existing bookmarks-core project.
_Avoid_: Separate core package, web app API routes as domain logic, throwaway prototype backend

**App Workspace**:
A runnable monorepo app under `apps/`, such as `apps/api`, `apps/web`, or `apps/ios`.
_Avoid_: Package for deployable app, nested repo

**API Contract**:
The versioned HTTP schema that keeps iOS, web, and API request and response shapes aligned.
_Avoid_: Informal JSON, client-specific DTOs

**Generated DTOs**:
Client transport models generated from the API Contract.
_Avoid_: Hand-copied JSON models, generated full client

**REST API**:
The resource-style HTTP API exposed by the backend for iOS, web, share extension, and automation clients.
_Avoid_: RPC API, client-specific endpoints

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

**Capture Channel**:
A way a user sends a URL into the app.
_Avoid_: Integration, source

**iOS Share Extension**:
The native iPhone Capture Channel exposed from the system share sheet.
_Avoid_: Shortcut workaround, mobile web form

**Manual URL Capture**:
A small UI Capture Channel where the user pastes a URL to save it.
_Avoid_: Bookmark form, editor

**Web Companion**:
The separate web package for desktop viewing, Manual URL Capture, Token Settings, and a basic Saved Item list.
_Avoid_: API-hosted UI, primary client

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

**Capture Token**:
A personal token used by non-interactive Capture Channels to save URLs into an Account.
_Avoid_: Session, password, later integration

**Token Settings**:
A small web companion settings surface for creating and copying a Capture Token.
_Avoid_: Admin panel, developer portal

**Read-List Access**:
Permission for an automation client to retrieve Saved Items from an Account.
_Avoid_: Capture, public feed

**Enrichment**:
Post-capture processing that adds metadata such as title, content type, category, summary, or reading state hints to a Saved Item.
_Avoid_: Saving, ingest

**AI Enrichment**:
Server-side Enrichment that uses an AI provider to generate a Preview Summary, Generated Type, and Generated Topics.
_Avoid_: On-device AI, manual categorization

**Enrichment Job**:
An asynchronous backend task that performs Enrichment for a Saved Item after capture.
_Avoid_: Save request, synchronous enrichment

**Enrichment Status**:
A coarse client-visible state: pending, enriched, or failed.
_Avoid_: Stage details, debug log

**Basic Saved URL**:
A Saved Item with only its Original URL and minimal capture metadata.
_Avoid_: Failed item, broken item

**Hydration**:
The client-side update where a newly saved item gains enriched metadata after initially appearing with minimal data, typically after refresh.
_Avoid_: Refresh, reload

**Generated Type**:
An AI-assigned content kind from a small fixed set, such as Video, Website, Article, or Repository.
_Avoid_: Category, user tag, folder

**Type Icon**:
A small visual indicator for a Saved Item's Generated Type.
_Avoid_: Type chip, row badge text

**Generated Topic**:
An AI-assigned subject area from a small fixed set, such as AI, TypeScript, ML, Library, or Design.
_Avoid_: Category, user tag, folder

**Reading Queue**:
The primary list of all Saved Items, ordered with the most recently saved item first.
_Avoid_: Library, dashboard, feed

**Library**:
A complete browsing surface for all Saved Items with filters such as category.
_Avoid_: Reading Queue, knowledge base

**V1 Library**:
A lightweight Library view that reuses Saved Item list UI with Generated Type and Generated Topic filters.
_Avoid_: Knowledge base, advanced search

**Queue Tab**:
The native iOS tab that shows the Reading Queue.
_Avoid_: Home, feed

**Library Tab**:
The native iOS tab that shows the V1 Library filters and list.
_Avoid_: Search tab, knowledge base

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

**Saved Metadata**:
The retained descriptive data for a Saved Item, such as title, image, summary, type, topics, read state, URL, and timestamps.
_Avoid_: Archived content, page copy

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

## Relationships

- A **Read-Later App** contains many **Saved Items**.
- The **V1 Read-Later MVP** includes native iOS, backend API, web companion, and shared API contract projects.
- The monorepo uses three **App Workspaces**: `apps/api`, `apps/web`, and `apps/ios`.
- The backend API should be the **Backend Core**, adapted from bookmarks-core, rather than a separate core package plus API wrapper.
- The API uses Postgres through Drizzle for v1 deployment on a single VPS.
- The **API Contract** is generated from Effect route and schema definitions.
- The **REST API** is the client-facing shape of the **API Contract**.
- The API implements the **REST API** with **Effect HttpApi**.
- iOS uses **Generated DTOs** with a hand-written API client.
- The public API and adapted backend domain use **Saved Item** terminology rather than bookmark terminology.
- The **Native iOS App** is a primary surface for the **Reading Queue** and **Library**.
- The **Native iOS App** is implemented as a **SwiftUI App** in v1.
- The **Native iOS App** should leave room for **Native Motion**, including Metal shader effects.
- **Enrichment Loading Motion** is the v1 use case for Metal shader effects.
- The **Web Companion** is a separate package for **Manual URL Capture**, **Token Settings**, and a basic newest-first Saved Item list.
- V1 has one **Account** per Google email.
- Any Google email may create an **Account** in v1.
- An **Account** owns a private collection of **Saved Items**.
- An **App Session** authenticates the web app for an **Account**.
- **Prototype Auth** may be used before production **App Session** setup.
- A **Capture Token** authenticates non-interactive **Capture Channels** for an **Account**.
- **Capture Token** support is part of v1.
- A **Capture Token** starts as capture-only and does not grant **Read-List Access** in v1.
- Each **Account** has at most one **Capture Token** in v1.
- **Token Settings** creates, displays, and regenerates the **Capture Token** for an **Account** in the **Web Companion** only.
- A **Capture Token** can create **Saved Items** but cannot read the **Library**.
- A **Saved Item** retains **Saved Metadata**, not the full original content.
- Saved Item list rows show title with a **Domain Subtitle**.
- **Saved Metadata** may include a **Preview Summary**.
- Saved Item list rows use **Stable Row Height**, showing **Preview Summary** when available without changing row rhythm.
- **Saved Metadata** may include an **External Image URL** loaded directly by iOS and web clients.
- Extracted page content may be used during **Enrichment** but is not persisted in v1.
- A **Saved Item** may later receive AI-generated categorization and summarization.
- A **Capture Channel** creates **Saved Items** through **One-Tap Capture**.
- The **Capture Endpoint** is exposed as `POST /v1/captures`.
- The **Capture Endpoint** returns the current **Saved Item** before asynchronous **Enrichment** finishes.
- The **Capture Endpoint** returns a **Capture Result** of created or updated.
- Capture is a behavior that creates or updates a **Saved Item**, not a separate persisted domain object in v1.
- The **iOS Share Extension** is the preferred iPhone **Capture Channel**.
- The **iOS Share Extension** saves into the signed-in **Account**.
- The **iOS Share Extension** saves and dismisses without capture-time filing UI.
- **Manual URL Capture** is a minimal paste-and-save UI in the web companion and native iOS app.
- A **Duplicate Save** moves the existing **Saved Item** to the top of the **Reading Queue**.
- A **Duplicate Save** does not create another **Saved Item**.
- A **Duplicate Save** sets the existing **Saved Item** to unread.
- A **Duplicate Save** is detected per **Account** using **Normalized URL**.
- **Last Saved At** drives newest-first ordering for **Saved Items**.
- **Enrichment** happens after a **Saved Item** has already been saved.
- **AI Enrichment** is owned by the backend in v1.
- **Enrichment** runs through an **Enrichment Job**, not inside the save request.
- **Enrichment** is duplicated per **Account** rather than shared globally across URLs in v1.
- Clients see **Enrichment Status**, not detailed **Enrichment Job** stages.
- **Enrichment** may assign a **Generated Type** and **Generated Topic** to a **Saved Item**.
- Saved Item list rows may show a calm **Type Icon** for the **Generated Type**.
- A newly captured **Saved Item** appears immediately and later receives **Hydration** as **Enrichment** completes.
- If **Enrichment** fails, the **Saved Item** remains usable as a **Basic Saved URL**.
- V1 UI does not show a visible error for failed **Enrichment Status**.
- A **Saved Item** has at most one **Generated Type**.
- A **Saved Item** may have multiple **Generated Topics**.
- A **Saved Item** always has a **Generated Type** after successful **Enrichment**.
- A **Saved Item** may have no **Generated Topics** when none are confidently extracted.
- The **Reading Queue** presents all **Saved Items** in reverse capture order.
- The **Library** presents all **Saved Items** newest first with filtering and categorization controls.
- The **V1 Library** is a lightly different list view with **Generated Type** and **Generated Topic** filters.
- The **V1 Library** supports at most one active **Generated Type** filter and one active **Generated Topic** filter.
- The **Native iOS App** has a **Queue Tab** and **Library Tab** in v1.
- V1 retrieval uses **V1 Library** filters rather than text search.
- The **Native iOS App** may support **Cached Viewing**, but not offline capture in v1.
- V1 does not include reminders or push notifications.
- Each **Saved Item** has a **Read State**.
- **Unread Dot** is the v1 visual indicator for unread **Read State**.
- A **Saved Item** becomes read when the user opens it.
- Opening a **Saved Item** sends the user to its **Original URL** in the browser.
- Clients may open the known **Original URL** immediately while asynchronously notifying the API to update **Read State**.
- The **Open Action** is exposed as `POST /v1/saved-items/{id}/open`.
- A **Delete Action** removes a **Saved Item** without archive or trash behavior in v1.
- V1 has no Saved Item detail screen; list rows are the primary item surface.

## Example Dialogue

> **Dev:** "When the user shares a YouTube URL from iPhone, do we create a **Saved Item**?"
> **Domain expert:** "Yes, because the app is for returning to saved content later, whether it is an article, video, or other URL."
>
> **Dev:** "Is the iPhone experience just a mobile website?"
> **Domain expert:** "No, the product should include a **Native iOS App** for the core read-later experience."
>
> **Dev:** "Can phone and desktop save into the same collection?"
> **Domain expert:** "Yes, each **Capture Channel** saves into the **Account** for that Google email."
>
> **Dev:** "Should Raycast use the same authentication as the web app?"
> **Domain expert:** "No, the app uses an **App Session** after Google login, while automation can use a **Capture Token**."
>
> **Dev:** "Can we delay Sign in with Apple?"
> **Domain expert:** "Yes, use Google login for the prototype **App Session** and revisit Sign in with Apple later."
>
> **Dev:** "Can a token list everything the user saved?"
> **Domain expert:** "Not in v1; **Read-List Access** may be added later, but **Capture Token** starts as capture-only."
>
> **Dev:** "Where does a user create an automation token?"
> **Domain expert:** "In **Token Settings** in the web companion."
>
> **Dev:** "Can users create separate tokens for Raycast and scripts?"
> **Domain expert:** "No, each **Account** has one **Capture Token** in v1."
>
> **Dev:** "Can a **Capture Token** list everything in the **Library**?"
> **Domain expert:** "No, a **Capture Token** is capture-only."
>
> **Dev:** "Should the iPhone share sheet ask the user to pick a category?"
> **Domain expert:** "No, **One-Tap Capture** means categorization can happen after the **Saved Item** exists."
>
> **Dev:** "Should iPhone capture start as a Shortcut?"
> **Domain expert:** "No, the preferred phone experience is a native **iOS Share Extension** because it feels better."
>
> **Dev:** "Does the iOS Share Extension use an external automation token?"
> **Domain expert:** "No, conceptually it saves into the signed-in **Account** from the native app."
>
> **Dev:** "Should the share extension show title, notes, or categories before saving?"
> **Domain expert:** "No, it should save and disappear as **One-Tap Capture**."
>
> **Dev:** "Can desktop users save a URL before Raycast exists?"
> **Domain expert:** "Yes, use **Manual URL Capture** as a tiny paste-and-save control in the web app."
>
> **Dev:** "Can iOS users paste a URL directly into the app?"
> **Domain expert:** "Yes, use **Manual URL Capture** from a small plus-button sheet."
>
> **Dev:** "Can the share extension save while offline?"
> **Domain expert:** "Not in v1; **Cached Viewing** is enough, and offline capture can come later."
>
> **Dev:** "If summarization fails, did saving fail?"
> **Domain expert:** "No, **Enrichment** can retry later because the **Saved Item** already exists."
>
> **Dev:** "Should saving wait for AI results?"
> **Domain expert:** "No, an **Enrichment Job** runs asynchronously after capture."
>
> **Dev:** "Does capture return enriched data?"
> **Domain expert:** "No, the **Capture Endpoint** returns the current **Saved Item** immediately, before asynchronous **Enrichment** finishes."
>
> **Dev:** "What does the list show before enrichment finishes?"
> **Domain expert:** "The **Saved Item** appears immediately with minimal data, then **Hydration** updates it after refresh."
>
> **Dev:** "What happens when enrichment fails?"
> **Domain expert:** "The item remains a **Basic Saved URL** without making failure a user-facing workflow."
>
> **Dev:** "Should clients show every enrichment stage?"
> **Domain expert:** "No, clients only need **Enrichment Status** for simple UI states."
>
> **Dev:** "Should iOS generate summaries locally?"
> **Domain expert:** "No, v1 uses backend-owned **AI Enrichment** so all clients get consistent results."
>
> **Dev:** "Do users need to choose a folder when saving?"
> **Domain expert:** "No, **Generated Type** and **Generated Topic** can be assigned later by **Enrichment**."
>
> **Dev:** "Should the home screen be grouped by AI category?"
> **Domain expert:** "No, the home screen is the **Reading Queue**: a simple recency-first list with title, image, summary, and **Read State**."
>
> **Dev:** "Does the Reading Queue hide read items?"
> **Domain expert:** "No, it shows all **Saved Items** newest first with an unread indicator."
>
> **Dev:** "Where do users go when they want to browse everything by category?"
> **Domain expert:** "They use the **Library**, which includes all **Saved Items** newest first and supports filters."
>
> **Dev:** "Is the Library a big knowledge-management feature in v1?"
> **Domain expert:** "No, the **V1 Library** is just a lightly different list view with type and topic filters."
>
> **Dev:** "Does v1 need text search?"
> **Domain expert:** "No, the **V1 Library** filters are enough for v1 retrieval."
>
> **Dev:** "Do we need to track whether the user finished the whole article?"
> **Domain expert:** "No, opening a **Saved Item** is enough to mark its **Read State** as read."
>
> **Dev:** "Should opening wait for the API to return the URL?"
> **Domain expert:** "No, clients already have the **Original URL** and can open it immediately while posting the read-state update."
>
> **Dev:** "Can users remove accidental saves?"
> **Domain expert:** "Yes, use a simple **Delete Action** without archive or trash in v1."
>
> **Dev:** "Should we render saved articles inside the app?"
> **Domain expert:** "No, opening a **Saved Item** should open its **Original URL** in the browser."
>
> **Dev:** "Does tapping a row open an in-app detail page?"
> **Domain expert:** "No, v1 uses list rows as the item surface and opens the **Original URL** directly."
>
> **Dev:** "Do we keep the full article text?"
> **Domain expert:** "No, we keep **Saved Metadata**, including the generated summary, and rely on the **Original URL** for the content."
>
> **Dev:** "Should summaries replace opening the source?"
> **Domain expert:** "No, a **Preview Summary** only helps decide whether the **Saved Item** is worth opening."
>
> **Dev:** "What happens if the same URL is saved again?"
> **Domain expert:** "It is a **Duplicate Save**: update the existing **Saved Item** so it returns to the top of the **Reading Queue** and becomes unread again."
>
> **Dev:** "What timestamp controls newest-first ordering?"
> **Domain expert:** "**Last Saved At**, so a **Duplicate Save** moves the item back to the top without relying on metadata updates."

## Flagged Ambiguities

- "bookmark" can imply a permanent browser-style favorite; resolved: use **Saved Item** for the captured URL in this app.
- Existing bookmarks-core language should be updated; resolved: public contracts and adapted domain should use **Saved Item**.
- `CapturedLink` from bookmarks-core should be removed for v1; resolved: capture does not need its own persisted domain record.
- The app is not primarily a long-term knowledge library; resolved: it is a **Read-Later App** with AI-assisted organization.
- The first milestone is **V1 Read-Later MVP**; resolved: it proves the read-later loop without claiming production launch.
- The existing bookmarks-core project should become the **Backend Core** API project, adapted to this domain language.
- SQLite from bookmarks-core should be replaced with Postgres for v1; resolved: deployment targets one VPS with a dedicated Postgres instance.
- Swift and TypeScript clients should stay aligned through an **API Contract**, not hand-copied model drift.
- iOS networking should use **Generated DTOs** with a small hand-written API client.
- Client integration should be boring on the wire; resolved: expose a resource-style **REST API** generated from Effect schemas.
- The iPhone experience should feel native; resolved: the product includes a **Native iOS App**, not only a mobile web UI.
- Native iOS implementation is key; resolved: build the main app with SwiftUI.
- Native visual polish matters; resolved: support **Native Motion** and Metal shader effects where they enhance the app.
- Metal shader effects should be tasteful and functional; resolved: use them for **Enrichment Loading Motion** rather than core navigation.
- The web app is a companion, not an equal primary client; resolved: v1 should bias polish toward iOS.
- The **Web Companion** should be separate from the API project; resolved: keep UI framework concerns out of the Effect backend.
- The **Web Companion** does not need the full **V1 Library** in v1; resolved: keep it to token settings, manual capture, and a basic list.
- "integration" is too implementation-focused for the domain; resolved: use **Capture Channel** for iPhone share sheet, API endpoint, Raycast, and web UI capture.
- iPhone capture should feel native; resolved: prefer an **iOS Share Extension** over a Shortcut workaround.
- Cross-device capture requires authentication; resolved: **Saved Items** belong to an **Account**.
- Shared lists and friend-testing workflows are out of scope for now; resolved: v1 has one private **Account** per Google email.
- V1 does not use an email allowlist; resolved: any Google email can create its own **Account**.
- Prototype app authentication uses Google login; resolved: defer Sign in with Apple until native distribution is production-worthy.
- Paid Apple Developer setup should wait until the app proves itself; resolved: use **Prototype Auth** during early validation.
- Non-interactive capture needs low-friction authentication; resolved: use **Capture Token** rather than browser login.
- External-source ingestion is core to the MVP; resolved: **Capture Token** support belongs in v1.
- **Capture Token** permissions are intentionally narrow in v1; resolved: read-list retrieval can be added later as **Read-List Access**.
- **Capture Token** scope is intentionally limited; resolved: it can save URLs but cannot read the **Library**.
- "ingest" can blur saving with processing; resolved: saving creates the **Saved Item**, while **Enrichment** runs afterward.
- AI processing is not client-owned in v1; resolved: use backend-owned **AI Enrichment**.
- Enrichment should not block capture; resolved: use asynchronous **Enrichment Job** processing.
- Newly saved items should appear immediately; resolved: use refresh-based **Hydration** to update rows when enrichment completes.
- Enrichment failure should be quiet; resolved: keep the item as a **Basic Saved URL**.
- Failed **Enrichment Status** is not surfaced as an error badge in v1.
- "feed" can imply algorithmic recommendation; resolved: use **Reading Queue** for the user's own recency-first saved list.
- "library" is not the primary home surface; resolved: use **Library** for complete browsing and filtering, while **Reading Queue** remains the everyday recency-first list.
- The first Library should stay small; resolved: **V1 Library** reuses the saved-item list with simple type/topic filters.
- Search is out of v1; resolved: use type/topic filters for initial retrieval.
- Reminders and push notifications are out of v1; resolved: Label stays quiet unless opened.
- "category" was too broad; resolved: use **Generated Type** for content kind and **Generated Topic** for subject area.
- Types and topics come from small app-defined fixed sets; resolved: AI should not invent arbitrary type or topic names per item.
- Topics are not user-managed preferences; resolved: changing the topic vocabulary is a product change.
- "None" is not a topic; resolved: a **Saved Item** can simply have no **Generated Topics**.
- The app does not archive original content; resolved: store **Saved Metadata** plus a generated summary.
- Extracted page content is not retained; resolved: use it only transiently during **Enrichment**.
- The generated summary is for quick scanning; resolved: use **Preview Summary** rather than long-form summarization.
- Duplicate captures are resolved by **Normalized URL**; resolved: a **Duplicate Save** bumps the existing item instead of creating a copy.
- URL dedupe is scoped per **Account**; resolved: different accounts can save the same **Original URL** independently.
- Enrichment is not globally cached in v1; resolved: each **Account** owns its own enriched **Saved Item** data.
- Newest-first ordering uses **Last Saved At**; resolved: metadata updates should not reshuffle the queue.
- V1 has no manual read/unread toggle; resolved: **Read State** changes when opening or duplicate-saving an item.
- V1 has no Saved Item detail page; resolved: list rows carry the item UI.
