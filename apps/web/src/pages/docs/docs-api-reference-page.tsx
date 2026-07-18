import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page"
import { createOpenAPIPage } from "fumadocs-openapi/ui"
import type { OperationItem } from "fumadocs-openapi"
import type { TOCItemType } from "fumadocs-core/toc"
import schema from "../../../public/openapi.json"

import styles from "./docs-api-reference-page.module.scss"

const operationMethods = ["get", "post", "put", "patch", "delete", "options", "head", "trace"] as const
const operationEntries = Object.entries(schema.paths ?? {}).flatMap(([path, item]) =>
  operationMethods.filter((method) => item && method in item).map((method) => ({
    path,
    method,
    operation: item ? (item as Record<string, unknown>)[method] : undefined,
  })),
)

const operations: OperationItem[] = operationEntries.map(({ path, method }) => ({ path, method }))

function operationTitle(operation: unknown, path: string) {
  if (!operation || typeof operation !== "object") return path
  const entry = operation as { summary?: string; operationId?: string }
  if (entry.summary) return entry.summary
  if (entry.operationId) {
    const name = entry.operationId.split(".").pop() ?? entry.operationId
    return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (value: string) => value.toUpperCase())
  }
  return path
}

const toc: TOCItemType[] = operationEntries.map(({ operation, path }) => {
  const title = operationTitle(operation, path)
  return { title, url: `#${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, depth: 2 }
})

const OpenAPIPage = createOpenAPIPage({
  storageKeyPrefix: "sleevy-openapi-",
  playground: { enabled: false },
})

export function DocsApiReferencePage() {
  return (
    <DocsPage breadcrumb={{ enabled: false }} toc={toc}>
      <DocsTitle>API reference</DocsTitle>
      <DocsDescription>Generated from Sleevy’s OpenAPI schema. Browse every endpoint, parameter, request body, and response.</DocsDescription>
      <DocsBody>
        <div className={styles.apiReference}>
          <OpenAPIPage document="sleevy" showTitle showDescription operations={operations} payload={{ bundled: schema as never }} />
        </div>
      </DocsBody>
    </DocsPage>
  )
}
