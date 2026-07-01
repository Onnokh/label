import { useRef, useState, type ReactNode } from "react"
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react"

const raycastStoreUrl = "https://www.raycast.com/onnokh/sleevy"

const captureMethods = [
  {
    title: "Raycast Plugin",
    body: "Capture from your launcher and keep moving.",
    action: "Install on Raycast",
    href: raycastStoreUrl,
    icon: "/raycast-82.webp",
    iconWidth: 82,
    iconHeight: 82,
  },
  {
    title: "Native Share",
    body: "Tap the share button on any page or link, pick Sleeve, and it lands in your queue.",
    action: "Install Sleevy",
    href: "https://apps.apple.com/nl/app/sleevy/id6770653332",
    icon: "/ios26-82.webp",
    iconWidth: 82,
    iconHeight: 82,
  },
  {
    title: "Chrome Extension",
    body: "Click the Sleeve icon in your toolbar. The current tab is captured instantly.",
    action: "Install Extension",
    href: "https://chromewebstore.google.com/detail/sleevy/ogffdakffimomfahfpihfmgdaincemjj",
    icon: "/chrome-76.webp",
    iconWidth: 76,
    iconHeight: 82,
  },
  {
    title: "Web Companion",
    body: "Paste a URL into the web app and hit save when you are already browsing on desktop.",
    action: "Login",
    href: "/inbox",
    icon: "/app-icon-160.webp",
    iconWidth: 160,
    iconHeight: 160,
  },
]

const companionFeatures = [
  {
    eyebrow: "sync",
    title: "Save on one, read on the other",
    body: "They sync before you can open your inbox, your items are everywhere.",
  },
  {
    eyebrow: "filter",
    title: "Tags, sources, full-text",
    body: "Filter your queue by tag or capture source.",
  },
  {
    eyebrow: "keyboard",
    title: "Fully driveable from the keys",
    body: "j/k to navigate, o to open, n to capture and fuzzy find from the command palette.",
  },
]

const apiExamples = {
  capture: (
    <>
      <span className="terminal-comment"># Save a link from anywhere with an HTTP request</span>
      <span><span className="terminal-muted">$</span> curl -X POST https://api.sleevy.app/v1/captures \</span>
      <span>  -H <span className="terminal-string">"Authorization: Bearer $SLEEVY_API_KEY"</span> \</span>
      <span>  -H <span className="terminal-string">"Content-Type: application/json"</span> \</span>
      <span>  -d <span className="terminal-string">'{`{`}</span></span>
      <span className="terminal-string">      "url": "https://notes.dev/tiny-css",</span>
      <span className="terminal-string">      "captureChannel": "api",</span>
      <span className="terminal-string">      "tags": ["design", "front-end"]</span>
      <span>    <span className="terminal-string">{`}`}'</span></span>
      <span />
      <span>{`{`}</span>
      <span>  <span className="terminal-key">"savedItem"</span>: {`{`}</span>
      <span>    <span className="terminal-key">"id"</span>: <span className="terminal-string">"itm_8f2c9a"</span>,</span>
      <span>    <span className="terminal-key">"originalUrl"</span>: <span className="terminal-string">"https://notes.dev/tiny-css"</span>,</span>
      <span>    <span className="terminal-key">"title"</span>: <span className="terminal-string">"The case for tiny stylesheets"</span>,</span>
      <span>    <span className="terminal-key">"type"</span>: <span className="terminal-string">"article"</span>,</span>
      <span>    <span className="terminal-key">"tags"</span>: [<span className="terminal-string">"design"</span>, <span className="terminal-string">"front-end"</span>],</span>
      <span>    <span className="terminal-key">"lastSavedAt"</span>: <span className="terminal-string">"2026-05-08T14:21:09Z"</span>,</span>
      <span>    <span className="terminal-muted">...</span></span>
      <span>  {`}`},</span>
      <span>  <span className="terminal-key">"captureResult"</span>: <span className="terminal-string">"created"</span></span>
      <span>{`}`}</span>
      <span />
      <span><span className="terminal-muted">$</span> <span className="terminal-success">Saved to queue - open in app</span></span>
    </>
  ),
  queue: (
    <>
      <span className="terminal-comment"># Pull the latest items waiting in your queue</span>
      <span><span className="terminal-muted">$</span> curl https://api.sleevy.app/v1/saved-items?sort=newest \</span>
      <span>  -H <span className="terminal-string">"Authorization: Bearer $SLEEVY_API_KEY"</span></span>
      <span />
      <span>{`{`}</span>
      <span>  <span className="terminal-key">"savedItems"</span>: [</span>
      <span>    {`{`}</span>
      <span>      <span className="terminal-key">"id"</span>: <span className="terminal-string">"itm_8f2c9a"</span>,</span>
      <span>      <span className="terminal-key">"originalUrl"</span>: <span className="terminal-string">"https://notes.dev/tiny-css"</span>,</span>
      <span>      <span className="terminal-key">"title"</span>: <span className="terminal-string">"The case for tiny stylesheets"</span>,</span>
      <span>      <span className="terminal-key">"tags"</span>: [<span className="terminal-string">"design"</span>, <span className="terminal-string">"front-end"</span>],</span>
      <span>      <span className="terminal-key">"lastSavedAt"</span>: <span className="terminal-string">"2026-05-08T14:21:09Z"</span>,</span>
      <span>      <span className="terminal-muted">...</span></span>
      <span>    {`}`}</span>
      <span>  ]</span>
      <span>{`}`}</span>
    </>
  ),
} satisfies Record<string, ReactNode>

