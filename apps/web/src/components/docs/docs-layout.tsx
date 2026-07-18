import { Outlet } from "@tanstack/react-router"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import type { Root } from "fumadocs-core/page-tree"
import { BookOpen, Code2, FileText, House, KeyRound, Layers3, Moon, Sun, TriangleAlert, WandSparkles } from "lucide-react"

import { useTheme } from "../../contexts/theme-context"
import styles from "./docs-layout.module.scss"

export const docsTree: Root = {
  name: "Sleevy API",
  children: [
    { type: "page", name: "Home", url: "/docs", icon: <House /> },
    { type: "separator", name: "Get started" },
    { type: "page", name: "Overview", url: "/docs/overview", icon: <BookOpen /> },
    { type: "page", name: "Getting started", url: "/docs/getting-started", icon: <FileText /> },
    { type: "separator", name: "Build with the API" },
    { type: "page", name: "Captures and saved items", url: "/docs/concepts", icon: <Layers3 /> },
    { type: "page", name: "Save and organize links", url: "/docs/guides", icon: <WandSparkles /> },
    { type: "separator", name: "API reference" },
    { type: "page", name: "Authentication", url: "/docs/authentication", icon: <KeyRound /> },
    { type: "page", name: "Errors", url: "/docs/errors", icon: <TriangleAlert /> },
    { type: "page", name: "Rate limits", url: "/docs/rate-limits", icon: <Code2 /> },
    { type: "page", name: "OpenAPI reference", url: "/docs/api-reference", icon: <Code2 /> },
  ],
}

export function DocsLayoutShell() {
  const { resolvedTheme } = useTheme()

  return (
    <div className={`${styles.shell} ${resolvedTheme === "dark" ? "dark" : ""}`} data-docs-shell>
      <DocsLayout
        tree={docsTree}
        nav={{
          title: <span className={styles.brand}><img className={styles.brandLogo} src="/logo-mark.svg" alt="" />Sleevy</span>,
          url: "/",
        }}
        githubUrl="https://github.com/Onnokh/sleevy"
        searchToggle={{ enabled: true }}
        slots={{ themeSwitch: DocsThemeSwitch }}
      >
        <Outlet />
      </DocsLayout>
    </div>
  )
}

function DocsThemeSwitch({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const label = resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"

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
      data-theme={resolvedTheme}
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      <Sun className={styles.themeIcon} aria-hidden="true" />
      <Moon className={styles.themeIcon} aria-hidden="true" />
    </button>
  )
}
