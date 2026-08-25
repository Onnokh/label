import { Outlet } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"

import { Logo } from "../../Logo"
import { useKeyboardNav } from "../../contexts/keyboard-nav-context"
import { useTheme } from "../../contexts/theme-context"
import { AccountMenu } from "../account-menu/account-menu"
import { CaptureDialog } from "../capture-dialog/capture-dialog"
import { CommandPalette } from "../command-palette/command-palette"
import { FolderSidebar } from "../folders/folder-sidebar"
import { KeyboardHelp } from "../keyboard-help/keyboard-help"
import { LibraryNav, SidebarActions, SourceFilterList, TagFilterList } from "../source-filter/source-filter"

type User = Parameters<typeof AccountMenu>[0]["user"]

export function Dashboard({ user }: { readonly user: User }) {
  const { captureDialogOpen, captureDialogInitialUrl, closeCaptureDialog } = useKeyboardNav()

  return (
    <>
      <div className="dashboard">
        <aside className="sidebar">
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
        </aside>
        <main className="content">
          <Outlet />
        </main>
      </div>
      {captureDialogOpen ? <CaptureDialog initialUrl={captureDialogInitialUrl} onClose={closeCaptureDialog} /> : null}
      <CommandPalette />
      <KeyboardHelp />
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
