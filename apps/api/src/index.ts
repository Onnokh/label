import { BunRuntime } from "@effect/platform-bun"
import { Effect } from "effect"

import { main } from "./runtime/Main.js"

// `BunRuntime.runMain` installs SIGINT/SIGTERM handlers that interrupt the root
// fiber, so the scoped finalizers in `main` (HTTP server drain, Postgres pool
// shutdown) run on container stop / Ctrl-C instead of being killed abruptly.
// `Effect.scoped` discharges the `Scope` required by the `acquireRelease`
// resources in `main`, leaving an `Effect<never, E>` as runMain expects.
BunRuntime.runMain(Effect.scoped(main))
