import { createFileRoute } from "@tanstack/react-router"

import { OAuthLoginPage } from "../../pages/oauth-login-page"

export const Route = createFileRoute("/oauth/login")({ component: OAuthLoginPage })
