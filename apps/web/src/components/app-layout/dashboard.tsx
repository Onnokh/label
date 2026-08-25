import { Outlet, useLocation } from "@tanstack/react-router"
import { Menu, Moon, Sun } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { Logo } from "../../Logo"
import { useKeyboardNav } from "../../contexts/keyboard-nav-context"
import { useTheme } from "../../contexts/theme-context"
import { useMediaQuery } from "../../hooks/use-media-query"
import { AccountMenu } from "../account-menu/account-menu"
import { CaptureDialog } from "../capture-dialog/capture-dialog"
import { CommandPalette } from "../command-palette/command-palette"
import { FolderSidebar } from "../folders/folder-sidebar"
import { KeyboardHelp } from "../keyboard-help/keyboard-help"
import { LibraryNav, SidebarActions, SourceFilterList, TagFilterList } from "../source-filter/source-filter"
import { SidebarSheet } from "./sidebar-sheet"

/// Below this the sidebar has nowhere to stand: its 360px would leave the
/// content column narrower than the rows it has to hold.
const COMPACT = "(max-width: 768px)"

type User = Parameters<typeof AccountMenu>[0]["user"]

export function Dashboard({ user }: { readonly user: User }) {
  const { captureDialogOpen, captureDialogInitialUrl, closeCaptureDialog } = useKeyboardNav()
  const compact = useMediaQuery(COMPACT)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  // Rows dismiss the sheet themselves, but a route can also change from a
  // dialog opened out of it, or from the browser's own back button. Landing on
  // a new page with the sheet still over it would hide the thing it navigated
  // to.
  useEffect(() => setMenuOpen(false), [pathname])

  const rows = <SidebarRows user={user} />

  return (
    <>
      <div className="dashboard">
        {compact ? null : <aside className="sidebar">{rows}</aside>}
        <main className="content">
          <Outlet />
        </main>
      </div>
      {compact ? (
        <>
          {/* Floating rather than in a bar of its own: the compact shell gives
              the whole window to the page, and the one control that is not part
              of the page sits over it, within reach of a thumb. */}
          <button
            type="button"
            className="menu-button"
            aria-label="Open navigation"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <SidebarSheet open={menuOpen} onOpenChange={setMenuOpen}>{rows}</SidebarSheet>
        </>
      ) : null}
      {captureDialogOpen ? <CaptureDialog initialUrl={captureDialogInitialUrl} onClose={closeCaptureDialog} /> : null}
      <CommandPalette />
      <KeyboardHelp />
    </>
  )
}

/// Everything the sidebar holds, independent of whether it is standing in a
/// column or lying in a sheet.
function SidebarRows({ user }: { readonly user: User }): ReactNode {
  return (
    <>
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <Logo size={25} />
          <SidebarThemeToggle />
        </div>
        <SidebarActions />
        <LibraryNav />
        <FolderSidebar />
        <TagFilterList />
        <SourceFilterList />
      </div>
      <div className="sidebar-bottom">
        <AccountMenu user={user} />
      </div>
    </>
  )
}

function SidebarThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const label = resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"

  return (
    <button
      type="button"
      className="sidebar-theme-toggle"
      data-theme={resolvedTheme}
      aria-label={label}
      title={label}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="sidebar-theme-icon sidebar-theme-icon-sun" size={16} aria-hidden="true" />
      <Moon className="sidebar-theme-icon sidebar-theme-icon-moon" size={16} aria-hidden="true" />
    </button>
  )
}
