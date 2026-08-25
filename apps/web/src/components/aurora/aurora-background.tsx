import { useEffect, useRef } from "react"

import { useTheme } from "../../contexts/theme-context"
import { AuroraRenderer } from "./aurora-shader"
import styles from "./aurora-background.module.scss"

/// The native view runs its Metal loop at 15 frames per second. The field
/// drifts slowly enough that more frames buy nothing and cost battery, so the
/// web loop holds the same budget instead of taking every animation frame.
const FRAME_INTERVAL = 1000 / 15

/// What a paused card shows. Reduce Motion still gets the aurora, just a
/// single frame of it, and this is the moment in the drift that reads best.
const STILL_TIME = 6

type AuroraBackgroundProps = {
  readonly className?: string
}

export function AuroraBackground({ className }: AuroraBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let frameHandle = 0
    let lastDrawn = 0
    let onScreen = true
    const started = performance.now()
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

    const draw = (time: number) => {
      const { width, height } = canvas.getBoundingClientRect()
      if (width <= 0 || height <= 0) return

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      renderer?.render({
        time,
        theme: resolvedTheme,
        width: Math.max(1, Math.round(width * pixelRatio)),
        height: Math.max(1, Math.round(height * pixelRatio)),
      })
    }

    const drawStill = () => draw(STILL_TIME)

    const renderer = AuroraRenderer.create(canvas, drawStill)
    if (!renderer) return

    const step = (now: number) => {
      frameHandle = requestAnimationFrame(step)
      if (now - lastDrawn < FRAME_INTERVAL) return
      lastDrawn = now
      draw((now - started) / 1000)
    }

    // The card only animates while it is on screen, the tab is in front, and
    // the reader has not asked for less motion — the same three conditions the
    // native view checks before it unpauses.
    const syncPlayback = () => {
      const shouldAnimate = onScreen && !document.hidden && !reducedMotion.matches
      if (shouldAnimate) {
        if (!frameHandle) frameHandle = requestAnimationFrame(step)
        return
      }
      if (frameHandle) {
        cancelAnimationFrame(frameHandle)
        frameHandle = 0
      }
      drawStill()
    }

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true
      syncPlayback()
    })
    observer.observe(canvas)

    const resizeObserver = new ResizeObserver(() => {
      if (!frameHandle) drawStill()
    })
    resizeObserver.observe(canvas)

    document.addEventListener("visibilitychange", syncPlayback)
    reducedMotion.addEventListener("change", syncPlayback)
    syncPlayback()

    return () => {
      if (frameHandle) cancelAnimationFrame(frameHandle)
      observer.disconnect()
      resizeObserver.disconnect()
      document.removeEventListener("visibilitychange", syncPlayback)
      reducedMotion.removeEventListener("change", syncPlayback)
      renderer.dispose()
    }
  }, [resolvedTheme])

  return (
    <canvas
      ref={canvasRef}
      className={className ? `${styles.canvas} ${className}` : styles.canvas}
      aria-hidden="true"
    />
  )
}
