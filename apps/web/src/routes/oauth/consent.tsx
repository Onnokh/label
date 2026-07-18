import { createFileRoute } from "@tanstack/react-router"

import { OAuthConsentPage } from "../../pages/oauth-consent-page"

export const Route = createFileRoute("/oauth/consent")({ component: OAuthConsentPage })
