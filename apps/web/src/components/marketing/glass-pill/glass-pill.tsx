import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react"
import clsx from "clsx"
import { LiquidGlass, type LiquidGlassHandle } from "simple-liquid-glass"

import styles from "./glass-pill.module.scss"

/**
 * Marketing glass button surface (Figma's Glass material): real SVG refraction
 * on Chromium, frosted glass elsewhere. Renders the glass pill only — pass the
 * interactive element (a / Link) as the child so it keeps its own semantics;
 * the child provides the pill's box (padding / min-height), the glass layers
 * stretch to it.
 */
export function GlassPill({
  className,
  radius,
  style,
  children,
}: {
  className?: string
  /**
   * Corner radius in px for the first paint only, authored at the 1440px
   * anchor (the child's min-height / 2) like any other marketing size. After
   * mount the pill measures itself, so this value never has to be maintained.
   */
  radius: number
  /**
   * LiquidGlass sets inline `position: relative` on its root, so positioning
   * from `className` loses — pass positioning overrides here instead.
   */
  style?: CSSProperties
  children: ReactNode
}) {
  const glass = useRef<LiquidGlassHandle>(null)
  const [measured, setMeasured] = useState<number>()

  /* The glass layers take their radius as a px number, but the marketing tree
     scales every rem with the viewport width (see -marketing-layout), so the
     pill's height — and with it the stadium radius — differs per band. A
     constant is only correct at the band it was authored in and reads as a
     squarer corner inside the child's own 999px stadium everywhere else, so
     take the radius from the rendered box instead. */
  useEffect(() => {
    const element = glass.current?.element
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
      if (height > 0) setMeasured(height / 2)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <LiquidGlass
      ref={glass}
      className={clsx(styles.pill, className)}
      mode="custom"
      radius={measured ?? radius}
      scale={-140}
      border={0.07}
      lightness={50}
      displace={0.6}
      alpha={0.93}
      blur={2}
      dispersion={40}
      saturation={140}
      frost={0.08}
      glassColor="rgba(255, 255, 255, 0.12)"
      borderColor="rgba(255, 255, 255, 0.35)"
      /* max-content, not auto: the CTAs straddle a card edge from
         `position: absolute; left: 50%`, and shrink-to-fit caps an auto width
         at the space left of that offset (half the card). The child's label is
         nowrap, so the pill came out ~40px narrower than its own content and
         the text ran through the right padding. */
      style={{ width: "max-content", height: "auto", ...style }}
    >
      {children}
    </LiquidGlass>
  )
}
