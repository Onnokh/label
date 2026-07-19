import { describe, expect, test } from "bun:test"
import { Option } from "effect"

import { mcpOAuthVerificationOptions } from "../../src/runtime/McpApp.js"
import {
  decodeSavedItemsCursor,
  encodeSavedItemsCursor,
} from "../../src/modules/mcp/McpTools.js"
import { AUTH_BASE_PATH, authServerUrl } from "../../src/modules/auth/BetterAuth.js"
import type { SavedItemId } from "../../src/domain/SavedItem.js"

describe("Better Auth OAuth server URLs", () => {
  test("uses the explicit Better Auth base path for issuer and JWKS discovery", () => {
    expect(AUTH_BASE_PATH).toBe("/api/auth")
    expect(authServerUrl("https://api.sleevy.app")).toBe(
      "https://api.sleevy.app/api/auth",
    )
  })
})

describe("mcpOAuthVerificationOptions", () => {
  test("uses BetterAuth's authorization-server URL as the JWT issuer", () => {
    expect(mcpOAuthVerificationOptions("https://api.sleevy.app")).toEqual({
      audience: "https://api.sleevy.app/mcp",
      issuer: "https://api.sleevy.app/api/auth",
    })
  })
})

describe("saved item pagination cursors", () => {
  test("round trips an opaque newest-first cursor", () => {
    const cursor = {
      lastSavedAt: new Date("2026-07-18T12:00:00.000Z"),
      id: "saved-item-2" as SavedItemId,
    }

    expect(decodeSavedItemsCursor(encodeSavedItemsCursor(cursor))).toEqual(Option.some(cursor))
    expect(Option.isNone(decodeSavedItemsCursor("not-a-cursor"))).toBe(true)
  })
})
