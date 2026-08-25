import { useEffect, useRef } from "react"

import { useTheme } from "../../contexts/theme-context"
import { onFolderCardShaderRestored, renderFolderCard } from "./folder-card-shader"
import styles from "./folder-header-background.module.scss"

/// The same 15 frames per second the native cards budget for. The field
/// breathes slowly enough that more frames buy nothing and cost battery.
const FRAME_INTERVAL = 1000 / 15

/// What a paused card shows: the composition with no drift applied, which is
/// exactly the still frame the Library rows wear.
const STILL_MOTION = 0

type FolderHeaderBackgroundProps = {
  readonly folderId: string
  readonly color: string | null
  readonly className?: string
}

/// A folder's own corona, drawn tall behind its detail header — the folder's
/// counterpart to the Inbox aurora.
///
/// Unlike the Library rows this one drifts, so it runs a loop. It still goes
/// through the shared renderer rather than opening a WebGL context of its own:
/// the Library page already draws every row through that one context, and the
/// blit leaves a plain 2D canvas behind that survives a pause by construction.
export function FolderHeaderBackground({ folderId, color, className }: FolderHeaderBackgroundProps) {
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

    const draw = (motion: number) => {
      const { width, height } = canvas.getBoundingClientRect()
      if (width <= 0 || height <= 0) return

      renderFolderCard(canvas, {
        id: folderId,
        color,
        theme: resolvedTheme,
        cssWidth: width,
        cssHeight: height,
        motion,
        // The card is tall here, so every ray has to run out of light above
        // the bottom edge rather than meet it.
        bottomFade: true,
      })
    }

    const drawStill = () => draw(STILL_MOTION)

    const step = (now: number) => {
      frameHandle = requestAnimationFrame(step)
      if (now - lastDrawn < FRAME_INTERVAL) return
      lastDrawn = now
      draw((now - started) / 1000)
    }

    // Drifts only while it is on screen, the tab is in front, and the reader
    // has not asked for less motion — the three conditions the native view
    // checks before it unpauses.
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

    const stopListening = onFolderCardShaderRestored(drawStill)
    document.addEventListener("visibilitychange", syncPlayback)
    reducedMotion.addEventListener("change", syncPlayback)
    syncPlayback()

    return () => {
      if (frameHandle) cancelAnimationFrame(frameHandle)
      observer.disconnect()
      resizeObserver.disconnect()
      stopListening()
      document.removeEventListener("visibilitychange", syncPlayback)
      reducedMotion.removeEventListener("change", syncPlayback)
    }
  }, [color, folderId, resolvedTheme])

  return (
    <canvas
      ref={canvasRef}
      className={className ? `${styles.canvas} ${className}` : styles.canvas}
      aria-hidden="true"
    />
  )
}
