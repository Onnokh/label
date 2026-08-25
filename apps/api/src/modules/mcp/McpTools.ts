import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Context, Effect, Layer, Option } from "effect"
import { z } from "zod"

import type { FolderId, SavedItemWithLink, UserId } from "../../domain/SavedItem.js"
import { SavedItemId } from "../../domain/SavedItem.js"
import { savedItemToDto } from "../../api/ApiContract.js"
import type { Scope } from "../auth/Scopes.js"
import { CaptureService } from "../capture/CaptureService.js"
import { EnrichmentWorkflow } from "../enrichment/EnrichmentWorkflow.js"
import { FolderRepository } from "../folders/FolderRepository.js"
import {
  decodeSavedItemsCursor,
  encodeSavedItemsCursor,
  SavedItemRepository,
} from "../saved-items/SavedItemRepository.js"
import type { SavedItemsPageCursor } from "../saved-items/SavedItemRepository.js"
import { AppConfig } from "../../runtime/Config.js"

export const MCP_SCOPES = [
  "saved-items:capture",
  "saved-items:read",
  "saved-items:write",
  "saved-items:delete",
  "folders:read",
  "folders:write",
  "folders:delete",
] as const satisfies readonly Scope[]

/**
 * The descriptive half of every MCP tool: the text a client shows, the scope
 * that unlocks it, and its behaviour hints.
 *
 * This is the single source of truth for the tool list. `registerTools` spreads
 * these entries into the live server, and the unauthenticated MCP Server Card
 * renders the same array, so a client previewing the card before it connects
 * sees exactly the tools it will get once it has the scopes.
 */
/**
 * What a client is told about the server during the initialize handshake.
 *
 * A tool list says what can be called; this says when calling it is the right
 * move, and when it is not. An agent that reads only the tool names will
 * cheerfully use a read-later queue as a web crawler, so the boundary is stated
 * here rather than left to be inferred.
 */
const SERVER_INSTRUCTIONS = `Sleevy is one person's read-later queue. Use it to save an HTTP or HTTPS link for later, to see what they have already saved, to mark something read or unread, and to organize saved items into folders.

Do not use Sleevy as a web crawler, a page-content archive, a general notes database, or a source of facts about pages that have not been saved. It stores and organizes links; it does not replace the publisher of the linked page.

Working with it:
- Reuse the saved-item and folder IDs Sleevy returns. Never guess one; list first if you do not have it.
- Ask the person before delete_saved_item or remove_folder. Deletion is permanent, and a bulk cleanup is still worth confirming item by item. Removing a folder keeps the saved items in it; deleting a saved item does not.
- A freshly saved link comes back before its title, image, and tags are fetched. If the person wants the title, save it and read the item back a moment later.
- list_saved_items is paged. Follow nextCursor until it comes back null, and pass the cursor back exactly as given.
- Ask for the narrowest scopes that do the job. A session only sees the tools its scopes cover.
- initialize and tools/list need no credential, so you may read this list before asking the person to authorize anything. Every tool call does need one.`

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

