import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { normalizeHandle } from "../modules/profiles/Handle.js"
import { PublicProfileRepository } from "../modules/profiles/PublicProfileRepository.js"
import {
  pageCount,
  PUBLIC_SAVED_ITEMS_PAGE_SIZE,
  requestedPage,
} from "../modules/profiles/PublicSavedItems.js"
import {
  INDEXABLE_PROFILES_PAGE_SIZE,
  isIndexable,
} from "../modules/profiles/SearchIndexing.js"
import {
  IndexableProfileDto,
  IndexableProfilesResponse,
  PublicProfileDto,
  PublicProfileNotFoundError,
  PublicSavedItemsResponse,
  publicSavedItemToDto,
  ReadingActivityDay,
  ReadingActivityResponse,
  sleevyApi,
} from "./ApiContract.js"

// One constant message, built the same way for every miss on every route of the
// group, so the unknown-Handle answer, the private-Public-Profile answer, and the
// answer to a spelling no Handle may ever take are all the same bytes.
const notFound = () => new PublicProfileNotFoundError({
  message: "No Public Profile exists for this Handle.",
})

export const publicProfilesGroupLive = HttpApiBuilder.group(
  sleevyApi,
  "public-profiles",
  (handlers) =>
    handlers.handle("get", ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* PublicProfileRepository
        const found = yield* repo
          .findPublicByHandle(normalizeHandle(params.handle))
          .pipe(Effect.orDie)
        if (Option.isNone(found)) return yield* notFound()

        const { handle, joinedAt, publicSavedItemCount } = found.value
        return new PublicProfileDto({
          handle,
          joinedAt,
          publicSavedItemCount,
          isIndexable: isIndexable({ joinedAt, publicSavedItemCount }),
        })
      }),
    ).handle("listSavedItems", ({ params, query }) =>
      Effect.gen(function* () {
        const repo = yield* PublicProfileRepository
        const page = requestedPage(query.page)
        const found = yield* repo
          .listPublicSavedItems(normalizeHandle(params.handle), {
            page,
            pageSize: PUBLIC_SAVED_ITEMS_PAGE_SIZE,
          })
          .pipe(Effect.orDie)
        if (Option.isNone(found)) return yield* notFound()

        const { savedItems, totalCount } = found.value
        return new PublicSavedItemsResponse({
          savedItems: savedItems.map(publicSavedItemToDto),
          page,
          pageSize: PUBLIC_SAVED_ITEMS_PAGE_SIZE,
          totalPages: pageCount(totalCount),
        })
      }),
    ).handle("getActivity", ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* PublicProfileRepository
        const found = yield* repo
          .findReadingActivity(normalizeHandle(params.handle))
          .pipe(Effect.orDie)
        if (Option.isNone(found)) return yield* notFound()

        const { handle, from, to, days } = found.value
        return new ReadingActivityResponse({
          handle,
          from,
          to,
          days: days.map((day) => new ReadingActivityDay(day)),
        })
      }),
    ).handle("listIndexable", ({ query }) =>
      Effect.gen(function* () {
        const repo = yield* PublicProfileRepository
        // Page numbers are clamped by the same helper the published Saved Item
        // pages use, so a hand-edited number answers with a page here too.
        const page = requestedPage(query.page)
        const { profiles, totalCount } = yield* repo
          .listIndexableProfiles({ page, pageSize: INDEXABLE_PROFILES_PAGE_SIZE })
          .pipe(Effect.orDie)

        return new IndexableProfilesResponse({
          profiles: profiles.map((profile) => new IndexableProfileDto(profile)),
          page,
          pageSize: INDEXABLE_PROFILES_PAGE_SIZE,
          totalPages: pageCount(totalCount, INDEXABLE_PROFILES_PAGE_SIZE),
        })
      }),
    ),
)
