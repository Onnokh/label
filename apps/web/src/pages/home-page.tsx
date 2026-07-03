import { useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react"

const appStoreUrl = "https://apps.apple.com/nl/app/sleevy/id6770653332"
const raycastStoreUrl = "https://www.raycast.com/onnokh/sleevy"

const wrapRange = (min: number, max: number, v: number) => {
  const range = max - min
  return min + ((((v - min) % range) + range) % range)
}

// Number of identical tiles per marquee row; the pattern repeats every
// 100 / EXTEND_TILES percent of track width, which is what wrapRange scrubs over.
const EXTEND_TILES = 10

/**
 * One endlessly-drifting row of the "Built to extend." ticker. baseVelocity is
 * percent of track width per second (sign = direction); scroll velocity feeds
 * back into the speed and scrolling up reverses the drift.
 */
function ExtendMarqueeRow({ baseVelocity, className }: { baseVelocity: number; className?: string }) {
  const baseX = useMotionValue(0)
  const { scrollY } = useScroll()
  const scrollVelocity = useVelocity(scrollY)
  const smoothVelocity = useSpring(scrollVelocity, { damping: 50, stiffness: 400 })
  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 5], { clamp: false })
  const directionFactor = useRef(1)
  const reduceMotion = useReducedMotion()

  const x = useTransform(baseX, (v) => `${wrapRange(-100 / EXTEND_TILES, 0, v)}%`)

  useAnimationFrame((_, delta) => {
    if (reduceMotion) return
    let moveBy = directionFactor.current * baseVelocity * (delta / 1000)
    if (velocityFactor.get() < 0) {
      directionFactor.current = -1
    } else if (velocityFactor.get() > 0) {
      directionFactor.current = 1
    }
    moveBy += directionFactor.current * moveBy * velocityFactor.get()
    baseX.set(baseX.get() + moveBy)
  })

  const tiles = Array.from({ length: EXTEND_TILES }, (_, i) => <span key={i}>Built to extend.</span>)

  // Two identical tracks sharing one x: a dimmed base plus a full-opacity copy
  // behind a stationary center mask, so the tile passing the middle lights up.
  return (
    <div className={className ? `extend-marquee-row ${className}` : "extend-marquee-row"}>
      <motion.div className="extend-marquee-track extend-marquee-track-dim" style={{ x }}>
        {tiles}
      </motion.div>
      <div className="extend-marquee-spotlight">
        <motion.div className="extend-marquee-track" style={{ x }}>
          {tiles}
        </motion.div>
      </div>
    </div>
  )
}

