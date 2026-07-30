import { createContext, use, useMemo, useState, type DragEvent, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { Inbox, Library, Hash, MoreVertical } from "lucide-react"

import { useMoveItemsToSource, useSavedItems, type Topic } from "../../sleevy/saved-items"
import { SAVED_ITEM_DRAG_TYPE, useMoveSavedItemToFolder } from "../../sleevy/folders"
import { ContextMenu, type ContextMenuItem } from "../ui/context-menu/context-menu"
import { getSourceGroup } from "./source-filter-utils"
import styles from "./source-filter.module.scss"

function useNavigateToLibrary() {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (!location.pathname.startsWith("/library")) {
      navigate({ to: "/library" })
    }
  }
}

type SidebarFilters = {
  readonly activeSource: string | null
  readonly setActiveSource: (source: string | null) => void
  readonly activeType: string | null
  readonly setActiveType: (type: string | null) => void
  readonly activeTag: string | null
  readonly setActiveTag: (tag: string | null) => void
}

const SidebarFiltersContext = createContext<SidebarFilters>({
  activeSource: null,
  setActiveSource: () => {},
  activeType: null,
  setActiveType: () => {},
  activeTag: null,
  setActiveTag: () => {},
})

export function useSourceFilter() {
  return use(SidebarFiltersContext)
}

export function SourceFilterProvider({ children }: { children: ReactNode }) {
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const value = useMemo(
    () => ({ activeSource, setActiveSource, activeType, setActiveType, activeTag, setActiveTag }),
    [activeSource, activeType, activeTag],
  )
  return (
    <SidebarFiltersContext.Provider value={value}>
      {children}
    </SidebarFiltersContext.Provider>
  )
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

type SidebarItem = {
  readonly key: string
  readonly label: ReactNode
  readonly count: number
  readonly icon?: ReactNode
  readonly to?: string
  readonly exact?: boolean
  readonly onDrop?: (event: DragEvent<HTMLLIElement>) => void
  readonly menu?: readonly ContextMenuItem[]
}

function SidebarSection({ heading, items, activeValue, onSelect }: {
  heading: string
  items: SidebarItem[]
  activeValue?: string | null
  onSelect?: (value: string | null) => void
}) {
  if (items.length === 0) return null

  return (
    <div className={styles.section}>
      <h3 className={styles.heading}>{heading}</h3>
      <ul className={styles.list}>
        {items.map((item) => {
          const isActive = activeValue !== undefined
            ? activeValue === item.key
            : undefined
          const className = `${styles.item} ${isActive ? styles.active : ""}`

          const content = (
            <>
              {item.icon && <span className={styles.icon}>{item.icon}</span>}
              <span className={styles.name}>{item.label}</span>
              <span className={styles.count}>{formatCount(item.count)}</span>
            </>
          )

          return (
            <li
              key={item.key}
              onDragOver={item.onDrop ? (event) => event.preventDefault() : undefined}
              onDrop={item.onDrop}
            >
              {item.to ? (
                <Link
                  to={item.to}
                  className={styles.item}
                  activeOptions={item.exact ? { exact: true } : undefined}
                  activeProps={{ className: `${styles.item} ${styles.active}` }}
                >
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  className={className}
                  onClick={() => onSelect?.(activeValue === item.key ? null : item.key)}
                >
                  {content}
                </button>
              )}
              {item.menu && item.menu.length > 0 ? (
                <div className={styles.menu}>
                  <ContextMenu
                    items={item.menu}
                    triggerClassName={styles.trigger}
                    triggerLabel={<MoreVertical size={14} />}
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function LibraryNav() {
  const { data } = useSavedItems()
  const moveMutation = useMoveSavedItemToFolder()
  const items = data?.savedItems ?? []
  const unreadCount = items.filter((i) => !i.isRead).length
  const totalCount = items.filter((item) => item.folder === null).length

  return (
    <SidebarSection
      heading="Sleeve"
      items={[
        { key: "inbox", label: "Inbox", count: unreadCount, icon: <Inbox size={14} />, to: "/inbox", exact: true },
        {
          key: "library",
          label: "Library",
          count: totalCount,
          icon: <Library size={14} />,
          to: "/library",
          exact: true,
          onDrop: (event) => {
            event.preventDefault()
            const itemId = event.dataTransfer.getData(SAVED_ITEM_DRAG_TYPE)
            if (itemId) moveMutation.mutate({ itemId, folderId: null })
          },
        },
      ]}
    />
  )
}

export function TagFilterList() {
  const { data } = useSavedItems()
  const { activeTag, setActiveTag } = useSourceFilter()
  const goToLibrary = useNavigateToLibrary()

  const items = data?.savedItems ?? []
  const tagCounts = new Map<string, number>()
  for (const item of items) {
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }

  const entries: SidebarItem[] = [...tagCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ key: tag, label: tag, count, icon: <Hash size={14} /> }))

  const handleSelect = (value: string | null) => {
    setActiveTag(value)
    goToLibrary()
  }

  return (
    <SidebarSection
      heading="Tags"
      items={entries}
      activeValue={activeTag}
      onSelect={handleSelect}
    />
  )
}

export function SourceFilterList() {
  const { data } = useSavedItems()
  const { activeSource, setActiveSource } = useSourceFilter()
  const goToLibrary = useNavigateToLibrary()
  const moveMutation = useMoveItemsToSource()

  const items = data?.savedItems ?? []
  const groupCounts = new Map<string, number>()
  const groupItemIds = new Map<string, string[]>()
  for (const item of items) {
    const group = getSourceGroup(item)
    if (group) {
      groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1)
      const ids = groupItemIds.get(group) ?? []
      ids.push(item.id)
      groupItemIds.set(group, ids)
    }
  }

  const groupNames = [...groupCounts.keys()]
  const entries: SidebarItem[] = [...groupCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      const targets = groupNames.filter((other) => other !== name)
      const menu: ContextMenuItem[] = targets.length > 0
        ? [{
            key: "move",
            label: "Move items to",
            items: targets.map((target) => ({
              key: target,
              label: target,
              onClick: () => moveMutation.mutate({ itemIds: groupItemIds.get(name) ?? [], sourceName: target }),
            })),
          }]
        : []
      return { key: name, label: name, count, menu: menu.length > 0 ? menu : undefined }
    })

  const handleSelect = (value: string | null) => {
    setActiveSource(value)
    goToLibrary()
  }

  return (
    <SidebarSection
      heading="Sources"
      items={entries}
      activeValue={activeSource}
      onSelect={handleSelect}
    />
  )
}
