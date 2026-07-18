import { describe, expect, test } from "bun:test"

import { mcpOAuthVerificationOptions } from "../../src/runtime/McpApp.js"

describe("mcpOAuthVerificationOptions", () => {
  test("uses BetterAuth's authorization-server URL as the JWT issuer", () => {
    expect(mcpOAuthVerificationOptions("https://api.sleevy.app")).toEqual({
      audience: "https://api.sleevy.app/mcp",
      issuer: "https://api.sleevy.app/api/auth",
    })
  })
})
