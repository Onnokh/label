import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { HandleAvailabilityResponse, ProfileDto, ProfileVisibility } from "@sleevy/contract"

import { apiFetch } from "./api"

export type Profile = ProfileDto.Encoded
export type { ProfileVisibility }
type HandleAvailability = HandleAvailabilityResponse.Encoded

const HANDLE_MIN_LENGTH = 3
const HANDLE_MAX_LENGTH = 30
const HANDLE_PATTERN = /^[a-z0-9_-]+$/

// The same reserved names the API rejects. They are repeated here so the panel
// can answer while the user types; the API stays the authority.
const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "api",
  "docs",
  "settings",
  "inbox",
  "library",
  "connect",
  "oauth",
  "support",
  "privacy",
  "admin",
  "u",
  "user",
  "sleevy",
])

// Storage form of a Handle: surrounding whitespace removed and lowercased.
export const normalizeHandle = (raw: string): string => raw.trim().toLowerCase()

// Why a normalized Handle cannot be used, or null when it can.
export function handleProblem(handle: string): string | null {
  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) {
    return `Use ${HANDLE_MIN_LENGTH} to ${HANDLE_MAX_LENGTH} characters.`
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return "Use only letters a-z, digits, hyphen, and underscore."
  }
  if (RESERVED_HANDLES.has(handle)) {
    return "Sleevy keeps this name for itself. Choose another one."
  }
  return null
}

// apiFetch throws the response body as the message of an Error, and the API
// writes every failure as a tagged JSON object. These two read that body, so a
// caller can tell one failure from another and show its text.
function errorBodyOf(cause: unknown): { _tag?: string; message?: string } | null {
  if (!(cause instanceof Error)) return null
  try {
    const body: unknown = JSON.parse(cause.message)
    return typeof body === "object" && body !== null ? (body as { _tag?: string; message?: string }) : null
  } catch {
    return null
  }
}

export const errorTagOf = (cause: unknown): string | null => errorBodyOf(cause)?._tag ?? null

export function errorMessageOf(cause: unknown, fallback: string): string {
  const message = errorBodyOf(cause)?.message
  return message && message.trim() ? message : fallback
}

// The Public Profile of a Handle, as a visitor reaches it. In the browser this
// is the origin the panel itself runs on, so a local build links to its own
// page instead of production.
export function publicProfileUrl(handle: string): string {
  const origin = typeof window === "undefined" ? "https://sleevy.app" : window.location.origin
  return `${origin}/u/${handle}`
}

export const displayProfileUrl = (handle: string): string =>
  publicProfileUrl(handle).replace(/^https?:\/\//, "")

const profileQueryKey = ["profile"] as const

// The Profile of the signed-in Account, or null when it has no Handle yet.
export function useProfile(enabled = true) {
  const query = useQuery({
    queryKey: profileQueryKey,
    enabled,
    queryFn: async (): Promise<Profile | null> => {
      try {
        return await apiFetch<Profile>("/v1/profile")
      } catch (cause) {
        // An Account that never claimed a Handle has no Profile record, so the
        // API answers 404. That is the first state of this panel, not a fault.
        if (errorTagOf(cause) === "ProfileNotFoundError") return null
        throw cause
      }
    },
    staleTime: 30_000,
    retry: false,
  })

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

// Whether a Handle is free. The panel asks only for a Handle that already
// passes handleProblem, so a 400 here means the two rule sets drifted apart.
export function useHandleAvailability(handle: string, enabled: boolean) {
  return useQuery({
    queryKey: ["handle-availability", handle] as const,
    queryFn: () =>
      apiFetch<HandleAvailability>(
        `/v1/profile/handle-availability?handle=${encodeURIComponent(handle)}`,
      ),
    enabled,
    staleTime: 30_000,
    retry: false,
  })
}

export function useClaimHandle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (handle: string) =>
      apiFetch<Profile>("/v1/profile/handle", {
        method: "POST",
        body: JSON.stringify({ handle }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  })
}

export function useRenameHandle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (handle: string) =>
      apiFetch<Profile>("/v1/profile/handle", {
        method: "PATCH",
        body: JSON.stringify({ handle }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  })
}

export function useSetProfileVisibility() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (visibility: ProfileVisibility) =>
      apiFetch<Profile>("/v1/profile/visibility", {
        method: "PUT",
        body: JSON.stringify({ visibility }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  })
}

// A published marker answers "what will a visitor see?", so it only means
// something while there is a visitor. Until Profile Visibility is public, a
// Published Folder shows nobody anything and the rows stay quiet.
export function useIsProfilePublic() {
  const { profile } = useProfile()
  return profile?.visibility === "public"
}
