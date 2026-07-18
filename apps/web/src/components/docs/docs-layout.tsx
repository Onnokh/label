import { useEffect, useState, type ReactNode } from "react"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import type { Root } from "fumadocs-core/page-tree"
import { Moon, Sun } from "lucide-react"

import { useTheme } from "../../contexts/theme-context"
import styles from "./docs-layout.module.scss"

export function DocsShell({ tree, children }: { tree: Root; children: ReactNode }) {
  return (
    <div className={styles.shell} data-docs-shell>
      <DocsLayout
        tree={tree}
        nav={{
          title: <span className={styles.brand}><img className={styles.brandLogo} src="/logo-mark.svg" alt="" />Sleevy</span>,
          url: "/",
        }}
        githubUrl="https://github.com/Onnokh/sleevy"
        searchToggle={{ enabled: true }}
        slots={{ themeSwitch: DocsThemeSwitch }}
      >
        {children}
      </DocsLayout>
    </div>
  )
}

function DocsThemeSwitch({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  // The server doesn't know the stored theme, so render theme-dependent
  // attributes only after mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const label = !mounted ? "Toggle theme" : resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"

  const toggleTheme = () => {
    const shell = document.querySelector<HTMLElement>("[data-docs-shell]")
    if (shell) shell.dataset.themeTransition = "instant"
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
    window.setTimeout(() => {
      if (shell) delete shell.dataset.themeTransition
    }, 200)
  }

  return (
    <button
      type="button"
      className={[styles.themeSwitch, className].filter(Boolean).join(" ")}
      data-theme={mounted ? resolvedTheme : undefined}
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      <Sun className={styles.themeIcon} aria-hidden="true" />
      <Moon className={styles.themeIcon} aria-hidden="true" />
    </button>
  )
}
