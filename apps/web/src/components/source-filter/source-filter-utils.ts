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
