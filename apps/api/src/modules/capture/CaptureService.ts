import { Context, Effect, Layer } from "effect"

import type { SavedItem } from "../../domain/SavedItem.js"
import type { UserId } from "../../domain/SavedItem.js"
import { SavedItemIntake } from "../saved-items/SavedItemIntake.js"
import type { InvalidUrl } from "./CaptureError.js"

export type CaptureServiceError = InvalidUrl

export type CaptureResult = {
  readonly savedItem: SavedItem
  readonly captureResult: "created" | "updated"
}

export class CaptureService extends Context.Service<CaptureService>()(
  "@app/modules/capture/CaptureService",
  {
    make: Effect.gen(function* () {
      const intake = yield* SavedItemIntake

      return {
        capture: (userId: UserId, inputUrl: string) =>
          intake.capture(userId, inputUrl),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(CaptureService, CaptureService.make)
}
