/*
 * Phase 1 goal:
 * Centralize application configuration behind a single Effect service with nested sections.
 *
 * Still to implement:
 * Finalize the config shape, decide on the exact environment variable naming scheme, and add the
 * fetch/AI settings the live layers will need once persistence and enrichment are implemented.
 */

import { Config, Context, Effect, Layer, Option } from "effect";

type AppConfigShape = {
  readonly database: {
    readonly url: string;
  };
  readonly http: {
    readonly port: number;
  };
  readonly fetch: {
    readonly timeoutMs: number;
    readonly userAgent: string;
    readonly browserFallbackEnabled: boolean;
    readonly browserTimeoutMs: number;
    readonly browserHeadless: boolean;
  };
  readonly ai: {
    readonly enabled: boolean;
    readonly provider: string | undefined;
    readonly model: string | undefined;
  };
  readonly auth: {
    readonly googleClientId: string;
    readonly googleClientSecret: string;
    readonly secret: string;
    readonly baseUrl: string;
    readonly trustedOrigins: readonly string[];
  };
};

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()(
  "@app/runtime/AppConfig",
  {
    make: Effect.gen(function* () {
      const databaseUrl = yield* Config.string("DATABASE_URL").pipe(
        Config.withDefault("postgres://label:label@localhost:5434/label"),
      );

      const httpPort = yield* Config.int("PORT").pipe(Config.withDefault(3002));

      const aiEnabled = yield* Config.boolean("AI_ENABLED").pipe(
        Config.withDefault(false),
      );

      const fetchTimeoutMs = yield* Config.int("FETCH_TIMEOUT_MS").pipe(
        Config.withDefault(5_000),
      );

      const fetchUserAgent = yield* Config.string("FETCH_USER_AGENT").pipe(
        Config.withDefault("saved-items/1.0 (+https://localhost/SavedItems)"),
      );

      const browserFallbackEnabled = yield* Config.boolean(
        "FETCH_BROWSER_FALLBACK_ENABLED",
      ).pipe(Config.withDefault(true));

      const browserTimeoutMs = yield* Config.int(
        "FETCH_BROWSER_TIMEOUT_MS",
      ).pipe(Config.withDefault(15_000));

      const browserHeadless = yield* Config.boolean(
        "FETCH_BROWSER_HEADLESS",
      ).pipe(Config.withDefault(true));

      const aiProvider = yield* Config.option(Config.string("AI_PROVIDER"));
      const aiModel = yield* Config.option(Config.string("AI_MODEL"));
      const googleClientId = yield* Config.string("GOOGLE_CLIENT_ID").pipe(
        Config.withDefault(""),
      );
      const googleClientSecret = yield* Config.string("GOOGLE_CLIENT_SECRET").pipe(
        Config.withDefault(""),
      );
      const authSecret = yield* Config.string("BETTER_AUTH_SECRET").pipe(
        Config.withDefault("development-only-better-auth-secret"),
      );
      const authBaseUrl = yield* Config.string("BETTER_AUTH_URL").pipe(
        Config.withDefault("http://localhost:4001"),
      );
      const trustedOrigins = yield* Config.string("BETTER_AUTH_TRUSTED_ORIGINS").pipe(
        Config.withDefault("https://web.label.localhost"),
      );

      return {
        database: {
          url: databaseUrl,
        },
        http: {
          port: httpPort,
        },
        fetch: {
          timeoutMs: fetchTimeoutMs,
          userAgent: fetchUserAgent,
          browserFallbackEnabled,
          browserTimeoutMs,
          browserHeadless,
        },
        ai: {
          enabled: aiEnabled,
          provider: Option.isSome(aiProvider) ? aiProvider.value : undefined,
          model: Option.isSome(aiModel) ? aiModel.value : undefined,
        },
        auth: {
          googleClientId,
          googleClientSecret,
          secret: authSecret,
          baseUrl: authBaseUrl,
          trustedOrigins: trustedOrigins
            .split(",")
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0),
        },
      };
    }),
  },
) {
  static readonly layer = Layer.effect(AppConfig, AppConfig.make);
}
