import { createContext, use, useMemo, useState, type DragEvent, type ReactNode } from "react"
import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { ChevronRight, Inbox, Keyboard, Library, Hash, MoreVertical, Settings, SquarePlus } from "lucide-react"

import { useKeyboardNav } from "../../contexts/keyboard-nav-context"
import { useSidebarSheet } from "../app-layout/sidebar-sheet"
import { useMoveItemsToSource, useSavedItems, type Topic } from "../../sleevy/saved-items"
import { SAVED_ITEM_DRAG_TYPE, useMoveSavedItemToFolder } from "../../sleevy/folders"
import { ContextMenu, type ContextMenuItem } from "../ui/context-menu/context-menu"
import { byCountDescending, getSourceGroup, sourceCountsOf, tagCountsOf } from "./source-filter-utils"
import styles from "./source-filter.module.scss"

const SECTION_STORAGE_PREFIX = "sleevy:sidebar-section:"
const isServer = typeof window === "undefined"

// Sections start open, so a reader who has never closed one sees the sidebar
// exactly as before. Only an explicit close is worth remembering.
function storedSectionOpen(heading: string | undefined): boolean {
  if (isServer || heading === undefined) return true
  return localStorage.getItem(SECTION_STORAGE_PREFIX + heading) !== "closed"
}

function rememberSectionOpen(heading: string, open: boolean) {
  localStorage.setItem(SECTION_STORAGE_PREFIX + heading, open ? "open" : "closed")
}

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
  // Filter rows carry a count; action rows have nothing to count.
  readonly count?: number
  readonly icon?: ReactNode
  readonly to?: string
  readonly exact?: boolean
  readonly onClick?: () => void
  readonly onDrop?: (event: DragEvent<HTMLLIElement>) => void
  readonly menu?: readonly ContextMenuItem[]
}

function SidebarSection({ heading, items, activeValue, onSelect, collapsible = false }: {
  // A section without a heading is a bare group of rows.
  heading?: string
  items: SidebarItem[]
  activeValue?: string | null
  onSelect?: (value: string | null) => void
  // A collapsible section is a disclosure the reader can close. Open is the
  // state it starts in, so the sidebar reads the same as before on first paint.
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(() => storedSectionOpen(heading))
  // Acting on a row is the end of the reader's errand in the sidebar. In a
  // sheet the row's own result is behind it, so the sheet has to go. Selecting
  // a filter cannot be left to the route change alone: narrowing the Library
  // from the Library keeps the same path.
  const { close } = useSidebarSheet()

  if (items.length === 0) return null

  const renderList = (rows: SidebarItem[]) => (
    <ul className={styles.list}>
      {rows.map((item) => {
        const isActive = activeValue !== undefined
          ? activeValue === item.key
          : undefined
        const className = `${styles.item} ${isActive ? styles.active : ""}`

        const content = (
          <>
            {item.icon && <span className={styles.icon}>{item.icon}</span>}
            <span className={styles.name}>{item.label}</span>
            {item.count === undefined ? null : (
              <span className={styles.count}>{formatCount(item.count)}</span>
            )}
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
                onClick={close}
              >
                {content}
              </Link>
            ) : (
              <button
                type="button"
                className={className}
                onClick={() => {
                  if (item.onClick) item.onClick()
                  else onSelect?.(activeValue === item.key ? null : item.key)
                  close()
                }}
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
  )

  if (collapsible && heading !== undefined) {
    // A closed section still shows whatever is filtering the Library, so the
    // reader never loses sight of why they are seeing a narrowed list.
    const activeRows = items.filter((item) => item.key === activeValue)

    return (
      <div className={styles.section}>
        {/* `open` is held in state rather than set as a bare attribute: the
            sidebar re-renders on every saved-items refetch, and React would
            otherwise push the section back open under the reader. */}
        <details
          className={styles.disclosure}
          open={open}
          onToggle={(event) => {
            const next = event.currentTarget.open
            rememberSectionOpen(heading, next)
            setOpen(next)
          }}
        >
          <summary className={styles.summary}>
            <h3 className={styles.heading}>{heading}</h3>
            <ChevronRight className={styles.chevron} size={12} aria-hidden="true" />
          </summary>
          {renderList(items)}
        </details>
        {!open && activeRows.length > 0 ? renderList(activeRows) : null}
      </div>
    )
  }

  return (
    <div className={styles.section}>
      {heading === undefined ? null : <h3 className={styles.heading}>{heading}</h3>}
      {renderList(items)}
    </div>
  )
}

export function SidebarActions() {
  const navigate = useNavigate()
  const { openCaptureDialog, setHelpOpen } = useKeyboardNav()

  return (
    <SidebarSection
      items={[
        {
          key: "capture",
          label: "Capture item",
          icon: <SquarePlus size={14} />,
          onClick: () => openCaptureDialog(),
        },
        {
          key: "settings",
          label: "Settings",
          icon: <Settings size={14} />,
          to: "/settings",
        },
        {
          key: "shortcuts",
          label: "Keyboard shortcuts",
          icon: <Keyboard size={14} />,
          onClick: () => setHelpOpen(true),
        },
      ]}
    />
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
  const entries: SidebarItem[] = byCountDescending(tagCountsOf(items))
    .map(([tag, count]) => ({ key: tag, label: tag, count, icon: <Hash size={14} /> }))

  const handleSelect = (value: string | null) => {
    setActiveTag(value)
    goToLibrary()
  }

  return (
    <SidebarSection
      heading="Tags"
      collapsible
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
  const groupCounts = sourceCountsOf(items)
  const groupItemIds = new Map<string, string[]>()
  for (const item of items) {
    const group = getSourceGroup(item)
    if (group) {
      const ids = groupItemIds.get(group) ?? []
      ids.push(item.id)
      groupItemIds.set(group, ids)
    }
  }

  const groupNames = [...groupCounts.keys()]
  const entries: SidebarItem[] = byCountDescending(groupCounts)
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
      collapsible
      items={entries}
      activeValue={activeSource}
      onSelect={handleSelect}
    />
  )
}
