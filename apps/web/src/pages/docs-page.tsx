import { useState } from "react"
import clsx from "clsx"
import spec from "../../public/openapi.json"
import styles from "./docs-page.module.scss"

type Schema = { type?: string; enum?: string[]; anyOf?: Schema[]; items?: Schema; $ref?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean }
type Parameter = { name: string; in: string; required?: boolean; schema?: Schema }
type Operation = { tags?: string[]; operationId?: string; parameters?: Parameter[]; requestBody?: { required?: boolean; content?: Record<string, { schema: Schema }> }; responses: Record<string, { description: string; content?: Record<string, { schema: Schema }> }> }

const schemaOrder = [
  "FolderDto",
  "FoldersResponse",
  "FolderNamePayload",
  "FolderAssignmentPayload",
  "SavedItemDto",
  "CapturePayload",
  "CaptureCreated",
  "CaptureUpdated",
  "SavedItemsResponse",
  "SavedItemReadStatePayload",
  "HealthResponse",
]

const methodOrder = ["get", "post", "put", "patch", "delete"] as const
const methodColors: Record<string, string> = { get: "#6ee7a2", post: "#ff9da4", put: "#f3c087", patch: "#f3c087", delete: "#ff5f57" }

const groups = buildGroups()

function buildGroups() {
  const map = new Map<string, { method: string; path: string; op: Operation }[]>()
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of methodOrder) {
      const op = (methods as Record<string, Operation>)[method]
      if (!op) continue
      const tag = op.tags?.[0] ?? "other"
      if (!map.has(tag)) map.set(tag, [])
      map.get(tag)!.push({ method, path, op })
    }
  }
  return map
}

const friendlyNames: Record<string, string> = {
  SavedItemDto: "SavedItem",
  SavedItemsResponse: "SavedItemList",
  SavedItemReadStatePayload: "ReadState",
  SavedItemNotFoundError: "NotFound",
  FolderDto: "Folder",
  FoldersResponse: "FolderList",
  FolderNamePayload: "FolderName",
  FolderAssignmentPayload: "FolderAssignment",
  InvalidFolderNameError: "InvalidFolderName",
  FolderNotFoundError: "FolderNotFound",
  FolderNameConflictError: "FolderNameConflict",
  CapturePayload: "CaptureRequest",
  CaptureCreated: "CaptureCreated",
  CaptureUpdated: "CaptureUpdated",
  InvalidUrlError: "InvalidUrl",
  RateLimitExceeded: "RateLimitExceeded",
  Unauthorized: "Unauthorized",
  HealthResponse: "Health",
  "<No Content>": "No Content",
}

function displayName(raw: string): string {
  return friendlyNames[raw] ?? raw
}

function typeLabel(s: Schema): string {
  if (s.$ref) return displayName(s.$ref.split("/").pop()!)
  if (s.anyOf) {
    const types = s.anyOf.map(typeLabel)
    return types.includes("null") ? `${types.find((t) => t !== "null")} | null` : types.join(" | ")
  }
  if (s.type === "array") return `${s.items ? typeLabel(s.items) : "any"}[]`
  if (s.enum) return s.enum.map((v) => `"${v}"`).join(" | ")
  return s.type ?? "any"
}

function schemaAnchor(raw: string): string | null {
  const friendly = friendlyNames[raw]
  return friendly && schemaOrder.includes(raw) ? `schema-${friendly}` : null
}

function TypeLabel({ schema: s }: { schema: Schema }) {
  if (s.$ref) {
    const raw = s.$ref.split("/").pop()!
    const anchor = schemaAnchor(raw)
    const label = displayName(raw)
    if (anchor) return <a className={styles.typeLink} href={`#${anchor}`}>{label}</a>
    return <>{label}</>
  }
  return <>{typeLabel(s)}</>
}

function ParamList({ label, params }: { label: string; params: Parameter[] }) {
  if (params.length === 0) return null
  return (
    <div className={styles.detail}>
      <span className={styles.detailLabel}>{label}</span>
      {params.map((p) => (
        <span key={p.name} className={styles.param}>
          <code>{p.name}</code>
          <code className={styles.paramType}>{p.schema ? typeLabel(p.schema) : "string"}</code>
          {p.required && <span className={styles.required}>required</span>}
        </span>
      ))}
    </div>
  )
}

