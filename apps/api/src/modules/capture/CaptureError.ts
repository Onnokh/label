import { Data } from "effect";

export class InvalidUrl extends Data.TaggedError("InvalidUrl")<{
  readonly url: string;
}> {}
