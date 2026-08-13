// The address of the API. A browser must use the public one, which is baked
// into the bundle as a build argument. A server-side render must not: that
// request would leave the container, travel out through Cloudflare and Caddy,
// and come back, rather than crossing the deployment network. So the server
// prefers INTERNAL_API_BASE_URL, which names the API service inside that
// network and is read from the process environment at startup.
//
// `import.meta.env.SSR` is replaced at build time, so the branch below is gone
// from the browser bundle and no `process` is looked for where there is none.
const internalApiBaseUrl = import.meta.env.SSR
  ? (globalThis as {
      readonly process?: { readonly env?: Record<string, string | undefined> }
    }).process?.env?.INTERNAL_API_BASE_URL
  : undefined

const apiBaseUrl = internalApiBaseUrl ??
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:4001"

// The address of the visitor this request is made for, named the way the API
// reads it.
//
// Every Public Profile Endpoint is bucketed by client address. A server-side
// render carries the web container's address instead of the visitor's, which
// would put every render in the world in one bucket and spend the whole Public
// Profile Rate Limit on a handful of pages. So the incoming page request is
// asked who it came from, and the answer is passed on.
//
// The web server may be trusted to state this: it sits inside the deployment
// network, reachable only through the proxy chain that sets the header in the
// first place, and the API already treats CF-Connecting-IP as the only
// trustworthy client address behind that chain (ADR 0016). Passing it on
// therefore adds no new rule to the API side.
const visitorAddressHeaders = async (): Promise<Record<string, string>> => {
  if (import.meta.env.SSR) {
    try {
      const { getRequestHeader, getRequestIP } = await import(
        "@tanstack/react-start/server"
      )
      const address = getRequestHeader("cf-connecting-ip") ??
        getRequestIP({ xForwardedFor: true })

      // No address to be had — send none rather than one made up, and let the
      // API fall back the way it already does.
      return address ? { "CF-Connecting-IP": address } : {}
    } catch {
      // Called with no page request in hand, so there is no visitor to name.
      return {}
    }
  }

  // A loader runs in the browser too, on a client-side navigation. There the
  // header would be a claim rather than a fact, so it is never sent.
  return {}
}

export type PublicProfile = {
  readonly handle: string
  readonly joinedAt: string
  readonly publicSavedItemCount: number
  // The API decides search indexability, so this page renders a robots
  // directive from the value and owns no part of the rule.
  readonly isIndexable: boolean
}

export type PublicSavedItem = {
  readonly originalUrl: string
  readonly host: string
  readonly title?: string | null
  readonly faviconUrl?: string | null
  readonly faviconLightUrl?: string | null
  readonly faviconDarkUrl?: string | null
  readonly imageUrl?: string | null
  readonly type: string
  readonly tags: ReadonlyArray<string>
  readonly previewSummary?: string | null
  readonly savedAt: string
}

export type PublicSavedItems = {
  readonly savedItems: ReadonlyArray<PublicSavedItem>
  readonly page: number
  readonly pageSize: number
  readonly totalPages: number
}

export type ReadingActivity = {
  readonly handle: string
  readonly from: string
  readonly to: string
  readonly days: ReadonlyArray<{ readonly date: string; readonly count: number }>
}

// A Public Profile read carries no credentials, so these requests deliberately
// do not send them. `credentials: "include"` would make every response vary per
// viewer and defeat the shared cache the API sets.
const publicFetch = async <T>(path: string): Promise<T | "not-found"> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: await visitorAddressHeaders(),
  })
  // An unknown Handle and a private one answer alike, so both land here and the
  // page cannot tell them apart either.
  if (response.status === 404) return "not-found"
  if (!response.ok) throw new Error(`Public profile request failed: ${response.status}`)
  return (await response.json()) as T
}

const handlePath = (handle: string) =>
  `/v1/public/profiles/${encodeURIComponent(handle)}`

export const fetchPublicProfile = (handle: string) =>
  publicFetch<PublicProfile>(handlePath(handle))

export const fetchPublicSavedItems = (handle: string, page: number) =>
  publicFetch<PublicSavedItems>(`${handlePath(handle)}/saved-items?page=${page}`)

export const fetchReadingActivity = (handle: string) =>
  publicFetch<ReadingActivity>(`${handlePath(handle)}/activity`)

// One Public Profile a search engine may be offered, and when its page last
// changed. Which profiles qualify is the API's decision, so the sitemap lists
// what it is given and owns no part of the rule.
export type IndexableProfile = {
  readonly handle: string
  readonly lastModifiedAt: string
}

export type IndexableProfiles = {
  readonly profiles: ReadonlyArray<IndexableProfile>
  readonly page: number
  readonly pageSize: number
  readonly totalPages: number
}

// Every Handle the API is willing to have indexed, walked page by page. This
// route answers with an empty page rather than a not-found, so a 404 here means
// the request was wrong; it is raised like any other failure and the caller
// falls back.
export const fetchIndexableProfiles = async (): Promise<ReadonlyArray<IndexableProfile>> => {
  const profiles: IndexableProfile[] = []
  let page = 1

  for (;;) {
    const answer = await publicFetch<IndexableProfiles>(
      `/v1/public/indexable-profiles?page=${page}`,
    )
    if (answer === "not-found") {
      throw new Error("Indexable profiles request answered not-found")
    }

    profiles.push(...answer.profiles)
    if (page >= answer.totalPages) return profiles
    page += 1
  }
}
