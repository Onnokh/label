import { useCallback, useSyncExternalStore } from "react"

/// Whether the viewport matches a media query right now, kept in step with it.
///
/// The shell needs this in JavaScript, not only in CSS: below the compact
/// breakpoint the sidebar is not a narrower column but a different component —
/// an off-canvas sheet with its own focus trap — and only one of the two may
/// exist at a time.
///
/// The server snapshot is `false`, so a server render always draws the wide
/// layout. Nothing is lost: the dashboard waits on a session and therefore
/// never reaches the server anyway.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", onChange)
      return () => media.removeEventListener("change", onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
