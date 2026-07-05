import type { ComponentProps } from "react"
import { CommandGroup, CommandItem, useCommandState } from "cmdk"
import { Folder as FolderIcon, Hash, Inbox, Keyboard, Library, Monitor, Plus, RotateCcw, Rss, Settings } from "lucide-react"

import type { Folder } from "../../sleevy/folders"
import type { SavedItem } from "../../sleevy/saved-items"

type ModifierKey = "Ctrl" | "Cmd"
type FilterCount = readonly [string, number]

const ICON_SIZE = 14
const COMMAND_VALUES = {
  inbox: "nav:inbox",
  library: "nav:library",
  settings: "nav:settings",
  captureUrl: "action:capture-url",
  keyboardShortcuts: "action:keyboard-shortcuts",
  themeToggle: "theme:toggle",
} as const

function faviconUrl(host: string) {
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${host}&size=32`
}

function shortcutForValue(value: string, modifierKey: ModifierKey): string | null {
  if (value.startsWith("saved:")) {
    const shortcutNumber = value.match(/^saved:(\d+):/)?.[1]
    return shortcutNumber ? `${modifierKey} ${shortcutNumber}` : null
  }

  switch (value) {
    case COMMAND_VALUES.inbox:
      return `${modifierKey} I`
    case COMMAND_VALUES.library:
      return `${modifierKey} L`
    case COMMAND_VALUES.settings:
      return `${modifierKey} ,`
    case COMMAND_VALUES.captureUrl:
      return `${modifierKey} N`
    case COMMAND_VALUES.keyboardShortcuts:
      return `${modifierKey} ?`
    default:
      return null
  }
}

function ShortcutKeys({ shortcut }: { readonly shortcut: string }) {
  return (
    <span className="cmdk-item-shortcut">
      {shortcut.split(" ").map((key) => <kbd key={key}>{key}</kbd>)}
    </span>
  )
}

function CommandItemMeta({ action, modifierKey, shortcut }: {
  readonly action: string
  readonly modifierKey: ModifierKey | null
  readonly shortcut: string | null
}) {
  return modifierKey && shortcut
    ? <ShortcutKeys shortcut={shortcut} />
    : <span className="cmdk-item-type">{action}</span>
}

function SearchSubItem(props: ComponentProps<typeof CommandItem>) {
  const search = useCommandState((state) => state.search)
  return search ? <CommandItem {...props} /> : null
}

type Props = {
  readonly items: readonly SavedItem[]
  readonly folders: readonly Folder[]
  readonly tagFilters: readonly FilterCount[]
  readonly sourceFilters: readonly FilterCount[]
  readonly modifierKey: ModifierKey | null
  readonly hasActiveFilters: boolean
  readonly onOpenItem: (item: SavedItem) => void
  readonly onNavigateInbox: () => void
  readonly onNavigateLibrary: () => void
  readonly onNavigateSettings: () => void
  readonly onOpenFolder: (folderId: string) => void
  readonly onToggleTheme: () => void
  readonly onOpenCapture: () => void
  readonly onOpenKeyboardHelp: () => void
  readonly onApplyTag: (tag: string) => void
  readonly onApplySource: (source: string) => void
  readonly onResetFilters: () => void
}

export function CommandPaletteResults({
  items,
  folders,
  tagFilters,
  sourceFilters,
  modifierKey,
  hasActiveFilters,
  onOpenItem,
  onNavigateInbox,
  onNavigateLibrary,
  onNavigateSettings,
  onOpenFolder,
  onToggleTheme,
  onOpenCapture,
  onOpenKeyboardHelp,
  onApplyTag,
  onApplySource,
  onResetFilters,
}: Props) {
  return (
    <>
      <CommandGroup heading="Saved">
        {items.map((item, index) => (
        <CommandItem
          key={item.id}
          value={index < 9 ? `saved:${index + 1}:${item.id}` : `saved:${item.id}`}
          keywords={[item.host, item.title ?? ""]}
          onSelect={() => onOpenItem(item)}
        >
          <img src={faviconUrl(item.host)} alt="" width={ICON_SIZE} height={ICON_SIZE} className="cmdk-favicon" />
          <div className="cmdk-item-text">
            <span className="cmdk-item-title">{item.title ?? item.host}</span>
            {item.title && <span className="cmdk-item-host">{item.host}</span>}
          </div>
          <CommandItemMeta action="Saved" modifierKey={modifierKey} shortcut={index < 9 && modifierKey ? `${modifierKey} ${index + 1}` : null} />
        </CommandItem>
        ))}
      </CommandGroup>

      <CommandGroup heading="Navigation">
        <CommandItem value={COMMAND_VALUES.inbox} keywords={["go to inbox", "inbox"]} onSelect={onNavigateInbox}>
        <Inbox size={ICON_SIZE} className="cmdk-icon" />
        <div className="cmdk-item-text"><span className="cmdk-item-title">Inbox</span></div>
        <CommandItemMeta action="Navigation" modifierKey={modifierKey} shortcut={shortcutForValue(COMMAND_VALUES.inbox, modifierKey ?? "Ctrl")} />
        </CommandItem>
        <CommandItem value={COMMAND_VALUES.library} keywords={["go to library", "library"]} onSelect={onNavigateLibrary}>
        <Library size={ICON_SIZE} className="cmdk-icon" />
        <div className="cmdk-item-text"><span className="cmdk-item-title">Library</span></div>
        <CommandItemMeta action="Navigation" modifierKey={modifierKey} shortcut={shortcutForValue(COMMAND_VALUES.library, modifierKey ?? "Ctrl")} />
        </CommandItem>
        <CommandItem value={COMMAND_VALUES.settings} keywords={["go to settings", "settings", "appearance", "theme"]} onSelect={onNavigateSettings}>
        <Settings size={ICON_SIZE} className="cmdk-icon" />
        <div className="cmdk-item-text"><span className="cmdk-item-title">Settings</span></div>
        <CommandItemMeta action="Navigation" modifierKey={modifierKey} shortcut={shortcutForValue(COMMAND_VALUES.settings, modifierKey ?? "Ctrl")} />
        </CommandItem>

        {folders.map((folder) => (
          <CommandItem key={`folder:${folder.id}`} value={`nav:folder:${folder.id}:${folder.name}`} keywords={[folder.name, `folder ${folder.name}`, "library folder"]} onSelect={() => onOpenFolder(folder.id)}>
          <FolderIcon size={ICON_SIZE} className="cmdk-icon" />
          <div className="cmdk-item-text"><span className="cmdk-item-title">{folder.name}</span><span className="cmdk-item-host">Folder</span></div>
          <span className="cmdk-item-type">Navigation</span>
          </CommandItem>
        ))}
      </CommandGroup>

      <CommandGroup heading="Actions">
        <SearchSubItem value={COMMAND_VALUES.themeToggle} keywords={["toggle theme change appearance light dark"]} onSelect={onToggleTheme}>
        <Monitor size={ICON_SIZE} className="cmdk-icon" />
        <div className="cmdk-item-text"><span className="cmdk-item-title">Toggle theme</span></div>
        <CommandItemMeta action="Theme" modifierKey={modifierKey} shortcut={null} />
        </SearchSubItem>
        <CommandItem value={COMMAND_VALUES.captureUrl} keywords={["capture url"]} onSelect={onOpenCapture}>
        <Plus size={ICON_SIZE} className="cmdk-icon" />
        <div className="cmdk-item-text"><span className="cmdk-item-title">Capture URL</span></div>
        <CommandItemMeta action="Action" modifierKey={modifierKey} shortcut={shortcutForValue(COMMAND_VALUES.captureUrl, modifierKey ?? "Ctrl")} />
        </CommandItem>
        <CommandItem value={COMMAND_VALUES.keyboardShortcuts} keywords={["keyboard shortcuts"]} onSelect={onOpenKeyboardHelp}>
        <Keyboard size={ICON_SIZE} className="cmdk-icon" />
        <div className="cmdk-item-text"><span className="cmdk-item-title">Keyboard Shortcuts</span></div>
        <CommandItemMeta action="Action" modifierKey={modifierKey} shortcut={shortcutForValue(COMMAND_VALUES.keyboardShortcuts, modifierKey ?? "Ctrl")} />
        </CommandItem>
      </CommandGroup>

      <CommandGroup heading="Filters">
        {tagFilters.map(([tag, count]) => (
          <CommandItem key={`tag:${tag}`} value={`filter:tag:${tag} #${tag}`} keywords={[tag, `#${tag}`, `tag ${tag}`, `filter ${tag}`]} onSelect={() => onApplyTag(tag)}>
          <Hash size={ICON_SIZE} className="cmdk-icon" />
          <div className="cmdk-item-text"><span className="cmdk-item-title">#{tag}</span><span className="cmdk-item-host">Tag</span></div>
          <span className="cmdk-item-type">{count}</span>
          </CommandItem>
        ))}
        {sourceFilters.map(([source, count]) => (
          <CommandItem key={`source:${source}`} value={`filter:source:${source}`} keywords={[source, `source ${source}`, `filter ${source}`]} onSelect={() => onApplySource(source)}>
          <Rss size={ICON_SIZE} className="cmdk-icon" />
          <div className="cmdk-item-text"><span className="cmdk-item-title">{source}</span><span className="cmdk-item-host">Source</span></div>
          <span className="cmdk-item-type">{count}</span>
          </CommandItem>
        ))}
        {hasActiveFilters ? (
          <CommandItem value="filter:reset reset filters clear filters" keywords={["reset filters", "clear filters", "all filters", "remove filters"]} onSelect={onResetFilters}>
          <RotateCcw size={ICON_SIZE} className="cmdk-icon" />
          <div className="cmdk-item-text"><span className="cmdk-item-title">Reset filters</span></div>
          <span className="cmdk-item-type">Filter</span>
          </CommandItem>
        ) : null}
      </CommandGroup>
    </>
  )
}
