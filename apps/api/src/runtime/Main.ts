import { Console, Effect } from "effect";

import type { SavedItemId } from "../domain/SavedItem.js";
import type {
  AlreadyCaptured,
  InvalidUrl,
} from "../modules/capture/CaptureError.js";
import { CaptureService } from "../modules/capture/CaptureService.js";
import type { SavedItemNotFound } from "../modules/enrichment/SavedItemNotFound.js";
import { EnrichmentWorkflow } from "../modules/enrichment/EnrichmentWorkflow.js";
import { appLayer } from "./AppLayer.js";

const usageText = [
  "Usage:",
  "  pnpm start -- <url>",
  "  pnpm start -- capture <url>",
  "  pnpm start -- enrich <SavedItem-id>",
].join("\n");

const markFailureExit = Effect.sync(() => {
  process.exitCode = 1;
});

const reportUserError = (message: string) =>
  Console.error(message).pipe(Effect.zipRight(markFailureExit));

type Command =
  | {
      readonly _tag: "Help";
    }
  | {
      readonly _tag: "Capture";
      readonly url: string;
    }
  | {
      readonly _tag: "Enrich";
      readonly savedItemId: SavedItemId;
    };

const readCommand = (): Command => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return { _tag: "Help" };
  }

  const [first, second] = args;

  if (first === "capture" && second) {
    return { _tag: "Capture", url: second };
  }

  if (first === "enrich" && second) {
    return { _tag: "Enrich", savedItemId: second as SavedItemId };
  }

  return { _tag: "Capture", url: first };
};

const program = Effect.gen(function* () {
  const command = readCommand();

  if (command._tag === "Help") {
    return yield* Console.log(usageText);
  }

  if (command._tag === "Capture") {
    const captureService = yield* CaptureService;
    const result = yield* captureService.capture(command.url);

    return yield* Console.log(
      [
        "SavedItem captured.",
        `- SavedItem id: ${result.savedItem.id}`,
        `- url: ${result.savedItem.url}`,
        `- host: ${result.savedItem.host}`,
      ].join("\n"),
    );
  }

  const enrichmentWorkflow = yield* EnrichmentWorkflow;
  const result = yield* enrichmentWorkflow.enrich(command.savedItemId);

  return yield* Console.log(
    [
      "SavedItem enriched.",
      `- SavedItem id: ${result.savedItem.id}`,
      `- job id: ${result.job.id}`,
      `- status: ${result.job.status}`,
      `- stages: ${result.job.stages
        .map((stage) => `${stage.stage}=${stage.status}`)
        .join(", ")}`,
    ].join("\n"),
  );
});

export const main = program.pipe(
  Effect.provide(appLayer),
  Effect.catchTags({
    InvalidUrl: (error: InvalidUrl) =>
      reportUserError(`Invalid URL: ${error.url}`),
    AlreadyCaptured: (error: AlreadyCaptured) =>
      reportUserError(`URL already captured: ${error.url}`),
    SavedItemNotFound: (error: SavedItemNotFound) =>
      reportUserError(`SavedItem not found: ${error.savedItemId}`),
  }),
  Effect.catchAllCause((cause) =>
    Effect.logError(cause).pipe(Effect.zipRight(markFailureExit)),
  ),
);
