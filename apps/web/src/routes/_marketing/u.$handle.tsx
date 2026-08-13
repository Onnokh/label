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
