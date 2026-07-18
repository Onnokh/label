import { createFileRoute } from "@tanstack/react-router"
import { DocsLayoutShell } from "../../components/docs/docs-layout"

export const Route = createFileRoute("/_marketing/docs")({ component: DocsLayoutShell })
