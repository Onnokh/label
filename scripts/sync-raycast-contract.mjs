#!/usr/bin/env bun
// Generate apps/raycast-plugin/src/contract/index.ts from packages/contract.
//
// Raycast plugins cannot be Bun workspace members and we don't want to bundle
// Effect into the Raycast plugin. So we vendor a plain-TypeScript projection
// of the contract: the same enum constants, plus pre-resolved encoded types
// for every Schema.Class. The generated file has zero runtime dependencies.
//
// Husky's pre-commit hook runs this and stages any drift, so the vendored
// copy can never lag behind the SSOT.

import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CONTRACT_SRC = resolve(ROOT, "packages/contract/src/index.ts")
const OUT_FILE = resolve(ROOT, "apps/raycast-plugin/src/contract/index.ts")

// Names of Schema.Class exports whose `.Encoded` namespace alias we vendor.
// Listed explicitly rather than auto-discovered so adding a new contract type
// is a conscious, reviewable step.
const SCHEMAS = [
  "FolderDto",
  "FoldersResponse",
  "SavedItemDto",
  "SavedItemsResponse",
  "CaptureCreated",
  "CaptureUpdated",
  "HealthResponse",
  "CapturePayload",
  "SavedItemReadStatePayload",
  "SavedItemsQuery",
  "FolderNamePayload",
  "FolderAssignmentPayload",
  "Unauthorized",
  "RateLimitExceeded",
  "InvalidUrlError",
  "SavedItemNotFoundError",
  "InvalidFolderNameError",
  "FolderNotFoundError",
  "FolderNameConflictError",
]

const ENUMS = [
  { array: "linkTypes", union: "LinkType" },
  { array: "topics", union: "Topic" },
  { array: "captureChannels", union: "CaptureChannel" },
  { array: "enrichmentStatuses", union: "EnrichmentStatus" },
  { array: "savedItemSorts", union: "SavedItemSort" },
]

// Build a TS program that includes a probe file forcing each Encoded type to
// be referenced, so the checker can resolve them concretely. We write the
// probe to disk in packages/contract/src so it shares the tsconfig context,
// then clean it up.
const CONTRACT_DIR = dirname(CONTRACT_SRC)
const PROBE_PATH = resolve(CONTRACT_DIR, "__raycast_probe__.ts")
const probeFile = `import type { Schema } from "effect"
import * as C from "./index.js"

${SCHEMAS.map((name) => `export type ${name} = Schema.Codec.Encoded<typeof C.${name}>`).join("\n")}

${ENUMS.map((e) => `export const ${e.array} = C.${e.array}\nexport type ${e.union} = C.${e.union}`).join("\n")}
`

const { unlinkSync } = await import("node:fs")
writeFileSync(PROBE_PATH, probeFile, "utf8")

let program, checker, probeSource
try {
  const tsconfigPath = resolve(ROOT, "packages/contract/tsconfig.json")
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    resolve(ROOT, "packages/contract"),
  )
  const compilerOptions = {
    ...parsed.options,
    noEmit: true,
    declaration: false,
  }

  program = ts.createProgram([CONTRACT_SRC, PROBE_PATH], compilerOptions)
  checker = program.getTypeChecker()
  probeSource = program.getSourceFile(PROBE_PATH)
  if (!probeSource) {
    throw new Error(`Probe file not loaded: ${PROBE_PATH}`)
  }
} catch (err) {
  try { unlinkSync(PROBE_PATH) } catch {}
  throw err
}

const typeFormatFlags =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.InTypeAlias |
  ts.TypeFormatFlags.UseFullyQualifiedType |
  ts.TypeFormatFlags.NoTypeReduction

const resolvedSchemas = new Map()
const resolvedEnumUnions = new Map()
const resolvedEnumArrays = new Map()

ts.forEachChild(probeSource, (node) => {
  if (ts.isTypeAliasDeclaration(node)) {
    const name = node.name.text
    const type = checker.getTypeAtLocation(node.type)
    const str = checker.typeToString(type, node, typeFormatFlags)
    if (SCHEMAS.includes(name)) {
      resolvedSchemas.set(name, str)
    } else if (ENUMS.some((e) => e.union === name)) {
      resolvedEnumUnions.set(name, str)
    }
  } else if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const name = decl.name.text
        const enumEntry = ENUMS.find((e) => e.array === name)
        if (enumEntry) {
          const type = checker.getTypeAtLocation(decl)
          const str = checker.typeToString(type, decl, typeFormatFlags)
          resolvedEnumArrays.set(name, str)
        }
      }
    }
  }
})

// Sanity check
for (const name of SCHEMAS) {
  if (!resolvedSchemas.has(name)) {
    throw new Error(`Failed to resolve schema type for ${name}`)
  }
}
for (const { array, union } of ENUMS) {
  if (!resolvedEnumArrays.has(array)) {
    throw new Error(`Failed to resolve enum array ${array}`)
  }
  if (!resolvedEnumUnions.has(union)) {
    throw new Error(`Failed to resolve enum union ${union}`)
  }
}

const banner = `// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
// Source: packages/contract/src/index.ts
// Generator: scripts/sync-raycast-contract.mjs (run by Husky pre-commit hook)
// =============================================================================
`

const enumsBlock = ENUMS.map(({ array, union }) => {
  // typeToString prints array types verbosely; reconstruct from the original
  // contract source by parsing the array literal from the type. For const
  // arrays it returns a tuple type; use that directly as the const assertion.
  const tuple = resolvedEnumArrays.get(array)
  const unionType = resolvedEnumUnions.get(union)
  return `export const ${array} = ${tupleToConstLiteral(tuple)} as const
export type ${union} = ${unionType}`
}).join("\n\n")

const schemasBlock = SCHEMAS.map(
  (name) => `export type ${name} = ${resolvedSchemas.get(name)}`,
).join("\n\n")

const captureResponse = `export type CaptureResponse = CaptureCreated | CaptureUpdated

export type ApiError =
  | Unauthorized
  | RateLimitExceeded
  | InvalidUrlError
  | SavedItemNotFoundError
  | InvalidFolderNameError
  | FolderNotFoundError
  | FolderNameConflictError`

const output = `${banner}
${enumsBlock}

${schemasBlock}

${captureResponse}
`

// typeToString for `readonly ["a", "b"]` already prints a tuple form; convert
// to an array literal for `as const` syntax.
function tupleToConstLiteral(typeStr) {
  // Strip leading "readonly " if present, then convert tuple syntax to array.
  const inner = typeStr.replace(/^readonly\s+/, "").trim()
  // It's already `["a", "b", ...]` form — fine as-is.
  return inner
}

// Format with the Raycast plugin's own Prettier (same version `ray lint`
// enforces) so the vendored file never trips the Store's lint check. No
// Prettier config exists in the repo, so defaults match `ray lint` exactly.
const prettier = createRequire(
  resolve(ROOT, "apps/raycast-plugin/package.json"),
)("prettier")
const formatted = await prettier.format(output, { parser: "typescript" })

mkdirSync(dirname(OUT_FILE), { recursive: true })
writeFileSync(OUT_FILE, formatted, "utf8")

try { unlinkSync(PROBE_PATH) } catch {}

console.log(`✓ Synced ${SCHEMAS.length} schemas + ${ENUMS.length} enums → ${OUT_FILE.replace(ROOT, ".")}`)