function Endpoint({ method, path, op }: { method: string; path: string; op: Operation }) {
  const [open, setOpen] = useState(false)
  const bodySchema = op.requestBody?.content?.["application/json"]?.schema
  const bodyRef = bodySchema?.$ref?.split("/").pop()
  const pathParams = op.parameters?.filter((p) => p.in === "path") ?? []
  const queryParams = op.parameters?.filter((p) => p.in === "query") ?? []
  const successCodes = Object.entries(op.responses).filter(([code]) => code.startsWith("2"))
  const errorCodes = Object.entries(op.responses).filter(([code]) => !code.startsWith("2"))

  return (
    <div className={styles.endpoint} data-open={open || undefined}>
      <button className={styles.endpointHeader} onClick={() => setOpen(!open)} type="button">
        <span className={styles.method} style={{ color: methodColors[method] }}>{method.toUpperCase()}</span>
        <span className={styles.path}>{path}</span>
        <svg className={styles.chevron} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" /></svg>
      </button>
      {open && (
        <div className={styles.endpointBody}>
          <ParamList label="Path" params={pathParams} />
          <ParamList label="Query" params={queryParams} />
          {bodyRef && (
            <div className={styles.detail}>
              <span className={styles.detailLabel}>Body</span>
              <code><TypeLabel schema={bodySchema!} /></code>
            </div>
          )}
          <div className={styles.detail}>
            <span className={styles.detailLabel}>Returns</span>
            {successCodes.map(([code, res]) => {
              const resSchema = res.content?.["application/json"]?.schema
              return (
                <span key={code} className={styles.return}>
                  <span className={clsx(styles.status, styles.statusOk)}>{code}</span>
                  {resSchema ? <code><TypeLabel schema={resSchema} /></code> : <span>{displayName(res.description)}</span>}
                </span>
              )
            })}
          </div>
          {errorCodes.length > 0 && (
            <div className={styles.detail}>
              <span className={styles.detailLabel}>Errors</span>
              {errorCodes.map(([code, res]) => (
                <span key={code} className={styles.return}>
                  <span className={clsx(styles.status, styles.statusErr)}>{code}</span>
                  <span>{displayName(res.description)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SchemaDefinition({ name, schema }: { name: string; schema: Schema }) {
  const friendly = displayName(name)
  const [open, setOpen] = useState(false)
  if (!schema.properties) return null
  const entries = Object.entries(schema.properties)

  return (
    <div className={styles.schemaDef} id={`schema-${friendly}`} data-open={open || undefined}>
      <button className={styles.schemaHeader} onClick={() => setOpen(!open)} type="button">
        <span className={styles.schemaName}>{friendly}</span>
        <span className={styles.schemaCount}>{entries.length} {entries.length === 1 ? "field" : "fields"}</span>
        <svg className={styles.chevron} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" /></svg>
      </button>
      {open && (
        <div className={styles.schemaBody}>
          {entries.map(([field, prop]) => (
            <div key={field} className={styles.field}>
              <code className={styles.fieldName}>{field}</code>
              <code className={styles.fieldType}><TypeLabel schema={prop} /></code>
              {schema.required?.includes(field) && <span className={styles.required}>required</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SideNav() {
  return (
    <nav className={styles.sidenav} aria-label="API sections">
      {[...groups.entries()].map(([tag, endpoints]) => (
        <div key={tag} className={styles.sidenavGroup}>
          <a href={`#${tag}`} className={styles.sidenavHeading}>{tag}</a>
          {endpoints.map(({ method, path }) => (
            <a key={`${method}-${path}`} href={`#${tag}`} className={styles.sidenavItem}>
              <span className={styles.sidenavMethod} style={{ color: methodColors[method] }}>{method.toUpperCase()}</span>
              <span>{path}</span>
            </a>
          ))}
        </div>
      ))}
      <div className={styles.sidenavGroup}>
        <a href="#schemas" className={styles.sidenavHeading}>schemas</a>
        {schemaOrder.map((name) => (
          <a key={name} href={`#schema-${displayName(name)}`} className={styles.sidenavItem}>
            {displayName(name)}
          </a>
        ))}
      </div>
    </nav>
  )
}

export function DocsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <SideNav />
        <section className={styles.reference} aria-label="Sleevy API Reference">
          <div className={styles.header}>
            <h1>{spec.info.title}</h1>
            <span className={styles.version}>v{spec.info.version}</span>
          </div>
          <p className={styles.description}>{spec.info.description}</p>
          <p className={styles.meta}>Base URL: <code>https://api.sleevy.app</code></p>
          <p className={styles.meta}>
            All endpoints except <code>/health</code> require an <code>Authorization: Bearer &lt;API_KEY&gt;</code> header.
          </p>
          {[...groups.entries()].map(([tag, endpoints]) => (
            <div key={tag} className={styles.group} id={tag}>
              <h2 className={styles.groupTitle}>{tag}</h2>
              {endpoints.map(({ method, path, op }) => (
                <Endpoint key={`${method}-${path}`} method={method} path={path} op={op} />
              ))}
            </div>
          ))}
          <div className={styles.group} id="schemas">
            <h2 className={styles.groupTitle}>Schemas</h2>
            {schemaOrder.map((name) => {
              const schema = (spec.components.schemas as Record<string, Schema>)[name]
              if (!schema) return null
              return <SchemaDefinition key={name} name={name} schema={schema} />
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
