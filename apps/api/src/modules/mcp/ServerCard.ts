import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js"

import { MCP_TOOL_CATALOG } from "./McpTools.js"

export const MCP_SERVER_CARD_CONTENT_TYPE =
  "application/mcp-server-card+json; charset=utf-8"

/**
 * The MCP Server Card body.
 *
 * A card is read before a transport is opened, so it lists every tool the
 * server can expose, from the same catalogue `registerTools` registers from.
 * Which of those a given session actually sees depends on the scopes it was
 * granted, which is why each tool names the scopes that unlock it.
 *
 * This lives apart from the route so the card the API serves and the copy
 * published under the web origin's well-known namespace are built from one
 * definition and cannot describe different servers.
 */
export const mcpServerCard = (input: {
  readonly apiBaseUrl: string
  readonly webUrl: string
}) => {
  const serverUrl = `${input.apiBaseUrl}/mcp`

  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: "app.sleevy/mcp",
    version: "1.0.0",
    title: "Sleevy",
    description:
      "Save links to your Sleevy library and manage your saved items and folders.",
    websiteUrl: input.webUrl,
    documentationUrl: `${input.webUrl}/docs/mcp`,
    // `remotes` is the Server Card shape; `serverUrl` and `transport` are the
    // flat fields most client previews and directory scanners read. Both
    // describe the same endpoint.
    serverUrl,
    transport: "streamable-http",
    remotes: [
      {
        type: "streamable-http",
        url: serverUrl,
        supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      },
    ],
    tools: MCP_TOOL_CATALOG.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      requiredScopes: [...tool.scopes],
      annotations: { ...tool.annotations },
    })),
  } as const
}
