import { createFileRoute } from "@tanstack/react-router"
import { HomePage } from "../../pages/home-page"

export const Route = createFileRoute("/_marketing/")({
  head: () => ({
    meta: [
      { title: "Sleevy | Scriptable Read-Later App and Bookmark Manager" },
      { name: "description", content: "Save links from iOS, Chrome, Raycast, and scripts. Sleevy keeps your read-later queue in sync and gives you a personal REST API to automate it." },
      { property: "og:title", content: "Sleevy | Scriptable Read-Later App and Bookmark Manager" },
      { property: "og:description", content: "Save links from iOS, Chrome, Raycast, and scripts. Keep your read-later queue in sync and automate it with a personal REST API." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://sleevy.app/" },
      { name: "twitter:title", content: "Sleevy | Scriptable Read-Later App and Bookmark Manager" },
      { name: "twitter:description", content: "Save links from iOS, Chrome, Raycast, and scripts. Keep your read-later queue in sync and automate it with a personal REST API." },
    ],
    links: [
      { rel: "canonical", href: "https://sleevy.app/" },
      // The hero blob layers are CSS background-images, so the browser only
      // discovers them after the stylesheet loads — too late for the first
      // paint they dominate (the back layer is the page's LCP element).
      // Preloading lets them fetch in parallel with the CSS.
      // High priority on the back layer: it is the LCP element, and by default
      // image preloads queue behind the (larger, entrance-delayed) phone image.
      { rel: "preload", as: "image", href: "/hero-blobs-back.avif", fetchPriority: "high" },
      { rel: "preload", as: "image", href: "/hero-blobs-front.avif" },
    ],
  }),
  component: HomePage,
})
