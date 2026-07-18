import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page"
import type { TOCItemType } from "fumadocs-core/toc"
import { useState, type ReactNode } from "react"
import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react"

import styles from "./docs-page.module.scss"

type DocsArticleProps = {
  title: string
  description: string
  toc: TOCItemType[]
  children: ReactNode
  previous?: { name: string; description: string; url: string }
  next?: { name: string; description: string; url: string }
}

export function DocsArticle({ title, description, toc, children, previous, next }: DocsArticleProps) {
  return (
    <DocsPage
      className={styles.page}
      toc={toc}
      breadcrumb={{ enabled: false }}
      footer={{ enabled: true, items: { previous, next } }}
    >
      <DocsTitle>{title}</DocsTitle>
      <DocsDescription>{description}</DocsDescription>
      <PageActions title={title} description={description} />
      <DocsBody>{children}</DocsBody>
    </DocsPage>
  )
}

function PageActions({ title, description }: { title: string; description: string }) {
  const [copied, setCopied] = useState(false)

  const copyMarkdown = async () => {
    const markdown = `# ${title}\n\n${description}\n\n${window.location.href}`
    await navigator.clipboard?.writeText(markdown)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className={styles.actions}>
      <button className={`${styles.actionButton} ${styles.copyButton}`} type="button" onClick={copyMarkdown}>
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        {copied ? "Copied" : "Copy Markdown"}
      </button>
      <details className={styles.openMenu}>
        <summary className={styles.actionButton}>Open <ChevronDown size={15} aria-hidden="true" /></summary>
        <div className={styles.menu}>
          <a href="https://github.com/Onnokh/sleevy" target="_blank" rel="noreferrer">
            <span>Open in GitHub</span><ExternalLink size={14} aria-hidden="true" />
          </a>
          <a href="/docs/api-reference">
            <span>Open API reference</span><ExternalLink size={14} aria-hidden="true" />
          </a>
          <a href="/openapi.json" target="_blank" rel="noreferrer">
            <span>View OpenAPI schema</span><ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </details>
    </div>
  )
}

export function CodeBlock({ children }: { children: string }) {
  return <pre className={styles.code}><code>{children}</code></pre>
}

export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className={styles.callout}>
      <span className={styles.calloutDot} aria-hidden="true">i</span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </aside>
  )
}