// Heroicons 24/solid path data (https://heroicons.com), filled with the shared
// usp gradient below instead of a flat color.
const usps = [
  {
    title: "One tap to capture",
    body: "Save any link the instant you find it. No app switching, no friction.",
    // cursor-arrow-ripple
    paths: [
      "M17.3033 5.1967C14.3744 2.26777 9.62563 2.26777 6.6967 5.1967C3.76777 8.12563 3.76777 12.8744 6.6967 15.8033C6.98959 16.0962 6.98959 16.5711 6.6967 16.864C6.40381 17.1569 5.92893 17.1569 5.63604 16.864C2.12132 13.3492 2.12132 7.65076 5.63604 4.13604C9.15076 0.62132 14.8492 0.62132 18.364 4.13604C20.1211 5.89321 21 8.19775 21 10.4998C21 10.9141 20.6642 11.2498 20.25 11.2499C19.8358 11.2499 19.5 10.9141 19.5 10.4999C19.5 8.57933 18.7679 6.66128 17.3033 5.1967ZM15.182 7.31802C13.4246 5.56066 10.5754 5.56066 8.81802 7.31802C7.06066 9.07538 7.06066 11.9246 8.81802 13.682C9.11091 13.9749 9.11091 14.4497 8.81802 14.7426C8.52513 15.0355 8.05025 15.0355 7.75736 14.7426C5.41421 12.3995 5.41421 8.60051 7.75736 6.25736C10.1005 3.91421 13.8995 3.91421 16.2426 6.25736C17.414 7.42877 18 8.96558 18 10.4999C18 10.9141 17.6642 11.2499 17.25 11.2499C16.8358 11.2499 16.5 10.9142 16.5 10.4999C16.5 9.34715 16.0608 8.19683 15.182 7.31802ZM11.5484 8.63179C11.8602 8.54824 12.1905 8.67359 12.3684 8.94299L17.5955 16.8599C17.7627 17.113 17.7609 17.4419 17.591 17.6932C17.421 17.9445 17.1165 18.0687 16.8193 18.0079L14.722 17.5787L15.7668 21.4777C15.874 21.8778 15.6365 22.289 15.2364 22.3963C14.8363 22.5035 14.4251 22.266 14.3179 21.8659L13.2732 17.967L11.6717 19.3872C11.4447 19.5884 11.1189 19.6332 10.8461 19.5005C10.5733 19.3678 10.4073 19.0839 10.4254 18.7811L10.9939 9.3113C11.0132 8.98905 11.2366 8.71534 11.5484 8.63179Z",
    ],
  },
  {
    title: "Lives in all your tools",
    body: "Phone, Raycast, browser and scripts. Every surface you touch can save to Sleevy.",
    // wrench-screwdriver
    paths: [
      "M12 6.75C12 3.85051 14.3505 1.5 17.25 1.5C17.7791 1.5 18.2913 1.57852 18.7747 1.72505C19.027 1.80151 19.2206 2.00479 19.2847 2.26048C19.3488 2.51618 19.2739 2.78674 19.0875 2.97313L15.7688 6.29183C15.8305 6.76741 16.0438 7.22581 16.409 7.59099C16.7742 7.95617 17.2326 8.16947 17.7082 8.23117L21.0269 4.91247C21.2133 4.72608 21.4838 4.65122 21.7395 4.7153C21.9952 4.77938 22.1985 4.97299 22.275 5.22526C22.4215 5.7087 22.5 6.22086 22.5 6.75C22.5 9.64949 20.1495 12 17.25 12C17.0995 12 16.9503 11.9936 16.8027 11.9812C15.7855 11.8952 14.9338 12.0816 14.4944 12.6151L7.34327 21.2987C6.71684 22.0593 5.78308 22.5 4.79769 22.5C2.97642 22.5 1.5 21.0236 1.5 19.2023C1.5 18.2169 1.94067 17.2832 2.70132 16.6567L11.3849 9.50557C11.9184 9.06623 12.1048 8.21453 12.0188 7.19728C12.0064 7.04968 12 6.9005 12 6.75ZM4.11723 19.125C4.11723 18.7108 4.45302 18.375 4.86723 18.375H4.87473C5.28895 18.375 5.62473 18.7108 5.62473 19.125V19.1325C5.62473 19.5468 5.28895 19.8825 4.87473 19.8825H4.86723C4.45302 19.8825 4.11723 19.5468 4.11723 19.1325V19.125Z",
      "M10.076 8.64031L7.87502 6.43936V4.87502C7.87502 4.61157 7.73679 4.36744 7.51089 4.2319L3.76089 1.9819C3.46578 1.80483 3.08804 1.85133 2.84469 2.09469L2.09469 2.84469C1.85133 3.08804 1.80483 3.46578 1.9819 3.76089L4.2319 7.51089C4.36744 7.73679 4.61157 7.87502 4.87502 7.87502H6.43936L8.50138 9.93704L10.076 8.64031Z",
      "M12.5559 17.3287L16.7386 21.5114C18.0567 22.8294 20.1936 22.8294 21.5116 21.5114C22.8296 20.1934 22.8296 18.0565 21.5116 16.7385L18.206 13.4328C17.8937 13.4771 17.5746 13.5 17.2501 13.5C17.0574 13.5 16.866 13.4918 16.6765 13.4758C16.2822 13.4425 15.994 13.4696 15.8089 13.5177C15.7053 13.5446 15.6574 13.5713 15.6419 13.5814L12.5559 17.3287ZM15.9698 15.9697C16.2627 15.6768 16.7375 15.6768 17.0304 15.9697L18.9054 17.8447C19.1983 18.1376 19.1983 18.6124 18.9054 18.9053C18.6125 19.1982 18.1377 19.1982 17.8448 18.9053L15.9698 17.0303C15.6769 16.7374 15.6769 16.2626 15.9698 15.9697Z",
    ],
  },
  {
    title: "Save on one, read on the other",
    body: "Your queue syncs instantly across devices, so it's current wherever you open it.",
    // device-phone-mobile
    paths: [
      "M10.5 18.75C10.0858 18.75 9.75 19.0858 9.75 19.5C9.75 19.9142 10.0858 20.25 10.5 20.25H13.5C13.9142 20.25 14.25 19.9142 14.25 19.5C14.25 19.0858 13.9142 18.75 13.5 18.75H10.5Z",
      "M8.625 0.75C6.76104 0.75 5.25 2.26104 5.25 4.125V19.875C5.25 21.739 6.76104 23.25 8.625 23.25H15.375C17.239 23.25 18.75 21.739 18.75 19.875V4.125C18.75 2.26104 17.239 0.75 15.375 0.75H8.625ZM7.5 4.125C7.5 3.50368 8.00368 3 8.625 3H9.75V3.375C9.75 3.99632 10.2537 4.5 10.875 4.5H13.125C13.7463 4.5 14.25 3.99632 14.25 3.375V3H15.375C15.9963 3 16.5 3.50368 16.5 4.125V19.875C16.5 20.4963 15.9963 21 15.375 21H8.625C8.00368 21 7.5 20.4963 7.5 19.875V4.125Z",
    ],
  },
]

