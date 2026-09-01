import { createFileRoute, notFound } from "@tanstack/react-router"

import {
  PublicProfileNotFound,
  PublicProfilePage,
  type PublicProfileData,
} from "../../pages/public-profile-page"
import {
  fetchPublicProfile,
  fetchPublicSavedItems,
  fetchReadingActivity,
} from "../../sleevy/public-profile"

const canonicalFor = (handle: string, page: number) =>
  page > 1
    ? `https://sleevy.app/u/${handle}?page=${page}`
    : `https://sleevy.app/u/${handle}`

// This page is the same bytes for every visitor: the Save button attaches in
// the browser, so nothing here varies with who is reading. That makes the whole
// response cacheable at the edge, which is what keeps a popular Public Profile
// from costing one render and three API reads per visitor.
//
// Five minutes keeps public reads cheap while the API can explicitly purge a
// profile when its owner changes visibility or folder membership.
const PAGE_CACHE_SECONDS = 300

// Only a page that resolved is cached. A not-found is left uncached on purpose,
// so claiming a Handle and publishing takes effect at once rather than after the
// window expires.
const cachePublicly = async (handle: string) => {
  if (!import.meta.env.SSR) return
  const { setResponseHeader } = await import("@tanstack/react-start/server")
  setResponseHeader(
    "cache-control",
    `public, max-age=0, s-maxage=${PAGE_CACHE_SECONDS}, must-revalidate`,
  )
  setResponseHeader("cache-tag", `public-profile:${handle}`)
}

export const Route = createFileRoute("/_marketing/u/$handle")({
  // A hand-edited page number answers with a page rather than an error, so the
  // search parameter is coerced here and clamped by the API.
  validateSearch: (search: Record<string, unknown>): { readonly page?: number } => {
    const raw = Number(search.page)
    return Number.isFinite(raw) && raw > 1 ? { page: Math.trunc(raw) } : {}
  },
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ params, deps }): Promise<PublicProfileData> => {
    const handle = params.handle.toLowerCase()
    const [profile, items, activity] = await Promise.all([
      fetchPublicProfile(handle),
      fetchPublicSavedItems(handle, deps.page),
      fetchReadingActivity(handle),
    ])

    // An unknown Handle and a private one answer alike, so this page cannot tell
    // a visitor which handles exist either.
    if (profile === "not-found" || items === "not-found" || activity === "not-found") {
      throw notFound()
    }

    await cachePublicly(profile.handle)
    return { profile, items, activity }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const { profile, items } = loaderData
    const title = `@${profile.handle} on Sleevy`
    const description = `${profile.publicSavedItemCount} links saved publicly by @${profile.handle}.`

    return {
      meta: [
        { title },
        { name: "description", content: description },
        // The API decides indexability; this only renders the value. A profile
        // too new or too empty is served with noindex rather than withheld.
        ...(profile.isIndexable
          ? []
          : [{ name: "robots", content: "noindex, follow" }]),
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: canonicalFor(profile.handle, items.page) },
      ],
      links: [{ rel: "canonical", href: canonicalFor(params.handle.toLowerCase(), items.page) }],
    }
  },
  notFoundComponent: PublicProfileNotFound,
  component: PublicProfileRoute,
})

function PublicProfileRoute() {
  return <PublicProfilePage data={Route.useLoaderData()} />
}
