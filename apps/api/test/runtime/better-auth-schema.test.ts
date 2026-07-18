import { describe, expect, it } from "bun:test"

import * as generated from "../../src/modules/persistence/better-auth.generated.js"
import { schema } from "../../src/modules/persistence/schema.js"

// The drizzle adapter resolves tables via schema[model], where model is the
// Better Auth model name — which matches the generated export name. A table
// present in the generated file but absent from `schema` fails at runtime
// with "The model X was not found in the schema object" (prod incident,
// 2026-07-18: jwks/oauth* were generated and migrated but never added).
describe("better-auth adapter schema", () => {
  it("includes every generated Better Auth table under its model name", () => {
    const generatedModels = Object.keys(generated).filter(
      (key) => typeof generated[key as keyof typeof generated] === "object",
    )
    const missing = generatedModels.filter((model) => !(model in schema))
    expect(missing).toEqual([])
  })
})
