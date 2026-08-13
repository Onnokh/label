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
  readonly redis: {
    readonly url: string;
  };
  readonly render: {
    readonly token: string;
  };
  readonly http: {
    readonly port: number;
  };
  readonly fetch: {
    readonly timeoutMs: number;
    readonly userAgent: string;
    readonly browserFallbackEnabled: boolean;
    readonly browserTimeoutMs: number;
    readonly cloudflareAccountId: string;
    readonly cloudflareApiToken: string;
  };
  readonly ai: {
    readonly enabled: boolean;
    readonly provider: string | undefined;
    readonly model: string | undefined;
    readonly apiKey: string | undefined;
  };
  readonly auth: {
    readonly googleClientId: string;
    readonly googleClientSecret: string;
    readonly appleClientId: string;
    readonly appleTeamId: string;
    readonly appleKeyId: string;
    readonly applePrivateKey: string;
    readonly appleAppBundleIdentifier: string;
    readonly secret: string;
    readonly baseUrl: string;
    readonly webUrl: string;
    readonly trustedOrigins: readonly string[];
  };
  readonly rybbit: {
    readonly enabled: boolean;
    readonly apiUrl: string;
    readonly siteId: string;
    readonly apiKey: string;
  };
};

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()(
  "@app/runtime/AppConfig",
  {
    make: Effect.gen(function* () {
      const databaseUrl = yield* Config.string("DATABASE_URL").pipe(
        Config.withDefault("postgres://sleevy:sleevy@localhost:5434/sleevy"),
      );

      const redisUrl = yield* Config.string("REDIS_URL").pipe(
        Config.withDefault("redis://localhost:6379"),
      );

      const httpPort = yield* Config.int("PORT").pipe(Config.withDefault(3002));

      // The secret the web server states to identify a Server-Side Render of a
      // public page. A render is a first-party caller inside the deployment
      // network, not a public API client, so it must not spend the visitor's
      // Public Profile Rate Limit: a visitor who opens a page has to get the
      // page. Empty means no render is recognized, and every caller is public.
      const renderToken = yield* Config.string("INTERNAL_RENDER_TOKEN").pipe(
        Config.withDefault(""),
      );

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
      ).pipe(Config.withDefault(15_000))

      const cloudflareAccountId = yield* Config.string(
        "CLOUDFLARE_ACCOUNT_ID",
      ).pipe(Config.withDefault(""))

      const cloudflareApiToken = yield* Config.string(
        "CLOUDFLARE_API_TOKEN",
      ).pipe(Config.withDefault(""));

      const aiProvider = yield* Config.option(Config.string("AI_PROVIDER"));
      const aiModel = yield* Config.option(Config.string("AI_MODEL"));
      const aiApiKey = yield* Config.option(Config.string("OPENAI_API_KEY"));
      const googleClientId = yield* Config.string("GOOGLE_CLIENT_ID").pipe(
        Config.withDefault(""),
      );
      const googleClientSecret = yield* Config.string("GOOGLE_CLIENT_SECRET").pipe(
        Config.withDefault(""),
      );
      const appleClientId = yield* Config.string("APPLE_CLIENT_ID").pipe(
        Config.withDefault(""),
      );
      const appleTeamId = yield* Config.string("APPLE_TEAM_ID").pipe(
        Config.withDefault(""),
      );
      const appleKeyId = yield* Config.string("APPLE_KEY_ID").pipe(
        Config.withDefault(""),
      );
      const applePrivateKey = yield* Config.string("APPLE_PRIVATE_KEY").pipe(
        Config.withDefault(""),
      );
      const appleAppBundleIdentifier = yield* Config.string("APPLE_APP_BUNDLE_IDENTIFIER").pipe(
        Config.withDefault(""),
      );
      const authSecret = yield* Config.string("BETTER_AUTH_SECRET").pipe(
        Config.withDefault("development-only-better-auth-secret"),
      );
      const authBaseUrl = yield* Config.string("BETTER_AUTH_URL").pipe(
        Config.withDefault("http://localhost:4001"),
      );
      const authWebUrl = yield* Config.string("SLEEVY_WEB_URL").pipe(
        Config.withDefault("http://localhost:4000"),
      );
      const trustedOrigins = yield* Config.string("BETTER_AUTH_TRUSTED_ORIGINS").pipe(
        Config.withDefault("http://localhost:4000,http://127.0.0.1:4000,https://web.sleevy.localhost,https://sleevy.app,https://api.sleevy.app"),
      );

      const rybbitEnabled = yield* Config.boolean("RYBBIT_ENABLED").pipe(
        Config.withDefault(false),
      );
      const rybbitApiUrl = yield* Config.string("RYBBIT_API_URL").pipe(
        Config.withDefault(""),
      );
      const rybbitSiteId = yield* Config.string("RYBBIT_SITE_ID").pipe(
        Config.withDefault(""),
      );
      const rybbitApiKey = yield* Config.string("RYBBIT_API_KEY").pipe(
        Config.withDefault(""),
      );

      return {
        database: {
          url: databaseUrl,
        },
        redis: {
          url: redisUrl,
        },
        render: {
          token: renderToken,
        },
        http: {
          port: httpPort,
        },
        fetch: {
          timeoutMs: fetchTimeoutMs,
          userAgent: fetchUserAgent,
          browserFallbackEnabled,
          browserTimeoutMs,
          cloudflareAccountId,
          cloudflareApiToken,
        },
        ai: {
          enabled: aiEnabled,
          provider: Option.isSome(aiProvider) ? aiProvider.value : undefined,
          model: Option.isSome(aiModel) ? aiModel.value : undefined,
          apiKey: Option.isSome(aiApiKey) ? aiApiKey.value : undefined,
        },
        auth: {
          googleClientId,
          googleClientSecret,
          appleClientId,
          appleTeamId,
          appleKeyId,
          applePrivateKey,
          appleAppBundleIdentifier,
          secret: authSecret,
          baseUrl: authBaseUrl,
          webUrl: authWebUrl,
          trustedOrigins: trustedOrigins
            .split(",")
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0),
        },
        rybbit: {
          enabled: rybbitEnabled,
          apiUrl: rybbitApiUrl,
          siteId: rybbitSiteId,
          apiKey: rybbitApiKey,
        },
      };
    }),
  },
) {
  static readonly layer = Layer.effect(AppConfig, AppConfig.make);
}
