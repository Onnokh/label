// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
// Source: packages/contract/src/index.ts
// Generator: scripts/sync-raycast-contract.mjs (run by Husky pre-commit hook)
// =============================================================================

export const linkTypes = ["article", "video", "website", "repository"] as const;
export type LinkType = any;

export const topics = [
  "ai",
  "tools",
  "typescript",
  "security",
  "design",
  "backend",
  "front-end",
] as const;
export type Topic = any;

export const captureChannels = [
  "chrome-extension",
  "ios-app",
  "ios-share-extension",
  "raycast",
  "web-companion",
  "api",
] as const;
export type CaptureChannel = any;

export const enrichmentStatuses = ["pending", "enriched", "failed"] as const;
export type EnrichmentStatus = any;

export const savedItemSorts = ["newest", "oldest", "title", "unread"] as const;
export type SavedItemSort = any;

export type FolderDto = Schema.Codec.Encoded<typeof C.FolderDto>;

export type FoldersResponse = Schema.Codec.Encoded<typeof C.FoldersResponse>;

export type SavedItemDto = Schema.Codec.Encoded<typeof C.SavedItemDto>;

export type SavedItemsResponse = Schema.Codec.Encoded<
  typeof C.SavedItemsResponse
>;

export type CaptureCreated = Schema.Codec.Encoded<typeof C.CaptureCreated>;

export type CaptureUpdated = Schema.Codec.Encoded<typeof C.CaptureUpdated>;

export type HealthResponse = Schema.Codec.Encoded<typeof C.HealthResponse>;

export type CapturePayload = Schema.Codec.Encoded<typeof C.CapturePayload>;

export type SavedItemReadStatePayload = Schema.Codec.Encoded<
  typeof C.SavedItemReadStatePayload
>;

export type SavedItemsQuery = Schema.Codec.Encoded<typeof C.SavedItemsQuery>;

export type FolderNamePayload = Schema.Codec.Encoded<
  typeof C.FolderNamePayload
>;

export type FolderAssignmentPayload = Schema.Codec.Encoded<
  typeof C.FolderAssignmentPayload
>;

export type Unauthorized = Schema.Codec.Encoded<typeof C.Unauthorized>;

export type RateLimitExceeded = Schema.Codec.Encoded<
  typeof C.RateLimitExceeded
>;

export type InvalidUrlError = Schema.Codec.Encoded<typeof C.InvalidUrlError>;

export type SavedItemNotFoundError = Schema.Codec.Encoded<
  typeof C.SavedItemNotFoundError
>;

export type InvalidFolderNameError = Schema.Codec.Encoded<
  typeof C.InvalidFolderNameError
>;

export type FolderNotFoundError = Schema.Codec.Encoded<
  typeof C.FolderNotFoundError
>;

export type FolderNameConflictError = Schema.Codec.Encoded<
  typeof C.FolderNameConflictError
>;

export type CaptureResponse = CaptureCreated | CaptureUpdated;

export type ApiError =
  | Unauthorized
  | RateLimitExceeded
  | InvalidUrlError
  | SavedItemNotFoundError
  | InvalidFolderNameError
  | FolderNotFoundError
  | FolderNameConflictError;
