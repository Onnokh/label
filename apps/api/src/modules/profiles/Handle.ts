// Handle rules, fixed by ADR 0016. A Handle is 3 to 30 characters of `a-z`,
// `0-9`, `-`, and `_`, is stored lowercase, and may not take a name that a root
// path already uses or may use later.

export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 30

const HANDLE_PATTERN = /^[a-z0-9_-]+$/

export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
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

// Storage form of a Handle: surrounding whitespace removed and lowercased, so
// two Accounts can never hold Handles that differ only by case.
export const normalizeHandle = (raw: string): string => raw.trim().toLowerCase()

// Returns the reason a normalized Handle is unusable, or null when it is valid.
export const handleProblem = (handle: string): string | null => {
  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) {
    return `Handle must contain between ${HANDLE_MIN_LENGTH} and ${HANDLE_MAX_LENGTH} characters.`
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return "Handle may contain only lowercase letters, digits, hyphen, and underscore."
  }
  if (RESERVED_HANDLES.has(handle)) {
    return "Handle is reserved."
  }
  return null
}
