import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import { createAuthClient } from "better-auth/client"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Effect, Option } from "effect"
import { z } from "zod"

import type { FolderId, SavedItemId, UserId } from "../domain/SavedItem.js"
import { savedItemToDto } from "../api/ApiContract.js"
import { BetterAuth } from "../modules/auth/BetterAuth.js"
import { CaptureService } from "../modules/capture/CaptureService.js"
import { EnrichmentWorkflow } from "../modules/enrichment/EnrichmentWorkflow.js"
import { FolderRepository } from "../modules/folders/FolderRepository.js"
import { type Scope, V1_SCOPES, permissionsToScopes } from "../modules/auth/Scopes.js"
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js"
import { AppConfig } from "./Config.js"

export const MCP_SCOPES = [
  "saved-items:capture",
  "saved-items:read",
  "saved-items:write",
  "saved-items:delete",
  "folders:read",
  "folders:write",
  "folders:delete",
] as const satisfies readonly Scope[]

const bearerCredential = (authorization: string | null) =>
  authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null

const oauthScopes = (scope: unknown): ReadonlySet<Scope> =>
  typeof scope === "string"
    ? new Set(scope.split(" ").filter((value): value is Scope => V1_SCOPES.includes(value as Scope)))
    : new Set()

const asText = (value: unknown) => JSON.stringify(value, null, 2)

const runPromise = Effect.runPromise

const textContent = (value: unknown) => ({ content: [{ type: "text" as const, text: asText(value) }] })

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

