import { useEffect, useState, type RefObject } from "react"

import styles from "./page-title-bar.module.scss"

/// The title band, not the full height of the fade below it. The observer
/// needs it in pixels: the large title counts as gone once it has passed under
/// the small one, not once it has left the viewport, or the swap arrives late.
const TITLE_BAND = 52

type PageTitleBarProps = {
  readonly title: string
  /// The large heading this bar stands in for.
  readonly watch: RefObject<HTMLElement | null>
}

/// The small centred title that takes over once a page's large title has
/// scrolled away, the way a navigation bar does on iOS.
///
/// It is decorative by construction: the page keeps exactly one `h1`, and this
/// is a second rendering of the same words, so it stays out of the
/// accessibility tree entirely.
export function PageTitleBar({ title, watch }: PageTitleBarProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const heading = watch.current
    if (!heading) return

    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!(entry?.isIntersecting ?? true)),
      { rootMargin: `-${TITLE_BAND}px 0px 0px 0px` },
    )
    observer.observe(heading)

    return () => observer.disconnect()
  }, [watch])

  return (
    <div className={styles.bar} data-collapsed={collapsed || undefined} aria-hidden="true">
      <div className={styles.surface}>
        <span className={styles.title}>{title}</span>
      </div>
    </div>
  )
}
