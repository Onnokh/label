/*
 * Plain async Rybbit client for server-side custom events.
 *
 * Deliberately dependency-free (no Effect) so it can be called both from the
 * Analytics Effect service and directly from better-auth database hooks, which
 * are plain async functions. It never throws and never rejects: analytics must
 * not be able to affect a user request or an authentication flow.
 */

export type RybbitConfig = {
  readonly enabled: boolean
  readonly apiUrl: string
  readonly siteId: string
  readonly apiKey: string
}

export type RybbitEvent = {
  readonly name: string
  readonly userId: string
  readonly properties?: Record<string, string | number | boolean>
  /*
   * The originating visitor's IP and User-Agent. When set these are sent to
   * Rybbit as `ip_address` / `user_agent`, so the event geolocates to the real
   * visitor instead of this server (hosted in Germany). `undefined` for events
   * with no originating user request, which then fall back to the server IP —
   * typed explicitly so callers can forward a maybe-undefined value directly.
   */
  readonly ipAddress?: string | undefined
  readonly userAgent?: string | undefined
}

const TIMEOUT_MS = 3_000

// Fallback User-Agent for events that carry no originating visitor UA. Rybbit
// runs its User-Agent through a bot filter and drops obvious non-browser agents
// (curl, the Bun/Node fetch defaults), so a browser-style default keeps
// UA-less server events from being discarded.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"

const isConfigured = (config: RybbitConfig) =>
  config.enabled &&
  config.apiUrl.length > 0 &&
  config.siteId.length > 0 &&
  config.apiKey.length > 0

export const trackEvent = async (
  config: RybbitConfig,
  event: RybbitEvent,
): Promise<void> => {
  if (!isConfigured(config)) return

  try {
    const response = await fetch(`${config.apiUrl}/api/track`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        "user-agent": event.userAgent ?? USER_AGENT,
      },
      body: globalThis.JSON.stringify({
        site_id: config.siteId,
        type: "custom_event",
        event_name: event.name,
        user_id: event.userId,
        properties: globalThis.JSON.stringify(event.properties ?? {}),
        // The real visitor's IP/UA, so the event geolocates to them rather than
        // this server. `undefined` serializes away, and Rybbit then falls back
        // to the request (server) values — the case when the visitor is genuinely
        // unknown (local dev without Cloudflare, or a non-request-scoped event).
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      console.debug(`[rybbit] track "${event.name}" failed with ${response.status}`)
    }
  } catch (cause) {
    console.debug(`[rybbit] track "${event.name}" errored`, cause)
  }
}