export function HomePage() {
  const [apiExample, setApiExample] = useState<keyof typeof apiExamples>("capture")
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

  // All the framing constants live in CSS custom properties on .marketing-hero and
  // are swapped per breakpoint by media query (landscape on desktop/tablet, portrait
  // on mobile). The motion templates just read them via var(), so the browser
  // resolves the right value per viewport with no JS branching.
  const heroWidth = useMotionTemplate`calc(min(100vw - var(--hero-gutter), 71rem) * ${collapse} + 100vw * ${expand})`
  // Rest: aspect-locked height. End: the stage — growing any taller would just hide
  // behind the parked follow strip, and stage is width-derived, so every animation
  // frame (not just rest and end) composes 1:1 by viewport width.
  const heroHeight = useMotionTemplate`calc(min(100vw - var(--hero-gutter), 71rem) * var(--hero-aspect) * ${heightCollapse} + var(--stage) * ${heightExpand})`
  const heroRadius = useMotionTemplate`calc(var(--hero-radius) * ${collapse})`
  const heroBorder = useTransform(expand, [0, 1], ["rgba(255,255,255,0.35)", "rgba(255,255,255,0)"])
  // Phone transform in one string: center X, slide from the rest top-slice down to
  // the vertical center of the stage (--phone-end-y — width-derived so a given
  // width composes identically at any window height), and shrink to the end scale.
  const phoneTransform = useMotionTemplate`translateX(-50%) translateY(calc(var(--phone-rest-y) * ${collapse} + var(--phone-end-y) * ${expand})) scale(calc(1 - (1 - var(--phone-end-scale)) * ${expand}))`
  const contentOpacity = useTransform(expand, [0, 0.4], [1, 0])
  const contentPointer = useTransform(expand, [0, 0.4], ["auto", "none"])

  function handleHeroPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (reduceMotion) return
    const rect = event.currentTarget.getBoundingClientRect()
    glowX.set(event.clientX - rect.left)
    glowY.set(event.clientY - rect.top)
  }

  return (
    <>
      <div className="hero-track" ref={heroTrackRef} style={animateHero ? undefined : { height: "auto" }}>
      <motion.section
        className="marketing-hero"
        aria-label="Sleevy"
        onPointerMove={handleHeroPointerMove}
        onPointerEnter={() => !reduceMotion && setGlowVisible(true)}
        onPointerLeave={() => setGlowVisible(false)}
        style={
          animateHero
            ? { width: heroWidth, height: heroHeight, borderRadius: heroRadius, borderColor: heroBorder }
            : { position: "relative" }
        }
      >
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
            href="https://apps.apple.com/nl/app/sleevy/id6770653332"
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
      <div className="hero-follow" style={animateHero ? undefined : { marginTop: "4.5rem" }}>
      <div className="hero-follow-inner" style={animateHero ? undefined : { position: "static" }}>

      <section className="capture-section">
        <p className="marketing-eyebrow">one-click capture</p>
        <h2>Save from wherever you are.</h2>
        <div className="capture-grid">
          {captureMethods.map((method) => (
            <article className="capture-card" key={method.title}>
              <img src={method.icon} alt="" width={method.iconWidth} height={method.iconHeight} loading="lazy" />
              <h3>{method.title}</h3>
              <p>{method.body}</p>
              {method.action ? <a className={method.href ? undefined : "disabled"} href={method.href ?? "#"}>{method.action}</a> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="companion-section">
        <p className="marketing-eyebrow">companion</p>
        <h2>Your links, organized everywhere.</h2>
        <div className="companion-preview">
          <img src="/screenshot-1360.webp" alt="" width={1360} height={944} loading="lazy" />
        </div>
        <div className="companion-features">
          {companionFeatures.map((feature) => (
            <article key={feature.title}>
              <span>{feature.eyebrow}</span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="api-section">
        <div className="api-copy">
          <p className="marketing-eyebrow">API</p>
          <h2>Built to extend.</h2>
          <p>
            Sleevy exposes a REST API with personal API Keys, so your bookmark manager can accept links from
            scripts, shortcuts, tools, and automations.
          </p>
          <ul>
            <li>Personal API Keys for devices, scripts, and automations</li>
            <li>Simple JSON over HTTPS, no SDK required</li>
            <li>Capture, list, read state, and delete endpoints</li>
            <li>Rate-limited per API Key</li>
          </ul>
        </div>
        <div className="api-terminal" aria-label="API example">
          <div className="api-terminal-chrome">
            <div className="api-terminal-controls" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span className="api-terminal-title">~/sleeve - zsh</span>
            <div className="api-terminal-tabs" aria-label="API example format">
              {Object.keys(apiExamples).map((example) => (
                <button
                  aria-pressed={apiExample === example}
                  key={example}
                  onClick={() => setApiExample(example as keyof typeof apiExamples)}
                  type="button"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
          <pre>
            <code>
              {apiExamples[apiExample]}
            </code>
          </pre>
        </div>
      </section>

      </div>
      {/* Sticky park range for .hero-follow-inner — must be a sibling, not the
          inner's own margin (see marketing.css). Collapsed in the static layout. */}
      <div className="hero-follow-spacer" aria-hidden="true" style={animateHero ? undefined : { height: 0 }} />
      </div>
    </>
  )
}
