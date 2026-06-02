import { createContext, type ReactNode, use, useEffect, useMemo, useState } from "react"

type ThemePreference = "system" | "light" | "dark"
type ResolvedTheme = "light" | "dark"

type ThemeContextValue = {
  readonly theme: ThemePreference
  readonly resolvedTheme: ResolvedTheme
  readonly setTheme: (theme: ThemePreference) => void
}

const STORAGE_KEY = "sleevy:theme"
const ThemeContext = createContext<ThemeContextValue | null>(null)

const isServer = typeof window === "undefined"

function systemTheme(): ResolvedTheme {
  if (isServer) return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function storedTheme(): ThemePreference {
  if (isServer) return "system"
  const value = localStorage.getItem(STORAGE_KEY)
  return value === "light" || value === "dark" || value === "system" ? value : "system"
}

function resolveTheme(theme: ThemePreference): ResolvedTheme {
  return theme === "system" ? systemTheme() : theme
}

type ThemeProviderProps = {
  readonly children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(() => storedTheme())
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme))

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    const sync = () => {
      const next = resolveTheme(theme)
      document.documentElement.dataset.theme = next
      setResolvedTheme(next)
    }

    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [theme])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme,
    setTheme: (nextTheme) => {
      localStorage.setItem(STORAGE_KEY, nextTheme)
      setThemeState(nextTheme)
    },
  }), [resolvedTheme, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = use(ThemeContext)
  if (!value) throw new Error("useTheme must be used within ThemeProvider")
  return value
}
