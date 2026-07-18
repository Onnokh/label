import { Outlet, HeadContent, Scripts } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "../contexts/theme-context"
import { RootProvider as FumadocsProvider } from "fumadocs-ui/provider/tanstack"
import { DocsSearchDialog } from "../components/docs/docs-search"
import "../styles/base.css"
import "fumadocs-ui/style.css"
import "fumadocs-openapi/css/preset.css"

const queryClient = new QueryClient()

export function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <FumadocsProvider theme={{ enabled: false }} search={{ SearchDialog: DocsSearchDialog }}>
              <Outlet />
            </FumadocsProvider>
          </ThemeProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
