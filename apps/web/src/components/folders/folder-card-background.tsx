import { useEffect, useRef } from "react"

import { useTheme } from "../../contexts/theme-context"
import { onFolderCardShaderRestored, renderFolderCard } from "./folder-card-shader"
import styles from "./folder-card-grid.module.scss"

type FolderCardBackgroundProps = {
  readonly folderId: string
  readonly color: string | null
}

export function FolderCardBackground({ folderId, color }: FolderCardBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      renderFolderCard(canvas, {
        id: folderId,
        color,
        theme: resolvedTheme,
        cssWidth: width,
        cssHeight: height,
      })
    }

    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    const stopListening = onFolderCardShaderRestored(draw)
    draw()

    return () => {
      observer.disconnect()
      stopListening()
    }
  }, [color, folderId, resolvedTheme])

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
}
