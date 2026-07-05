import type { CSSProperties, ReactNode } from "react"
import clsx from "clsx"
import { LiquidGlass } from "simple-liquid-glass"

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
  /** Corner radius in px — must match the child's pill height (h/2). */
  radius: number
  /**
   * LiquidGlass sets inline `position: relative` on its root, so positioning
   * from `className` loses — pass positioning overrides here instead.
   */
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <LiquidGlass
      className={clsx(styles.pill, className)}
      mode="custom"
      radius={radius}
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
      style={{ width: "auto", height: "auto", ...style }}
    >
      {children}
    </LiquidGlass>
  )
}
