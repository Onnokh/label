import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { normalizeHandle } from "../modules/profiles/Handle.js"
import { PublicProfileRepository } from "../modules/profiles/PublicProfileRepository.js"
import {
  PUBLIC_SAVED_ITEMS_PAGE_SIZE,
  publicPageCount,
  publicPageNumber,
} from "../modules/profiles/PublicSavedItems.js"
import { isIndexable } from "../modules/profiles/SearchIndexing.js"
import {
  PublicProfileDto,
  PublicProfileNotFoundError,
  PublicSavedItemsResponse,
  publicSavedItemToDto,
  ReadingActivityDay,
  ReadingActivityResponse,
  sleevyApi,
} from "./ApiContract.js"

// One constant message, built the same way for every miss, so the unknown-Handle
// answer and the private-Public-Profile answer are the same bytes.
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
        // Every Handle takes one path. A Handle no Account holds, a Handle
        // whose Profile Visibility is private, and a spelling no Handle may
        // ever take all reach the same lookup and the same answer, so the
        // response never discloses which Handles exist.
        const found = yield* repo
          .findPublicByHandle(normalizeHandle(params.handle))
          .pipe(Effect.orDie)
        if (Option.isNone(found)) return yield* notFound()

        const { handle, joinedAt, publicSavedItemCount } = found.value
        return new PublicProfileDto({
          handle,
          joinedAt,
          publicSavedItemCount,
          isIndexable: isIndexable({
            joinedAt,
            publicSavedItemCount,
            now: new Date(),
          }),
        })
      }),
    ).handle("listSavedItems", ({ params, query }) =>
      Effect.gen(function* () {
        const repo = yield* PublicProfileRepository
        const page = publicPageNumber(query.page)
        // The same not-found answer as the profile route, for the same reason:
        // the pair of routes must not disclose that a Handle is claimed.
        const found = yield* repo
          .listPublicSavedItems(normalizeHandle(params.handle), {
            number: page,
            size: PUBLIC_SAVED_ITEMS_PAGE_SIZE,
          })
          .pipe(Effect.orDie)
        if (Option.isNone(found)) return yield* notFound()

        const { savedItems, totalCount } = found.value
        return new PublicSavedItemsResponse({
          savedItems: savedItems.map(publicSavedItemToDto),
          page,
          pageSize: PUBLIC_SAVED_ITEMS_PAGE_SIZE,
          totalPages: publicPageCount(totalCount, PUBLIC_SAVED_ITEMS_PAGE_SIZE),
        })
      }),
    ).handle("activity", ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* PublicProfileRepository
        // The same lookup shape as the profile route, so Reading Activity
        // discloses no more about which Handles exist than the profile does.
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
    ),
)
