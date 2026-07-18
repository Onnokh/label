import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { z } from "zod"

import type { FolderId, SavedItemWithLink, UserId } from "../../domain/SavedItem.js"
import { SavedItemId } from "../../domain/SavedItem.js"
import { savedItemToDto } from "../../api/ApiContract.js"
import type { Scope } from "../auth/Scopes.js"
import { CaptureService } from "../capture/CaptureService.js"
import { EnrichmentWorkflow } from "../enrichment/EnrichmentWorkflow.js"
import { FolderRepository } from "../folders/FolderRepository.js"
import { SavedItemRepository } from "../saved-items/SavedItemRepository.js"
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

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100

const SavedItemsCursor = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(
    Schema.fromJsonString(
      Schema.Struct({
        lastSavedAt: Schema.DateFromString.check(Schema.isDateValid()),
        id: SavedItemId,
      }),
    ),
  ),
)

export const encodeSavedItemsCursor = Schema.encodeSync(SavedItemsCursor)
export const decodeSavedItemsCursor = Schema.decodeUnknownOption(SavedItemsCursor)

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
            title: "List saved items",
            description: "List the authenticated user's saved items, newest first. Results are paginated; call again with nextCursor until it is null.",
            inputSchema: {
              limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
              cursor: z.string().min(1).optional(),
            },
            outputSchema: savedItemsPageOutputSchema,
            annotations: { readOnlyHint: true },
          }, async ({ limit, cursor }) => runPromise(listSavedItems(userId, limit, cursor)))
        }

        if (scopes.has("saved-items:capture")) {
          server.registerTool("save_link", {
            title: "Save link",
            description: "Save an HTTP or HTTPS link to the authenticated user's Sleevy library.",
            inputSchema: { url: z.string().url() },
            annotations: { destructiveHint: false, openWorldHint: true },
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
            title: "Set saved item read state",
            description: "Mark one of the authenticated user's saved items as read or unread.",
            inputSchema: { savedItemId: z.string().min(1), isRead: z.boolean() },
            annotations: { destructiveHint: false },
          }, async ({ savedItemId, isRead }) =>
            runPromise(setSavedItemReadState(userId, savedItemId as SavedItemId, isRead)))

          server.registerTool("set_saved_item_folder", {
            title: "Set saved item folder",
            description: "Move a saved item to a folder, or remove it from its folder.",
            inputSchema: { savedItemId: z.string().min(1), folderId: z.string().min(1).nullable() },
            annotations: { destructiveHint: false },
          }, async ({ savedItemId, folderId }) =>
            runPromise(setSavedItemFolder(userId, savedItemId as SavedItemId, folderId as FolderId | null)))
        }

        if (scopes.has("saved-items:write") || scopes.has("saved-items:delete")) {
          server.registerTool("delete_saved_item", {
            title: "Delete saved item",
            description: "Permanently delete one of the authenticated user's saved items.",
            inputSchema: { savedItemId: z.string().min(1) },
            annotations: { destructiveHint: true },
          }, async ({ savedItemId }) =>
            runPromise(deleteSavedItem(userId, savedItemId as SavedItemId)))
        }

        if (scopes.has("folders:read")) {
          server.registerTool("list_folders", {
            title: "List folders",
            description: "List the authenticated user's folders.",
            annotations: { readOnlyHint: true },
          }, async () => runPromise(listFolders(userId)))
        }

        if (scopes.has("folders:write")) {
          server.registerTool("add_folder", {
            title: "Add folder",
            description: "Create a folder in the authenticated user's Sleevy library.",
            inputSchema: {
              name: z.string().min(1).max(80),
              emoji: z.string().optional(),
              color: z.string().optional(),
            },
            annotations: { destructiveHint: false },
          }, async ({ name, emoji, color }) => runPromise(addFolder(userId, name, emoji, color)))
        }

        if (scopes.has("folders:delete")) {
          server.registerTool("remove_folder", {
            title: "Remove folder",
            description: "Permanently remove one of the authenticated user's folders.",
            inputSchema: { folderId: z.string().min(1) },
            annotations: { destructiveHint: true },
          }, async ({ folderId }) => runPromise(removeFolder(userId, folderId as FolderId)))
        }
      }

      return {
        handlerFor: (userId: UserId, scopes: ReadonlySet<Scope>) =>
          async (request: Request): Promise<Response> => {
            const server = new McpServer({ name: "Sleevy", version: "1.0.0" })
            registerTools(server, userId, scopes)

            const transport = new WebStandardStreamableHTTPServerTransport({
              enableJsonResponse: true,
              allowedOrigins: [...config.auth.trustedOrigins],
              allowedHosts: [new URL(config.auth.baseUrl).host],
              enableDnsRebindingProtection: true,
            })
            await server.connect(transport)
            return transport.handleRequest(request)
          },
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
