import { Effect } from "effect"

import { main } from "./runtime/Main.js"

await Effect.runPromise(Effect.scoped(main))