export const MCP_TOOL_CATALOG = [
  {
    name: "list_saved_items",
    title: "List saved items",
    description:
      "List the authenticated user's saved items, newest first. Results are paginated; call again with nextCursor until it is null.",
    scopes: ["saved-items:read"],
    annotations: { readOnlyHint: true },
    inputSchema: {
      limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
      cursor: z.string().min(1).optional(),
    },
  },
  {
    name: "save_link",
    title: "Save link",
    description: "Save an HTTP or HTTPS link to the authenticated user's Sleevy library.",
    scopes: ["saved-items:capture"],
    annotations: { destructiveHint: false, openWorldHint: true },
    inputSchema: { url: z.string().url() },
  },
  {
    name: "set_saved_item_read_state",
    title: "Set saved item read state",
    description: "Mark one of the authenticated user's saved items as read or unread.",
    scopes: ["saved-items:write"],
    annotations: { destructiveHint: false },
    inputSchema: { savedItemId: z.string().min(1), isRead: z.boolean() },
  },
  {
    name: "set_saved_item_folder",
    title: "Set saved item folder",
    description: "Move a saved item to a folder, or remove it from its folder.",
    scopes: ["saved-items:write"],
    annotations: { destructiveHint: false },
    inputSchema: { savedItemId: z.string().min(1), folderId: z.string().min(1).nullable() },
  },
  {
    name: "delete_saved_item",
    title: "Delete saved item",
    description: "Permanently delete one of the authenticated user's saved items.",
    scopes: ["saved-items:write", "saved-items:delete"],
    annotations: { destructiveHint: true },
    inputSchema: { savedItemId: z.string().min(1) },
  },
  {
    name: "list_folders",
    title: "List folders",
    description: "List the authenticated user's folders.",
    scopes: ["folders:read"],
    annotations: { readOnlyHint: true },
    inputSchema: {},
  },
  {
    name: "add_folder",
    title: "Add folder",
    description: "Create a folder in the authenticated user's Sleevy library.",
    scopes: ["folders:write"],
    annotations: { destructiveHint: false },
    inputSchema: {
      name: z.string().min(1).max(80),
      emoji: z.string().optional(),
      color: z.string().optional(),
    },
  },
  {
    name: "remove_folder",
    title: "Remove folder",
    description: "Permanently remove one of the authenticated user's folders.",
    scopes: ["folders:delete"],
    annotations: { destructiveHint: true },
    inputSchema: { folderId: z.string().min(1) },
  },
] as const satisfies ReadonlyArray<{
  readonly name: string
  readonly title: string
  readonly description: string
  readonly scopes: readonly Scope[]
  readonly annotations: Record<string, boolean>
  readonly inputSchema: z.ZodRawShape
}>

type ToolName = (typeof MCP_TOOL_CATALOG)[number]["name"]

const catalogEntry = (name: ToolName) => MCP_TOOL_CATALOG.find((tool) => tool.name === name)!

/** The registration options every tool shares, taken from the catalogue. */
const describe = (name: ToolName) => {
  const entry = catalogEntry(name)
  return {
    title: entry.title,
    description: entry.description,
    annotations: { ...entry.annotations },
    inputSchema: z.strictObject({ ...entry.inputSchema }),
  }
}

const asText = (value: unknown) => JSON.stringify(value, null, 2)

const textContent = (value: unknown) => ({ content: [{ type: "text" as const, text: asText(value) }] })

// Per the MCP spec, tools returning structuredContent should mirror the
// serialized JSON in a text block; many hosts only surface text to the model.
const structuredContent = (value: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: asText(value) }],
  structuredContent: value,
})

const errorContent = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
})

const folderToDto = (folder: { readonly id: string; readonly name: string; readonly emoji: string | null; readonly color: string | null }) => ({
  id: folder.id,
  name: folder.name,
  emoji: folder.emoji,
  color: folder.color,
})

const savedItemToSummary = ({
  savedItem,
  link,
  metadata,
  enrichment,
  folder,
}: SavedItemWithLink) => ({
  id: savedItem.id,
  title: metadata.title ?? link.host,
  url: link.originalUrl,
  folder: folder ? { id: folder.id, name: folder.name } : null,
  isRead: savedItem.isRead,
  tags: savedItem.tags.length > 0 ? savedItem.tags : enrichment.tags,
  savedAt: savedItem.lastSavedAt.toISOString(),
})



const savedItemSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  folder: z.object({ id: z.string(), name: z.string() }).nullable(),
  isRead: z.boolean(),
  tags: z.array(z.string()),
  savedAt: z.string(),
})

const savedItemsPageOutputSchema = {
  items: z.array(savedItemSummarySchema),
  nextCursor: z.string().nullable(),
}

