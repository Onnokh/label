import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  m,
  type MotionStyle,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react"

import { appStoreUrl } from "../store-links"
import { BlueMeshGradient } from "./blue-mesh-gradient"
import styles from "./hero.module.scss"

/**
 * The pinned hero card plus the scroll mechanism around it: the track (pin
 * runway), the hero's rest→full-bleed expand, and the follow strip that parks
 * over the runway and then releases in sync. Children render inside the follow
 * strip, so the hero owns everything the animation couples together.
 */
export function Hero({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion()
  // The pin/expand runs on all sizes (portrait vs landscape framing is handled by
  // CSS vars per breakpoint); only prefers-reduced-motion falls back to a static hero.
  const animateHero = !reduceMotion
  // Scroll-linked Motion styles are applied only after the first scroll: rendering
  // them during SSR/initial hydration mismatches React (the MotionValue inline
  // styles don't match the static CSS rest pose the server emits). Until then the
  // hero sits in its CSS rest pose; the expand can't be seen without scrolling
  // anyway, so nothing is lost.
  const [hasScrolled, setHasScrolled] = useState(false)
  const [glowVisible, setGlowVisible] = useState(false)
  const glowX = useMotionValue(0)
  const glowY = useMotionValue(0)
  const springX = useSpring(glowX, { stiffness: 220, damping: 30, mass: 0.5 })
  const springY = useSpring(glowY, { stiffness: 220, damping: 30, mass: 0.5 })

  useEffect(() => {
    const activate = () => setHasScrolled(true)
    if (window.scrollY > 0) activate()
    window.addEventListener("scroll", activate, { once: true, passive: true })
    return () => window.removeEventListener("scroll", activate)
  }, [])

  // Scroll-driven full-bleed expand: as the page scrolls, the hero grows edge to
  // edge (losing its inset + radius) while the phone shrinks into full view.
  // Driven by the track's own scroll progress (0→1 across the pinned runway) rather
  // than px thresholds, so the animation is resolution-independent and scales with
  // the viewport just like the vw-based sizing.
  const heroTrackRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroTrackRef,
    offset: ["start start", "end end"],
  })
  // The track's scrub range now equals the follow strip's park phase (hero un-pins
  // when the park runs out), so completing at 55% leaves a 45% full-bleed hold
  // before everything releases together.
  const rawExpand = useTransform(scrollYProgress, [0, 0.55], [0, 1], { clamp: true })
  const expand = useSpring(rawExpand, { stiffness: 120, damping: 26, mass: 0.4 })
  const collapse = useTransform(expand, [0, 1], [1, 0])
  // Height gets its own faster ramp: the hero must grow roughly as fast as the page
  // scrolls, or its bottom edge lifts away from the parked follow content and opens
  // a widening gap early in the scrub. Growth happens toward/below the parked strip,
  // so the quicker pace is invisible. Unsprung — spring lag would reopen the gap.
  const heightExpand = useTransform(scrollYProgress, [0, 0.15], [0, 1], { clamp: true })
  const heightCollapse = useTransform(heightExpand, (v) => 1 - v)

  // Every property below is the same shape: lerp between its rest and end pose,
  //   value = var(--x-rest) · collapse + var(--x-end) · expand
  // The poses are CSS custom-property pairs defined on .track / .follow / .hero
  // (see hero.module.scss) and swapped per breakpoint by media query,
  // so the browser resolves the right pose per viewport with no JS branching.
  const heroWidth = useMotionTemplate`calc(var(--hero-w-rest) * ${collapse} + var(--hero-w-end) * ${expand})`
  // Explicit centering margin: same as `margin: auto` at rest, but keeps
  // centering once the width passes the container (--hero-w-end is 100vw + 2px
  // so the side borders exit the viewport; auto margins clamp to 0 there).
  const heroMarginLeft = useMotionTemplate`calc((100% - var(--hero-w-rest) * ${collapse} - var(--hero-w-end) * ${expand}) / 2)`
  const heroHeight = useMotionTemplate`calc(var(--hero-h-rest) * ${heightCollapse} + var(--hero-h-end) * ${heightExpand})`
  const heroRadius = useMotionTemplate`calc(var(--hero-radius-rest) * ${collapse} + var(--hero-radius-end) * ${expand})`
  // The border rides the animated edges: the sides exit the viewport with the
  // 2px end-pose oversize, and the bottom stays put at the seam (with the
  // .followInner::before shadow). Only the top border fades — the top
  // edge is pinned to the viewport top throughout, so it can never exit.
  const heroBorderTop = useTransform(expand, [0, 1], ["rgba(255,255,255,0.06)", "rgba(255,255,255,0)"])
  // Same lerp per transform component: translateY rest→end, scale rest→end.
  // (--phone-y-rest is a % of the phone's own height; --phone-y-end is a length —
  // translateY resolves both.)
  const phoneTransform = useMotionTemplate`translateX(-50%) translateY(calc(var(--phone-y-rest) * ${collapse} + var(--phone-y-end) * ${expand})) scale(calc(var(--phone-scale-rest) * ${collapse} + var(--phone-scale-end) * ${expand}))`
  // Fade out well before the rising phone reaches the CTA (it makes contact at
  // expand ≈ 0.37 on desktop, earlier on mobile where the phone is larger), so
  // the text and button are gone before they could visually touch.
  const contentOpacity = useTransform(expand, [0, 0.22], [1, 0])
  const contentPointer = useTransform(expand, [0, 0.22], ["auto", "none"])

  function handleHeroPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (reduceMotion) return
    const rect = event.currentTarget.getBoundingClientRect()
    glowX.set(event.clientX - rect.left)
    glowY.set(event.clientY - rect.top)
  }

  return (
    <>
      <div className={styles.track} ref={heroTrackRef} style={animateHero ? undefined : { height: "auto" }}>
        {/* Page-level edge glows from Figma (Group 38): shared pre-rendered white
            blob, sitting on the body behind the hero card and follow strip. */}
        <div className={styles.glowLeft} aria-hidden="true" />
        <m.section
          className={styles.hero}
          aria-label="Sleevy"
          onPointerMove={handleHeroPointerMove}
          onPointerEnter={() => !reduceMotion && setGlowVisible(true)}
          onPointerLeave={() => setGlowVisible(false)}
          style={
            animateHero && hasScrolled
              ? {
                  width: heroWidth,
                  height: heroHeight,
                  marginLeft: heroMarginLeft,
                  borderRadius: heroRadius,
                  borderTopColor: heroBorderTop,
                }
              : { position: "relative" }
          }
        >
          {/* Glow blobs pre-rendered as transparent AVIFs (no SVG-filter banding),
              split across two layers to match the Figma stacking: back sits behind
              the phone, front floats above it. */}
          <div className={styles.bg} aria-hidden="true">
            <BlueMeshGradient />
            <img className={styles.bgGrid} src="/hero-grid.svg" alt="" />
          </div>
          {reduceMotion ? null : (
            <m.div
              className={styles.glow}
              aria-hidden="true"
              style={{ x: springX, y: springY }}
              animate={{ opacity: glowVisible ? 1 : 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          )}
          <m.div
            className={styles.content}
            style={animateHero && hasScrolled ? { opacity: contentOpacity, pointerEvents: contentPointer } : undefined}
          >
            <h1 className={styles.title}>
              <span>One tap to save.</span>
              <span>every device in sync.</span>
            </h1>
            <p className={styles.sub}>
              A bookmark manager you can script, <strong>automate</strong>, and extend.
            </p>
            <m.a
              className={styles.cta}
              href={appStoreUrl}
              aria-label="Download on the App Store"
              whileHover={reduceMotion ? undefined : { scale: 1.05, y: -2 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <img src="/app-store-352.webp" alt="Download on the App Store" width={352} height={118} />
            </m.a>
          </m.div>
          {/* Entrance is a CSS keyframe animation (see .phone), not Motion: it must
              render into the SSR HTML so the phone appears (and animates) before —
              or without — any JavaScript. Motion only drives the scroll expand via
              the wrapper transform. */}
          <m.div className={styles.phoneWrap} style={animateHero && hasScrolled ? { transform: phoneTransform } : undefined}>
            {/* No fetchPriority boost: the entrance keeps the phone blurred out for
                its first ~half second, so it can afford to load after the blob
                layers — which paint immediately and set the page's LCP. */}
            <img
              className={styles.phone}
              src="/hero-phone-full.webp"
              alt="Sleevy inbox on iPhone"
              width={613}
              height={1252}
            />
          </m.div>
          <div className={styles.grain} aria-hidden="true" />
          <div className={styles.fade} aria-hidden="true">
            <div className={styles.fadeLayer} />
            <div className={styles.fadeLayer} />
            <div className={styles.fadeLayer} />
            <div className={styles.fadeLayer} />
            <div className={styles.fadeLayer} />
          </div>
        </m.section>
      </div>

      {/* Everything after the hero is pulled up over the track's runway so the page
          visually continues right beneath the aspect-sized hero (no whitespace, even
          in the static layout). While the hero animates, the inner sticky wrapper
          parks in place; once the runway is consumed it slides up OVER the pinned
          full-bleed hero like a curtain. Static fallback: normal flow. */}
      <div className={styles.follow} style={animateHero ? undefined : { marginTop: "var(--hero-gap)" }}>
        {/* --hero-seam fades in the strip's ::before (the hero's bottom shadow,
            re-cast from the strip side of the seam — see hero.module.scss). It tracks
            heightExpand: the same ramp that closes the rest gap, so the fake shadow
            takes over exactly as the hero's real one gets squeezed out. */}
        <m.div
          className={styles.followInner}
          style={
            animateHero
              ? hasScrolled
                ? ({ "--hero-seam": heightExpand } as MotionStyle)
                : undefined
              : { position: "static" }
          }
        >
          {/* Right-edge glow lives inside the strip (the strip's solid background
              would curtain a track-level glow); the ellipse fades in from the strip
              top so nothing pokes over the hero card. */}
          <div className={styles.glowRight} aria-hidden="true" />

          {children}
        </m.div>
        {/* Sticky park range for .followInner — must be a sibling, not the
            inner's own margin (see hero.module.scss). Collapsed in the static layout. */}
        <div className={styles.spacer} aria-hidden="true" style={animateHero ? undefined : { height: 0 }} />
      </div>
    </>
  )
}
