const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4001"

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
  const response = await fetch(`${apiBaseUrl}${path}`)
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
