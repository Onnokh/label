import { Data } from "effect";

export class InvalidUrl extends Data.TaggedError("InvalidUrl")<{
  readonly url: string;
}> {}

export class AlreadyCaptured extends Data.TaggedError("AlreadyCaptured")<{
  readonly url: string;
}> {}
