import { useState, useRef, useEffect, useCallback } from "react"
import { authClient } from "../../auth"
import styles from "./sign-in.module.scss"

const brandmarkWhiteUrl = "/brandmark-white.svg"
const appleMobilePattern = /iPad|iPhone|iPod/

function isAppleMobileBrowser() {
  return appleMobilePattern.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

export function SignIn() {
  const [error, setError] = useState<string | null>(null)
  const [signingInProvider, setSigningInProvider] = useState<"google" | "apple" | null>(null)

  const lastUsed = authClient.getLastUsedLoginMethod()

  const startSignIn = async (provider: "google" | "apple") => {
    setError(null)
    setSigningInProvider(provider)
    const current = window.location.pathname + window.location.search
    const callbackPath = current && current !== "/" ? current : "/inbox"
    const result = await authClient.signIn.social({
      provider,
      callbackURL: `${window.location.origin}${callbackPath}`,
    })
    if (result.error) {
      setError(result.error.message ?? `${provider === "apple" ? "Apple" : "Google"} sign-in failed.`)
      setSigningInProvider(null)
    }
  }

  const isSigningIn = signingInProvider !== null

  return (
    <div className={styles.wrapper}>
      <SignInBokeh />
      <div className={styles.content}>
        <a href="/" className={styles.logoLink}><img src={brandmarkWhiteUrl} alt="Sleevy" className={styles.logo} width={54} height={80} /></a>
        <button type="button" className={`${styles.button} ${styles.primary}`} disabled={isSigningIn} onClick={() => void startSignIn("apple")}>
          <AppleIcon />
          {signingInProvider === "apple" ? "Opening Apple..." : "Sign in with Apple"}
          {lastUsed === "apple" && <span className={styles.lastUsed}>Last used</span>}
        </button>
        <button type="button" className={`${styles.button} ${styles.secondary}`} disabled={isSigningIn} onClick={() => void startSignIn("google")}>
          <GoogleIcon />
          {signingInProvider === "google" ? "Opening Google..." : "Sign in with Google"}
          {lastUsed === "google" && <span className={styles.lastUsed}>Last used</span>}
        </button>
        {error ? <pre className={styles.error}>{error}</pre> : null}
      </div>
    </div>
  )
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M12.152 8.374c-.02-1.89 1.54-2.8 1.61-2.842-.877-1.284-2.243-1.46-2.729-1.48-1.16-.118-2.27.685-2.86.685-.59 0-1.502-.668-2.47-.65-1.27.019-2.444.74-3.1 1.88-1.32 2.293-.338 5.69.95 7.55.63.912 1.382 1.936 2.37 1.9.95-.039 1.31-.616 2.46-.616 1.148 0 1.473.616 2.472.596.024-.003 1.716-.997 2.34-1.9-1.465-.889-1.743-2.653-1.743-3.123z" />
      <path d="M10.498 2.704A2.71 2.71 0 0 0 11.12.75a2.76 2.76 0 0 0-1.786.924 2.58 2.58 0 0 0-.64 1.872 2.28 2.28 0 0 0 1.804-.842z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.94v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.16.28-1.71V4.96H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.04l3.02-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .94 4.96l3.02 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

// SVG path data for solid icons (viewBox 0 0 24 24)
const ICON_PATHS = [
  "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z", // bookmark
  "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71", // link
  "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z", // globe
  "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6zM8 12h8v2H8v-2zm0 4h5v2H8v-2z", // file-text
  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z", // star
  "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2z", // tag
  "M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM5 12h6v6H5v-6zm8 6v-6h6v6h-6zM5 6h14v4H5V6z", // newspaper
  "M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M5 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z", // rss
]

interface BokehParticle {
  size: number
  blur: number
  color: string
  iconColor: string
  iconPath: string
  startX: number
  startY: number
  driftX: number
  driftY: number
  rotation: number
  duration: number
  cornerRadius: number
  phase: number
}

function createParticles(): BokehParticle[] {
  const palette: { bg: string; icon: string }[] = [
    { bg: "#ffffff", icon: "rgba(200,160,180,0.6)" },
    { bg: "#F3C087", icon: "rgba(255,255,255,0.7)" },
    { bg: "#F59683", icon: "rgba(255,255,255,0.7)" },
    { bg: "#F755AB", icon: "rgba(255,255,255,0.7)" },
  ]
  return Array.from({ length: 18 }, () => {
    const depth = Math.random()
    const size = 35 + depth * 80
    const drift = 0.2 + depth * 0.4
    const { bg: color, icon: iconColor } = palette[Math.floor(Math.random() * palette.length)]
    return {
      size,
      blur: 22 - depth * 12,
      color,
      iconColor,
      iconPath: ICON_PATHS[Math.floor(Math.random() * ICON_PATHS.length)],
      startX: -0.15 + Math.random() * 1.3,
      startY: -0.15 + Math.random() * 1.3,
      driftX: (Math.random() * 2 - 1) * drift,
      driftY: (Math.random() * 2 - 1) * drift,
      rotation: (Math.random() * 2 - 1) * 25 * (Math.PI / 180),
      duration: 40 - depth * 16 + (Math.random() * 6 - 3),
      cornerRadius: size * (0.2 + Math.random() * 0.15),
      phase: Math.random() * Math.PI * 2,
    }
  }).sort((a, b) => a.blur - b.blur)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function SignInBokeh() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<BokehParticle[] | null>(null)
  if (particlesRef.current === null) particlesRef.current = createParticles()
  const iconPathsRef = useRef<Map<string, Path2D> | null>(null)
  if (iconPathsRef.current === null) iconPathsRef.current = new Map()
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  const getIconPath2D = useCallback((d: string): Path2D => {
    const paths = iconPathsRef.current!
    let p = paths.get(d)
    if (!p) {
      p = new Path2D(d)
      paths.set(d, p)
    }
    return p
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.offsetWidth * dpr
      canvas.height = canvas.offsetHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const particles = particlesRef.current!
    const useFilterBlur = "filter" in ctx && !isAppleMobileBrowser()

    const draw = (now: number) => {
      if (!startRef.current) startRef.current = now
      const elapsed = (now - startRef.current) / 1000
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight

      ctx.clearRect(0, 0, w, h)

      const fadeIn = Math.min(elapsed / 1.5, 1)

      for (const p of particles) {
        const t = (Math.sin(elapsed * (Math.PI * 2) / p.duration + p.phase) + 1) / 2

        const cx = (p.startX + p.driftX * t) * w
        const cy = (p.startY + p.driftY * t) * h
        const rot = p.rotation * t
        const fadeScale = 0.5 + fadeIn * 0.5

        ctx.save()
        ctx.globalAlpha = fadeIn
        if (useFilterBlur) {
          ctx.filter = `blur(${p.blur}px)`
        } else {
          ctx.shadowBlur = p.blur
          ctx.shadowColor = p.color
        }
        ctx.translate(cx, cy)
        ctx.rotate(rot)
        ctx.scale(fadeScale, fadeScale)

        ctx.fillStyle = p.color
        roundRect(ctx, -p.size / 2, -p.size / 2, p.size, p.size, p.cornerRadius)
        ctx.fill()

        ctx.shadowBlur = 0
        const iconSize = p.size * 0.4
        const scale = iconSize / 24
        ctx.translate(-iconSize / 2, -iconSize / 2)
        ctx.scale(scale, scale)
        ctx.fillStyle = p.iconColor
        ctx.fill(getIconPath2D(p.iconPath))

        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [getIconPath2D])

  return <canvas ref={canvasRef} className={styles.bokeh} aria-hidden="true" tabIndex={-1} />
}