export class McpTools extends Context.Service<McpTools>()(
  "@app/modules/mcp/McpTools",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig
      const capture = yield* CaptureService
      const enrichment = yield* EnrichmentWorkflow
      const folders = yield* FolderRepository
      const savedItems = yield* SavedItemRepository
      // The MCP SDK forces Promise-based tool callbacks; carry the app context across
      // that boundary so spans and log annotations keep working inside tools.
      const context = yield* Effect.context<never>()
      const runPromise = Effect.runPromiseWith(context)

      const listSavedItems = Effect.fn("McpTools.listSavedItems")(function* (
        userId: UserId,
        limit: number = DEFAULT_PAGE_SIZE,
        cursor?: string,
      ) {
        const decodedCursor = cursor
          ? decodeSavedItemsCursor(cursor)
          : Option.none<SavedItemsPageCursor>()
        if (cursor && Option.isNone(decodedCursor)) return errorContent("Invalid pagination cursor.")

        const page = yield* savedItems.listPageByUser(
          userId,
          Math.min(limit, MAX_PAGE_SIZE),
          Option.getOrUndefined(decodedCursor),
        )
        const result = {
          items: page.items.map(savedItemToSummary),
          nextCursor: page.nextCursor ? encodeSavedItemsCursor(page.nextCursor) : null,
        }
        return structuredContent(result)
      })

      const saveLink = Effect.fn("McpTools.saveLink")(function* (userId: UserId, url: string) {
        const result = yield* capture.save({ userId, url, captureChannel: "api" })
        if (result.enrichment._tag === "start") {
          yield* enrichment.enrich(result.enrichment.linkId).pipe(
            Effect.ignore({ log: true }),
            Effect.forkDetach,
          )
        }
        return textContent({
          captureResult: result.captureResult,
          savedItem: savedItemToDto(result.savedItem),
        })
      })

      const setSavedItemReadState = Effect.fn("McpTools.setSavedItemReadState")(function* (userId: UserId, savedItemId: SavedItemId, isRead: boolean) {
        const existing = yield* savedItems.findByUserAndId(userId, savedItemId)
        if (Option.isNone(existing)) return errorContent("Saved item not found.")
        const updated = yield* savedItems.setReadState(userId, savedItemId, isRead)
        return Option.isSome(updated)
          ? textContent(savedItemToDto(updated.value))
          : errorContent("Saved item not found.")
      })

      const setSavedItemFolder = Effect.fn("McpTools.setSavedItemFolder")(function* (userId: UserId, savedItemId: SavedItemId, folderId: FolderId | null) {
        if (folderId !== null) {
          const folder = yield* folders.findByUserAndId(userId, folderId)
          if (Option.isNone(folder)) return errorContent("Folder not found.")
        }
        const updated = yield* savedItems.setFolder(userId, savedItemId, folderId)
        return Option.isSome(updated)
          ? textContent(savedItemToDto(updated.value))
          : errorContent("Saved item not found.")
      })

      const deleteSavedItem = Effect.fn("McpTools.deleteSavedItem")(function* (userId: UserId, savedItemId: SavedItemId) {
        yield* savedItems.deleteByUserAndId(userId, savedItemId)
        return textContent({ deleted: true, savedItemId })
      })

      const listFolders = Effect.fn("McpTools.listFolders")(function* (userId: UserId) {
        const rows = yield* folders.listByUser(userId)
        return textContent(rows.map(folderToDto))
      })

      const addFolder = Effect.fn("McpTools.addFolder")(function* (userId: UserId, name: string, emoji: string | undefined, color: string | undefined) {
        const normalizedName = name.trim()
        if (normalizedName.length === 0) return errorContent("Folder name must contain between 1 and 80 characters.")
        const existing = yield* folders.findByNormalizedName(userId, normalizedName)
        if (Option.isSome(existing)) return errorContent("A folder with this name already exists.")
        const created = yield* folders.create(userId, normalizedName, emoji ?? null, color ?? null)
        return Option.isSome(created)
          ? textContent(folderToDto(created.value))
          : errorContent("A folder with this name already exists.")
      })

      const removeFolder = Effect.fn("McpTools.removeFolder")(function* (userId: UserId, folderId: FolderId) {
        const removed = yield* folders.deleteByUserAndId(userId, folderId)
        return removed
          ? textContent({ deleted: true, folderId })
          : errorContent("Folder not found.")
      })

      const registerTools = (server: McpServer, userId: UserId, scopes: ReadonlySet<Scope>) => {
        if (scopes.has("saved-items:read")) {
          server.registerTool("list_saved_items", {
            ...describe("list_saved_items"),
            outputSchema: savedItemsPageOutputSchema,
          }, async ({ limit, cursor }) => runPromise(listSavedItems(userId, limit, cursor)))
        }

        if (scopes.has("saved-items:capture")) {
          server.registerTool("save_link", {
            ...describe("save_link"),
          }, async ({ url }) => {
            try {
              return await runPromise(saveLink(userId, url))
            } catch {
              return errorContent("The link could not be saved. Use an HTTP or HTTPS URL.")
            }
          })
        }

        if (scopes.has("saved-items:write")) {
          server.registerTool("set_saved_item_read_state", {
            ...describe("set_saved_item_read_state"),
          }, async ({ savedItemId, isRead }) =>
            runPromise(setSavedItemReadState(userId, savedItemId as SavedItemId, isRead)))

          server.registerTool("set_saved_item_folder", {
            ...describe("set_saved_item_folder"),
          }, async ({ savedItemId, folderId }) =>
            runPromise(setSavedItemFolder(userId, savedItemId as SavedItemId, folderId as FolderId | null)))
        }

        if (scopes.has("saved-items:write") || scopes.has("saved-items:delete")) {
          server.registerTool("delete_saved_item", {
            ...describe("delete_saved_item"),
          }, async ({ savedItemId }) =>
            runPromise(deleteSavedItem(userId, savedItemId as SavedItemId)))
        }

        if (scopes.has("folders:read")) {
          server.registerTool("list_folders", {
            ...describe("list_folders"),
          }, async () => runPromise(listFolders(userId)))
        }

        if (scopes.has("folders:write")) {
          server.registerTool("add_folder", {
            ...describe("add_folder"),
          }, async ({ name, emoji, color }) => runPromise(addFolder(userId, name, emoji, color)))
        }

        if (scopes.has("folders:delete")) {
          server.registerTool("remove_folder", {
            ...describe("remove_folder"),
          }, async ({ folderId }) => runPromise(removeFolder(userId, folderId as FolderId)))
        }
      }

      /**
       * Registers every tool for description only, with a callback that always
       * refuses.
       *
       * This backs the unauthenticated preview: a client may see what Sleevy
       * offers before deciding to send a person through a consent screen. The
       * callbacks still refuse rather than being omitted, so nothing can be
       * invoked here even if a caller reaches this server with a `tools/call` —
       * the HTTP layer already declines those, and this is the second lock.
       */
      const registerToolCatalog = (server: McpServer) => {
        for (const tool of MCP_TOOL_CATALOG) {
          server.registerTool(tool.name, describe(tool.name), async () =>
            errorContent(
              `${tool.name} needs an authenticated Sleevy session. Connect with OAuth at ${config.auth.baseUrl}/mcp, or send an API key as a bearer token. See ${config.auth.webUrl}/auth.md.`,
            ))
        }
      }

      const serve = async (
        request: Request,
        register: (server: McpServer) => void,
      ): Promise<Response> => {
        const server = new McpServer(
          { name: "app.sleevy/mcp", version: "1.0.0", title: "Sleevy" },
          { instructions: SERVER_INSTRUCTIONS },
        )
        register(server)

        const transport = new WebStandardStreamableHTTPServerTransport({
          enableJsonResponse: true,
          allowedOrigins: [...config.auth.trustedOrigins],
          allowedHosts: [new URL(config.auth.baseUrl).host],
          enableDnsRebindingProtection: true,
        })
        await server.connect(transport)
        return transport.handleRequest(request)
      }

      return {
        /** The tool list as an unauthenticated caller may read it. */
        catalogHandler: (request: Request) => serve(request, registerToolCatalog),
        handlerFor: (userId: UserId, scopes: ReadonlySet<Scope>) =>
          (request: Request): Promise<Response> =>
            serve(request, (server) => registerTools(server, userId, scopes)),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(McpTools, McpTools.make)

  static readonly defaultLayer = McpTools.layer.pipe(
    Layer.provide(AppConfig.layer),
    Layer.provide(CaptureService.defaultLayer),
    Layer.provide(EnrichmentWorkflow.defaultLayer),
    Layer.provide(FolderRepository.defaultLayer),
    Layer.provide(SavedItemRepository.defaultLayer),
  )
}
