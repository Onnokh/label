import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

type SavedCardItem = {
  readonly id: string
  readonly originalUrl: string
  readonly host: string
  readonly title?: string
  readonly description?: string
  readonly imageUrl?: string
  readonly previewSummary?: string
  readonly enrichmentStatus: "pending" | "enriched" | "failed"
}

type Props = {
  readonly item: SavedCardItem
  readonly onDelete: (id: string) => void
}

const PLACEHOLDER_SRC = "/bookmark-placeholder.svg"

export function SavedCard({ item, onDelete }: Props) {
  const menuId = useId()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)

  const summary = item.previewSummary ?? item.description
  const statusLabel =
    item.enrichmentStatus === "failed"
      ? "Enrichment failed"
      : item.enrichmentStatus === "pending"
        ? "Enriching..."
        : null

  // Outside-click + escape dismiss for menu
  useEffect(() => {
    if (!isMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [isMenuOpen])

  // 3D tilt + shine — smoothed via rAF, mouse-only
  const animationFrameRef = useRef<number | null>(null)
  const tiltRef = useRef({
    currentRx: 0,
    currentRy: 0,
    targetRx: 0,
    targetRy: 0,
    currentPx: 50,
    currentPy: 50,
    targetPx: 50,
    targetPy: 50,
  })

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const renderTilt = () => {
    const row = rowRef.current
    if (!row) return
    const tilt = tiltRef.current
    const smoothing = 0.16
    tilt.currentRx += (tilt.targetRx - tilt.currentRx) * smoothing
    tilt.currentRy += (tilt.targetRy - tilt.currentRy) * smoothing
    tilt.currentPx += (tilt.targetPx - tilt.currentPx) * smoothing
    tilt.currentPy += (tilt.targetPy - tilt.currentPy) * smoothing

    row.style.setProperty("--tilt-rx", `${tilt.currentRx.toFixed(2)}deg`)
    row.style.setProperty("--tilt-ry", `${tilt.currentRy.toFixed(2)}deg`)
    row.style.setProperty("--tilt-px", `${tilt.currentPx.toFixed(2)}%`)
    row.style.setProperty("--tilt-py", `${tilt.currentPy.toFixed(2)}%`)

    const settled =
      Math.abs(tilt.targetRx - tilt.currentRx) < 0.03 &&
      Math.abs(tilt.targetRy - tilt.currentRy) < 0.03 &&
      Math.abs(tilt.targetPx - tilt.currentPx) < 0.05 &&
      Math.abs(tilt.targetPy - tilt.currentPy) < 0.05

    if (settled) {
      animationFrameRef.current = null
      return
    }
    animationFrameRef.current = requestAnimationFrame(renderTilt)
  }

  const queueTiltRender = () => {
    if (animationFrameRef.current !== null) return
    animationFrameRef.current = requestAnimationFrame(renderTilt)
  }

  // Reset tilt when menu opens (keeps the card flat under the menu)
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    tiltRef.current.currentRx = 0
    tiltRef.current.currentRy = 0
    tiltRef.current.targetRx = 0
    tiltRef.current.targetRy = 0
    tiltRef.current.currentPx = 50
    tiltRef.current.currentPy = 50
    tiltRef.current.targetPx = 50
    tiltRef.current.targetPy = 50
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    row.style.setProperty("--tilt-rx", "0deg")
    row.style.setProperty("--tilt-ry", "0deg")
    row.style.setProperty("--tilt-px", "50%")
    row.style.setProperty("--tilt-py", "50%")
    row.style.setProperty("--shine-opacity", "0")
  }, [isMenuOpen])

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isMenuOpen || e.pointerType !== "mouse") return
    const row = rowRef.current
    if (!row) return
    const rect = row.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const clampedPx = Math.min(1, Math.max(0, px))
    const clampedPy = Math.min(1, Math.max(0, py))

    const maxTilt = 5
    const shineTravel = 24
    tiltRef.current.targetRy = (clampedPx - 0.5) * maxTilt
    tiltRef.current.targetRx = -(clampedPy - 0.5) * maxTilt
    tiltRef.current.targetPx = 50 + (clampedPx - 0.5) * shineTravel
    tiltRef.current.targetPy = 50 + (clampedPy - 0.5) * shineTravel

    row.style.setProperty("--shine-opacity", "1")
    queueTiltRender()
  }

  const handlePointerLeave = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return
    const row = rowRef.current
    if (!row) return
    tiltRef.current.targetRx = 0
    tiltRef.current.targetRy = 0
    tiltRef.current.targetPx = 50
    tiltRef.current.targetPy = 50
    row.style.setProperty("--shine-opacity", "0")
    queueTiltRender()
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(item.originalUrl)
    } catch {
      const el = document.createElement("textarea")
      el.value = item.originalUrl
      el.setAttribute("readonly", "")
      el.style.position = "fixed"
      el.style.left = "-9999px"
      document.body.appendChild(el)
      el.select()
      try {
        document.execCommand("copy")
      } finally {
        document.body.removeChild(el)
      }
    }
    setIsMenuOpen(false)
  }

  return (
    <div
      ref={rowRef}
      className={`card${isMenuOpen ? " cardMenuOpen" : ""}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="cardShine" aria-hidden="true" />
      <div className="cardThumb">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            className="cardThumbImg"
            onError={(e) => {
              const target = e.currentTarget
              if (target.getAttribute("data-fallback") === "1") return
              target.setAttribute("data-fallback", "1")
              target.src = PLACEHOLDER_SRC
            }}
          />
        ) : (
          <div className="cardThumbPlaceholder" aria-hidden="true" />
        )}
      </div>
      <div className="cardContent">
        <a href={item.originalUrl} target="_blank" rel="noreferrer" className="cardLink">
          <span className="cardTitle">{item.title ?? item.host}</span>
          <div className="cardUrl">{item.originalUrl}</div>
          {summary ? (
            <div className="cardSummary">{summary}</div>
          ) : statusLabel ? (
            <div className="cardStatus">{statusLabel}</div>
          ) : null}
        </a>
      </div>
      <button
        type="button"
        ref={buttonRef}
        className="cardMenuButton"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-controls={menuId}
        onClick={() => setIsMenuOpen((v) => !v)}
      >
        <DotsIcon />
        <span className="srOnly">More</span>
      </button>
      {isMenuOpen ? (
        <div ref={menuRef} id={menuId} role="menu" className="cardMenu">
          <a
            href={item.originalUrl}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            className="cardMenuItem"
            onClick={() => setIsMenuOpen(false)}
          >
            <LinkIcon />
            Open
          </a>
          <button type="button" role="menuitem" className="cardMenuItem" onClick={copyUrl}>
            <CopyIcon />
            Copy URL
          </button>
          <button
            type="button"
            role="menuitem"
            className="cardMenuItem cardMenuItemDestructive"
            onClick={() => {
              setIsMenuOpen(false)
              onDelete(item.id)
            }}
          >
            <TrashIcon />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
