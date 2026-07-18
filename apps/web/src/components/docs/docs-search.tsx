import { useMemo, useState } from "react"
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SearchDialogProps,
} from "fumadocs-ui/components/dialog/search"
import type { DefaultSearchDialogProps } from "fumadocs-ui/components/dialog/search-default"

import styles from "./docs-search.module.scss"

const pages = [
  ["Sleevy API", "/docs", "Overview and the core API flow"],
  ["Getting started", "/docs/getting-started", "Create a key, save a URL, and read your queue"],
  ["Create an API key", "/docs/getting-started#create-an-api-key", "Getting started"],
  ["Save your first URL", "/docs/getting-started#save-your-first-url", "Getting started"],
  ["Read your queue", "/docs/getting-started#read-your-queue", "Getting started"],
  ["Save and organize links", "/docs/guides", "Practical workflow guides"],
  ["Core concepts", "/docs/concepts", "Captures, saved items, read state, and folders"],
  ["Captures become saved items", "/docs/concepts#captures-become-saved-items", "Core concepts"],
  ["Read state and folders", "/docs/concepts#read-state-and-folders", "Core concepts"],
  ["Build around stable IDs", "/docs/concepts#build-around-stable-ids", "Core concepts"],
  ["Authentication", "/docs/authentication", "API reference"],
  ["Errors", "/docs/errors", "API reference"],
  ["Rate limits", "/docs/rate-limits", "API reference"],
  ["OpenAPI reference", "/docs/api-reference", "Generated endpoint reference"],
  ["Save from any tool", "/docs/guides#save-from-any-tool", "Guides"],
  ["Build a reading view", "/docs/guides#build-a-reading-view", "Guides"],
  ["Update reading state", "/docs/guides#update-reading-state", "Guides"],
  ["Organize with folders", "/docs/guides#organize-with-folders", "Guides"],
] as const

type DocsSearchProps = DefaultSearchDialogProps & Partial<SearchDialogProps>

export function DocsSearchDialog({ open = false, onOpenChange = () => undefined }: DocsSearchProps) {
  const [search, setSearch] = useState("")
  const results = useMemo(() => {
    const query = search.trim().toLowerCase()
    return pages
      .filter(([title, url, description]) => !query || `${title} ${url} ${description}`.toLowerCase().includes(query))
      .map(([title, url, description]) => ({
        id: url,
        type: "action" as const,
        node: <span className={styles.result}><strong>{title}</strong><small>{description}</small></span>,
        onSelect: () => { window.location.href = url },
      }))
  }, [search])

  return (
    <SearchDialog open={open} onOpenChange={onOpenChange} search={search} onSearchChange={setSearch}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogInput placeholder="Search documentation..." />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={results} Empty={() => <p>No matching documentation.</p>} />
      </SearchDialogContent>
    </SearchDialog>
  )
}