const unauthorized = (baseUrl: string) =>
  new Response("Missing valid credentials or saved-items:read scope.", {
    status: 401,
    headers: {
      "www-authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp"`,
    },
  })

export const makeMcpWebHandler = Effect.gen(function* () {
  const config = yield* AppConfig
  const { auth } = yield* BetterAuth
  const capture = yield* CaptureService
  const enrichment = yield* EnrichmentWorkflow
  const folders = yield* FolderRepository
  const savedItems = yield* SavedItemRepository
  const oauthClient = createAuthClient({ plugins: [oauthProviderResourceClient(auth)] })

  return async (request: Request): Promise<Response> => {
    const credential = bearerCredential(request.headers.get("authorization"))
    if (!credential) return unauthorized(config.auth.baseUrl)

    let userId: UserId | undefined
    let scopes: ReadonlySet<Scope> | undefined
    const apiKey = await auth.api.verifyApiKey({ body: { key: credential } })
    if (apiKey.valid && apiKey.key) {
      userId = apiKey.key.referenceId as UserId
      scopes = permissionsToScopes(apiKey.key.permissions ?? null)
    } else {
      try {
        const token = await oauthClient.verifyAccessToken(credential, {
          verifyOptions: { audience: `${config.auth.baseUrl}/mcp` },
        })
        if (typeof token.sub === "string") {
          userId = token.sub as UserId
          scopes = oauthScopes(token.scope)
        }
      } catch {
        // Return the same neutral 401 response for invalid API keys and tokens.
      }
    }

    if (!userId || !scopes || !MCP_SCOPES.some((scope) => scopes.has(scope))) {
      return unauthorized(config.auth.baseUrl)
    }

    const server = new McpServer({ name: "Sleevy", version: "1.0.0" })
    if (scopes.has("saved-items:read")) {
      server.registerTool("list_saved_items", {
        title: "List saved items",
        description: "List the authenticated user's saved items, newest first.",
        annotations: { readOnlyHint: true },
      }, async () => {
        const items = await runPromise(savedItems.listByUser(userId!, "newest"))
        return textContent(items.map(savedItemToDto))
      })
    }

    if (scopes.has("saved-items:capture")) {
      server.registerTool("save_link", {
        title: "Save link",
        description: "Save an HTTP or HTTPS link to the authenticated user's Sleevy library.",
        inputSchema: { url: z.string().url() },
        annotations: { destructiveHint: false, openWorldHint: true },
      }, async ({ url }) => {
        try {
          const result = await runPromise(capture.save({ userId: userId!, url, captureChannel: "api" }))
          if (result.enrichment._tag === "start") {
            void runPromise(enrichment.enrich(result.enrichment.linkId).pipe(Effect.ignore({ log: true })))
          }
          return textContent({
            captureResult: result.captureResult,
            savedItem: savedItemToDto(result.savedItem),
          })
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
      }, async ({ savedItemId, isRead }) => {
        const existing = await runPromise(savedItems.findByUserAndId(userId!, savedItemId as SavedItemId))
        if (Option.isNone(existing)) return errorContent("Saved item not found.")
        const updated = await runPromise(savedItems.setReadState(userId!, savedItemId as SavedItemId, isRead))
        return Option.isSome(updated)
          ? textContent(savedItemToDto(updated.value))
          : errorContent("Saved item not found.")
      })

      server.registerTool("set_saved_item_folder", {
        title: "Set saved item folder",
        description: "Move a saved item to a folder, or remove it from its folder.",
        inputSchema: { savedItemId: z.string().min(1), folderId: z.string().min(1).nullable() },
        annotations: { destructiveHint: false },
      }, async ({ savedItemId, folderId }) => {
        if (folderId !== null) {
          const folder = await runPromise(folders.findByUserAndId(userId!, folderId as FolderId))
          if (Option.isNone(folder)) return errorContent("Folder not found.")
        }
        const updated = await runPromise(savedItems.setFolder(
          userId!,
          savedItemId as SavedItemId,
          folderId as FolderId | null,
        ))
        return Option.isSome(updated)
          ? textContent(savedItemToDto(updated.value))
          : errorContent("Saved item not found.")
      })
    }

    if (scopes.has("saved-items:write") || scopes.has("saved-items:delete")) {
      server.registerTool("delete_saved_item", {
        title: "Delete saved item",
        description: "Permanently delete one of the authenticated user's saved items.",
        inputSchema: { savedItemId: z.string().min(1) },
        annotations: { destructiveHint: true },
      }, async ({ savedItemId }) => {
        await runPromise(savedItems.deleteByUserAndId(userId!, savedItemId as SavedItemId))
        return textContent({ deleted: true, savedItemId })
      })
    }

    if (scopes.has("folders:read")) {
      server.registerTool("list_folders", {
        title: "List folders",
        description: "List the authenticated user's folders.",
        annotations: { readOnlyHint: true },
      }, async () => textContent((await runPromise(folders.listByUser(userId!))).map(folderToDto)))
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
      }, async ({ name, emoji, color }) => {
        const normalizedName = name.trim()
        if (normalizedName.length === 0) return errorContent("Folder name must contain between 1 and 80 characters.")
        const existing = await runPromise(folders.findByNormalizedName(userId!, normalizedName))
        if (Option.isSome(existing)) return errorContent("A folder with this name already exists.")
        const created = await runPromise(folders.create(userId!, normalizedName, emoji ?? null, color ?? null))
        return Option.isSome(created)
          ? textContent(folderToDto(created.value))
          : errorContent("A folder with this name already exists.")
      })
    }

    if (scopes.has("folders:delete")) {
      server.registerTool("remove_folder", {
        title: "Remove folder",
        description: "Permanently remove one of the authenticated user's folders.",
        inputSchema: { folderId: z.string().min(1) },
        annotations: { destructiveHint: true },
      }, async ({ folderId }) => {
        const removed = await runPromise(folders.deleteByUserAndId(userId!, folderId as FolderId))
        return removed
          ? textContent({ deleted: true, folderId })
          : errorContent("Folder not found.")
      })
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      allowedOrigins: [...config.auth.trustedOrigins],
      allowedHosts: [new URL(config.auth.baseUrl).host],
      enableDnsRebindingProtection: true,
    })
    await server.connect(transport)
    return transport.handleRequest(request)
  }
})
