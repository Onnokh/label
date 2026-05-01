import { Effect } from "effect"

import type { SavedItem } from "../../domain/SavedItem.js"
import type { CapturedLink } from "../../domain/CapturedLink.js"
import { SavedItemIntake } from "../saved-items/SavedItemIntake.js"
import type { AlreadyCaptured, InvalidUrl } from "./CaptureError.js"

export type CaptureServiceError = InvalidUrl | AlreadyCaptured

export type CaptureResult = {
  readonly savedItem: SavedItem
  readonly capturedLink: CapturedLink
}

export class CaptureService extends Effect.Service<CaptureService>()(
  "@app/modules/capture/CaptureService",
  {
    effect: Effect.gen(function* () {
      const intake = yield* SavedItemIntake

      return {
        capture: (inputUrl: string) => intake.capture(inputUrl),
      }
    }),
  },
) { }

export const captureServiceLayer = CaptureService.Default
