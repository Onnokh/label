export type ScopeMeta = { title: string; description: string; icon: string }

export const ICON_BOOKMARK = "M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v18l-7-4-7 4z"
export const ICON_EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
export const ICON_PENCIL = "M14.06 3.94a2 2 0 0 1 2.83 0l3.17 3.17a2 2 0 0 1 0 2.83L7.5 22.5 2 22.5l0-5.5z"
export const ICON_TRASH = "M4 7h16 M9 7V4h6v3 M6 7l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"
export const ICON_USER = "M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M3 22a9 9 0 0 1 18 0"
export const ICON_FOLDER = "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"

export const SCOPE_META: Record<string, ScopeMeta> = {
  "saved-items:capture": {
    title: "Save new items",
    description: "Capture web pages into your Sleevy queue.",
    icon: ICON_BOOKMARK,
  },
  "saved-items:read": {
    title: "Read your saved items",
    description: "See your queue, library, and item details.",
    icon: ICON_EYE,
  },
  "saved-items:write": {
    title: "Update your saved items",
    description: "Mark items read, unread, or opened.",
    icon: ICON_PENCIL,
  },
  "saved-items:delete": {
    title: "Delete saved items",
    description: "Permanently remove items from your library.",
    icon: ICON_TRASH,
  },
  "folders:read": {
    title: "See your folders",
    description: "List the folders in your library.",
    icon: ICON_FOLDER,
  },
  "folders:write": {
    title: "Create and edit folders",
    description: "Add folders and move items between them.",
    icon: ICON_FOLDER,
  },
  "folders:delete": {
    title: "Delete folders",
    description: "Permanently remove folders from your library.",
    icon: ICON_TRASH,
  },
  "account:read": {
    title: "See your account",
    description: "Read your name and email to display a Connected as… label.",
    icon: ICON_USER,
  },
}

// Grouped presentation for the OAuth consent screen: one row per resource,
// verbs summarized inline, destructive verbs tinted.
export type ScopeGroupId = "saved-items" | "folders" | "account"

export const SCOPE_GROUPS: Record<ScopeGroupId, { title: string; icon: string }> = {
  "saved-items": { title: "Saved items", icon: ICON_BOOKMARK },
  folders: { title: "Folders", icon: ICON_FOLDER },
  account: { title: "Account", icon: ICON_USER },
}

export const SCOPE_GROUP_ORDER: readonly ScopeGroupId[] = ["saved-items", "folders", "account"]

export type ScopeVerb = {
  group: ScopeGroupId
  verb: string
  destructive?: boolean
  write?: boolean
}

export const SCOPE_VERBS: Record<string, ScopeVerb> = {
  "saved-items:capture": { group: "saved-items", verb: "Save", write: true },
  "saved-items:read": { group: "saved-items", verb: "Read" },
  "saved-items:write": { group: "saved-items", verb: "Update", write: true },
  "saved-items:delete": { group: "saved-items", verb: "Delete", destructive: true },
  "folders:read": { group: "folders", verb: "View" },
  "folders:write": { group: "folders", verb: "Create & edit", write: true },
  "folders:delete": { group: "folders", verb: "Delete", destructive: true },
  "account:read": { group: "account", verb: "Name & email" },
}
