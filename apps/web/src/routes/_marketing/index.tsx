import { createFileRoute } from "@tanstack/react-router"
import { HomePage } from "../../pages/home-page"

export const Route = createFileRoute("/_marketing/")({
  head: () => ({
    links: [
      // The hero blob layers are CSS background-images, so the browser only
      // discovers them after the stylesheet loads — too late for the first
      // paint they dominate (the back layer is the page's LCP element).
      // Preloading lets them fetch in parallel with the CSS.
      // High priority on the back layer: it is the LCP element, and by default
      // image preloads queue behind the (larger, entrance-delayed) phone image.
      // The -m variants match hero.module.scss's max-width: 768px override:
      // phones decode AVIF in software at a cost proportional to source pixels,
      // so they get 800px layers instead of the 2400px desktop ones.
      {
        rel: "preload",
        as: "image",
        href: "/hero-blobs-back.avif",
        media: "(min-width: 768.1px)",
        fetchPriority: "high",
      },
      { rel: "preload", as: "image", href: "/hero-blobs-front.avif", media: "(min-width: 768.1px)" },
      {
        rel: "preload",
        as: "image",
        href: "/hero-blobs-back-m.avif",
        media: "(max-width: 768px)",
        fetchPriority: "high",
      },
      { rel: "preload", as: "image", href: "/hero-blobs-front-m.avif", media: "(max-width: 768px)" },
    ],
  }),
  component: HomePage,
})
