import type { SavedItem } from "../../sleevy/saved-items"

const channelGroups: Record<string, string> = {
  "ios-app": "iOS",
  "ios-share-extension": "iOS",
  "chrome-extension": "Browser",
  "web-companion": "Browser",
  "raycast": "Raycast",
  "api": "API",
  "public-profile": "Public Profile",
}

function getChannelGroup(channel?: string): string | undefined {
  if (!channel) return undefined
  return channelGroups[channel] ?? channel
}

export function getSourceGroup(item: SavedItem): string | undefined {
  return item.sourceName?.trim() || getChannelGroup(item.captureChannel)
}

// One reading of what a list of saved items can be filtered by, shared by the
// sidebar sections and the page toolbar so the two cannot drift apart.
export function sourceCountsOf(items: readonly SavedItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const group = getSourceGroup(item)
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  return counts
}

export function tagCountsOf(items: readonly SavedItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return counts
}

// Most-used first, which is the order both surfaces present them in.
export function byCountDescending(counts: Map<string, number>): readonly (readonly [string, number])[] {
  return [...counts.entries()].toSorted((a, b) => b[1] - a[1])
}
