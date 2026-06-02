const STORAGE_KEY = "sleeve:sourceName"

export function getSourceName(): string {
  return localStorage.getItem(STORAGE_KEY) || ""
}

export function setSourceName(value: string): void {
  if (value) {
    localStorage.setItem(STORAGE_KEY, value)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}
