import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CommandDialog, CommandGroup, CommandInput, CommandList, useCommandState } from "cmdk"
import { useRouter } from "@tanstack/react-router"
import { Description as DialogDescription, Title as DialogTitle } from "@radix-ui/react-dialog"
import { Search } from "lucide-react"

import { CaptureCommandItem } from "../capture-command-item/capture-command-item"
import { CommandPaletteResults } from "./command-palette-results"
import { useKeyboardNav } from "../../contexts/keyboard-nav-context"
import { useTheme } from "../../contexts/theme-context"
import { useCapture, useSavedItems } from "../../sleevy/saved-items"
import { useFolders } from "../../sleevy/folders"
import { useSourceFilter } from "../source-filter/source-filter"
import { getSourceGroup } from "../source-filter/source-filter-utils"
import "./command-palette.scss"

type ModifierKey = "Ctrl" | "Cmd"
const EMPTY_ITEMS: never[] = []

function isUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}


function footerActionForValue(value: string | undefined): string {
  if (!value) return "Run"
  if (value.startsWith("capture:")) return "Capture"
  if (value.startsWith("filter:")) return "Filter"
  if (value.startsWith("saved:")) return "Open"
  if (value.startsWith("theme:")) return "Apply"
  if (value.startsWith("nav:")) return "Navigate"
  if (value === "action:capture-url") return "Focus"
  if (value === "action:keyboard-shortcuts") return "Open"

  return "Run"
}

function CommandPaletteFooter() {
  const selectedValue = useCommandState((state) => state.value)
  const footerAction = footerActionForValue(selectedValue)

  return (
    <div className="cmdk-footer">
      <span className="cmdk-footer-controls"><kbd>↑</kbd><kbd>↓</kbd> Move</span>
      <span className="cmdk-footer-hint">
        <kbd>↵</kbd> {footerAction}
      </span>
    </div>
  )
}

function useHeldModifier(paletteOpen: boolean): ModifierKey | null {
  const [modifierKey, setModifierKey] = useState<ModifierKey | null>(null)

  useEffect(() => {
    if (!paletteOpen) return

    const syncModifier = (nextModifier: ModifierKey | null) => {
      setModifierKey((currentModifier) => currentModifier === nextModifier ? currentModifier : nextModifier)
    }

    const modifierFromEvent = (event: KeyboardEvent) => {
      if (event.metaKey) return "Cmd"
      if (event.ctrlKey) return "Ctrl"
      return null
    }

    const handleKeyDown = (event: KeyboardEvent) => syncModifier(modifierFromEvent(event))

    const handleKeyUp = (event: KeyboardEvent) => {
      syncModifier(modifierFromEvent(event))
    }

    const handleBlur = () => syncModifier(null)

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
    }
  }, [paletteOpen])

  return paletteOpen ? modifierKey : null
}