export function HomePage() {
  const reduceMotion = useReducedMotion()
  // The pin/expand runs on all sizes (portrait vs landscape framing is handled by
  // CSS vars per breakpoint); only prefers-reduced-motion falls back to a static hero.
  const animateHero = !reduceMotion
  const [glowVisible, setGlowVisible] = useState(false)
  const glowX = useMotionValue(0)
  const glowY = useMotionValue(0)
  const springX = useSpring(glowX, { stiffness: 220, damping: 30, mass: 0.5 })
  const springY = useSpring(glowY, { stiffness: 220, damping: 30, mass: 0.5 })

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
  // The poses are CSS custom-property pairs defined on .marketing-page /
  // .marketing-hero (see marketing.css) and swapped per breakpoint by media query,
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
  // .hero-follow-inner::before shadow). Only the top border fades — the top
  // edge is pinned to the viewport top throughout, so it can never exit.
  const heroBorderTop = useTransform(expand, [0, 1], ["rgba(255,255,255,0.35)", "rgba(255,255,255,0)"])
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
      <div className="hero-track" ref={heroTrackRef} style={animateHero ? undefined : { height: "auto" }}>
      {/* Page-level edge glows from Figma (Group 38): shared pre-rendered white
          blob, sitting on the body behind the hero card and follow strip. */}
      <img className="page-glow page-glow-hero-left" src="/page-glow.webp" alt="" aria-hidden="true" />
      <motion.section
        className="marketing-hero"
        aria-label="Sleevy"
        onPointerMove={handleHeroPointerMove}
        onPointerEnter={() => !reduceMotion && setGlowVisible(true)}
        onPointerLeave={() => setGlowVisible(false)}
        style={
          animateHero
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
        {/* Glow blobs pre-rendered as 2x transparent lossless WebPs (no SVG-filter banding),
            split across two layers to match the Figma stacking: back sits behind
            the phone, front floats above it. */}
        <div className="hero-bg" aria-hidden="true">
          <img className="hero-bg-grid" src="/hero-grid.svg" alt="" />
          <img className="hero-bg-layer" src="/hero-blobs-back.webp" alt="" />
        </div>
        {reduceMotion ? null : (
          <motion.div
            className="hero-glow"
            aria-hidden="true"
            style={{ x: springX, y: springY }}
            animate={{ opacity: glowVisible ? 1 : 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        )}
        <motion.div
          className="hero-content"
          style={animateHero ? { opacity: contentOpacity, pointerEvents: contentPointer } : undefined}
        >
          <h1 className="hero-title">
            <span>One tap to save.</span>
            <span>every device in sync.</span>
          </h1>
          <p className="hero-sub">
            A bookmark manager you can script, <strong>automate</strong>, and extend.
          </p>
          <motion.a
            className="hero-cta"
            href={appStoreUrl}
            aria-label="Download on the App Store"
            whileHover={reduceMotion ? undefined : { scale: 1.05, y: -2 }}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <img src="/app-store-352.webp" alt="Download on the App Store" width={352} height={118} />
          </motion.a>
        </motion.div>
        <motion.div
          className="hero-phone-wrap"
          style={animateHero ? { transform: phoneTransform } : undefined}
        >
          <motion.img
            className="hero-phone"
            src="/hero-phone-full.webp"
            alt="Sleevy inbox on iPhone"
            width={613}
            height={1252}
            fetchPriority="high"
            initial={
              reduceMotion
                ? { y: 0, scale: 1, filter: "blur(0px)", opacity: 1 }
                : { y: "40%", scale: 1.3, filter: "blur(18px)", opacity: 0 }
            }
            animate={{ y: 0, scale: 1, filter: "blur(0px)", opacity: 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { delay: 0.45, duration: 1.7, ease: [0.22, 1, 0.36, 1] }
            }
          />
        </motion.div>
        <div className="hero-bg hero-bg-over" aria-hidden="true">
          <img className="hero-bg-layer" src="/hero-blobs-front.webp" alt="" />
        </div>
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-fade" aria-hidden="true">
          <div className="hero-fade-layer" />
          <div className="hero-fade-layer" />
          <div className="hero-fade-layer" />
          <div className="hero-fade-layer" />
          <div className="hero-fade-layer" />
        </div>
      </motion.section>
      </div>

      {/* Everything after the hero is pulled up over the track's runway so the page
          visually continues right beneath the aspect-sized hero (no whitespace, even
          in the static layout). While the hero animates, the inner sticky wrapper
          parks in place; once the runway is consumed it slides up OVER the pinned
          full-bleed hero like a curtain. Static fallback: normal flow. */}
      <div className="hero-follow" style={animateHero ? undefined : { marginTop: "var(--hero-gap)" }}>
      {/* --hero-seam fades in the strip's ::before (the hero's bottom shadow,
          re-cast from the strip side of the seam — see marketing.css). It tracks
          heightExpand: the same ramp that closes the rest gap, so the fake shadow
          takes over exactly as the hero's real one gets squeezed out. */}
      <motion.div
        className="hero-follow-inner"
        style={animateHero ? { "--hero-seam": heightExpand } : { position: "static" }}
      >

      {/* Right-edge glow lives inside the strip (the strip's solid background
          would curtain a track-level glow); the ellipse fades in from the strip
          top so nothing pokes over the hero card. */}
      <img className="page-glow page-glow-hero-right" src="/page-glow.webp" alt="" aria-hidden="true" />

      <section className="usp-section" aria-label="Why Sleevy">
        <svg aria-hidden="true" width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <linearGradient id="usp-icon-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
              <stop offset="8.82%" stopColor="#FFFFFF" />
              <stop offset="90.88%" stopColor="#6E6ECD" />
            </linearGradient>
          </defs>
        </svg>
        <div className="usp-grid">
          {usps.map((usp) => (
            <article className="usp" key={usp.title}>
              <svg className="usp-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {usp.paths.map((d) => (
                  <path
                    key={d}
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d={d}
                    fill="url(#usp-icon-gradient)"
                    stroke="#fff"
                    strokeOpacity={0.3}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              <h3>{usp.title}</h3>
              <p>{usp.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="highlight-section" aria-label="Sleevy on every surface">
        <div className="highlight-grid">
          <article className="highlight-card">
            <div className="highlight-card-frame highlight-frame-share">
              <h3>Native Share</h3>
              <p>Hit share in any app, pick Sleevy, and the link is saved. Nothing to copy or paste.</p>
              <img
                className="highlight-shot highlight-shot-share"
                src="/share-sheet-750.webp"
                alt="iOS share sheet with Sleevy selected"
                width={750}
                height={906}
                loading="lazy"
              />
            </div>
            <img className="highlight-icon" src="/ios26-82.webp" alt="" width={82} height={82} loading="lazy" />
            <a className="highlight-cta" href={appStoreUrl}>
              <img src="/appstore-glyph-96.webp" alt="" width={96} height={96} loading="lazy" />
              Install on your iPhone
            </a>
          </article>
          <article className="highlight-card">
            <div className="highlight-card-frame highlight-frame-raycast">
              <h3>In your workflow</h3>
              <p>Capture and search from Raycast without leaving the keyboard.</p>
              <img
                className="highlight-shot highlight-shot-raycast"
                src="/raycast-search-1508.webp"
                alt="Searching saved items from Raycast"
                width={1508}
                height={958}
                loading="lazy"
              />
            </div>
            <img
              className="highlight-icon highlight-icon-raycast"
              src="/raycast-82.webp"
              alt=""
              width={82}
              height={82}
              loading="lazy"
            />
            <a className="highlight-cta highlight-cta-raycast" href={raycastStoreUrl}>
              <img src="/raycast-82.webp" alt="" width={82} height={82} loading="lazy" />
              Add to your Raycast
            </a>
          </article>
        </div>
      </section>

      <section className="extend-section" aria-labelledby="extend-title">
        <img className="page-glow page-glow-extend" src="/page-glow.webp" alt="" aria-hidden="true" />
        <h2 className="extend-title" id="extend-title">
          Built to extend.
        </h2>
        <div className="extend-marquee" aria-hidden="true">
          <ExtendMarqueeRow baseVelocity={-2} />
          <ExtendMarqueeRow baseVelocity={2} className="extend-marquee-row-offset" />
        </div>
        <div className="extend-body">
          <p>
            Sleevy exposes a capture API with personal access tokens. Anything that can make an HTTP request
            can save to your queue, from scripts and CLI tools to automations and whatever you build next.
          </p>
          <ul>
            <li>Personal tokens with scoped permissions per device or script</li>
            <li>Simple JSON over HTTPS, no SDK required</li>
            <li>Webhooks for archive, tag, and read events</li>
            <li>Rate-limited per token</li>
          </ul>
        </div>
        <div className="extend-footer">
          <Link to="/docs">
            Take me to the docs
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M9 13L14 8L9 3M14 8H2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </section>

      <section className="browser-section" aria-labelledby="browser-title">
        <img className="browser-icon" src="/chrome-76.webp" alt="" width={76} height={82} loading="lazy" />
        <h2 id="browser-title">And it's in your browser too</h2>
        <p>One click in your toolbar saves the tab you're on. The full library opens in the web app.</p>
        <div className="browser-frame">
          <img
            className="browser-shot-glow"
            src="/web-companion-1087.webp"
            alt=""
            aria-hidden="true"
            width={1087}
            height={576}
            loading="lazy"
          />
          <img
            className="browser-shot"
            src="/web-companion-1087.webp"
            alt="Sleevy web app showing the inbox with saved links"
            width={1087}
            height={576}
            loading="lazy"
          />
        </div>
      </section>

      </motion.div>
      {/* Sticky park range for .hero-follow-inner — must be a sibling, not the
          inner's own margin (see marketing.css). Collapsed in the static layout. */}
      <div className="hero-follow-spacer" aria-hidden="true" style={animateHero ? undefined : { height: 0 }} />
      </div>
    </>
  )
}