export function CommandPalette() {
  const { paletteOpen, closePalette, openCaptureDialog, setHelpOpen } = useKeyboardNav()
  const { activeSource, activeTag, activeType, setActiveSource, setActiveTag, setActiveType } = useSourceFilter()
  const router = useRouter()
  const capture = useCapture()
  const savedItemsQuery = useSavedItems()
  const foldersQuery = useFolders()
  const { resolvedTheme, setTheme } = useTheme()
  const [search, setSearch] = useState("")
  const modifierKey = useHeldModifier(paletteOpen)

  const items = savedItemsQuery.data?.savedItems ?? EMPTY_ITEMS
  const shortcutItems = useMemo(() => items.slice(0, 9), [items])
  const tagFilters = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      for (const tag of item.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return [...counts.entries()].toSorted((a, b) => b[1] - a[1])
  }, [items])
  const sourceFilters = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      const source = getSourceGroup(item)
      if (source) counts.set(source, (counts.get(source) ?? 0) + 1)
    }
    return [...counts.entries()].toSorted((a, b) => b[1] - a[1])
  }, [items])
  const folders = foldersQuery.data?.folders ?? []

  const urlDetected = useMemo(() => isUrl(search.trim()), [search])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closePalette()
      setSearch("")
    }
  }

  const runAndClose = useCallback((fn: () => void) => {
    fn()
    closePalette()
    setSearch("")
  }, [closePalette])
  const runAndCloseRef = useRef(runAndClose)
  runAndCloseRef.current = runAndClose

  const openCapture = useCallback((initialUrl = "") => {
    closePalette()
    setSearch("")
    setTimeout(() => {
      openCaptureDialog(initialUrl)
    }, 0)
  }, [closePalette, openCaptureDialog])
  const openCaptureRef = useRef(openCapture)
  openCaptureRef.current = openCapture

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }, [resolvedTheme, setTheme])

  const captureFromPalette = useCallback((url: string) => {
    capture.captureUrl(url, () => {
      closePalette()
      setSearch("")
    })
  }, [capture, closePalette])

  const applyTagFilter = useCallback((tag: string) => {
    runAndClose(() => {
      setActiveTag(tag)
      void router.navigate({ to: "/library" })
    })
  }, [router, runAndClose, setActiveTag])

  const applySourceFilter = useCallback((source: string) => {
    runAndClose(() => {
      setActiveSource(source)
      void router.navigate({ to: "/library" })
    })
  }, [router, runAndClose, setActiveSource])

  const resetFilters = useCallback(() => {
    runAndClose(() => {
      setActiveSource(null)
      setActiveTag(null)
      setActiveType(null)
      void router.navigate({ to: "/library" })
    })
  }, [router, runAndClose, setActiveSource, setActiveTag, setActiveType])

  const openFolder = useCallback((folderId: string) => {
    runAndClose(() => {
      setActiveSource(null)
      setActiveTag(null)
      setActiveType(null)
      void router.navigate({ to: "/library/folders/$folderId", params: { folderId } })
    })
  }, [router, runAndClose, setActiveSource, setActiveTag, setActiveType])

  useEffect(() => {
    if (!paletteOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return

      if (/^[1-9]$/.test(event.key)) {
        const item = shortcutItems[Number(event.key) - 1]
        if (!item) return

        event.preventDefault()
        runAndCloseRef.current(() => {
          window.open(item.originalUrl, "_blank", "noreferrer")
        })
        return
      }

      const key = event.key.toLowerCase()
      const isHandledShortcut = key === "i" || key === "l" || key === "," || key === "n" || event.key === "?"
      if (!isHandledShortcut) return

      event.preventDefault()
      if (key === "i") runAndCloseRef.current(() => void router.navigate({ to: "/inbox" }))
      else if (key === "l") runAndCloseRef.current(() => void router.navigate({ to: "/library" }))
      else if (key === ",") runAndCloseRef.current(() => void router.navigate({ to: "/settings" }))
      else if (key === "n") openCaptureRef.current()
      else if (event.key === "?") runAndCloseRef.current(() => setHelpOpen(true))
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [paletteOpen, router, setHelpOpen, shortcutItems])

  return (
    <>
      <CommandDialog
      open={paletteOpen}
      onOpenChange={handleOpenChange}
      label="Command palette"
      loop
      vimBindings={false}
      overlayClassName="cmdk-overlay"
      contentClassName="cmdk-content"
      filter={urlDetected ? () => 1 : undefined}
    >
      <DialogTitle className="sr-only">Command palette</DialogTitle>
      <DialogDescription className="sr-only">Search saved items, navigate, or run app actions.</DialogDescription>
      <div className="cmdk-search"><Search aria-hidden="true" /><CommandInput
          placeholder="Search saved items and actions..."
          value={search}
          onValueChange={setSearch}
        /><kbd>esc</kbd></div>
      <CommandList>
        {urlDetected && (
          <CommandGroup forceMount>
            <CaptureCommandItem
              url={search.trim()}
              disabled={capture.isPending}
              actionLabel={capture.isPending ? "Saving..." : undefined}
              onSelect={() => captureFromPalette(search.trim())}
            />
          </CommandGroup>
        )}

        <CommandPaletteResults
          items={items}
          folders={folders}
          tagFilters={tagFilters}
          sourceFilters={sourceFilters}
          modifierKey={modifierKey}
          hasActiveFilters={Boolean(activeSource || activeTag || activeType)}
          onOpenItem={(item) => runAndClose(() => window.open(item.originalUrl, "_blank", "noreferrer"))}
          onNavigateInbox={() => runAndClose(() => void router.navigate({ to: "/inbox" }))}
          onNavigateLibrary={() => runAndClose(() => void router.navigate({ to: "/library" }))}
          onNavigateSettings={() => runAndClose(() => void router.navigate({ to: "/settings" }))}
          onOpenFolder={openFolder}
          onToggleTheme={() => runAndClose(toggleTheme)}
          onOpenCapture={() => openCapture()}
          onOpenKeyboardHelp={() => runAndClose(() => setHelpOpen(true))}
          onApplyTag={applyTagFilter}
          onApplySource={applySourceFilter}
          onResetFilters={resetFilters}
        />
      </CommandList>

      <CommandPaletteFooter />
      </CommandDialog>
    </>
  )
}
