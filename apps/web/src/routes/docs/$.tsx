import { createFileRoute, notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { Suspense, type ReactNode } from "react"
import browserCollections from "collections/browser"
import { useFumadocsLoader } from "fumadocs-core/source/client"
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page"

import { source, slugsToMarkdownPath } from "../../lib/source"
import { DocsShell } from "../../components/docs/docs-layout"
import { useMDXComponents } from "../../components/docs/mdx-components"
import { OpenAPIPage } from "../../components/docs/api-page"

// Annotated explicitly: letting TS infer `loaderData` from the sibling `loader`
// option is circular and collapses the route's loader type to `never`.
type DocsLoaderData = Awaited<ReturnType<typeof serverLoader>>

export const Route = createFileRoute("/docs/$")({
  head: ({ loaderData }: { loaderData?: DocsLoaderData }) => {
    if (!loaderData) return {}
    const { title, description, url } = loaderData
    const fullTitle = `${title} | Sleevy API`
    return {
      meta: [
        { title: fullTitle },
        ...(description ? [{ name: "description", content: description }] : []),
        { property: "og:title", content: fullTitle },
        ...(description ? [{ property: "og:description", content: description }] : []),
        { property: "og:type", content: "website" },
        { property: "og:url", content: `https://sleevy.app${url}` },
        { name: "twitter:title", content: fullTitle },
        ...(description ? [{ name: "twitter:description", content: description }] : []),
      ],
      links: [{ rel: "canonical", href: `https://sleevy.app${url}` }],
    }
  },
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/").filter(Boolean) ?? []
    const data = await serverLoader({ data: slugs })

    if (data.type === "docs") {
      await clientLoader.preload(data.path)
    }
    return data
  },
})

const serverLoader = createServerFn({ method: "GET" })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs)
    if (!page) throw notFound()

    const pageTree = await source.serializePageTree(source.getPageTree())
    if (page.type === "openapi") {
      return {
        type: "openapi" as const,
        title: page.data.title,
        description: page.data.description,
        url: page.url,
        pageTree,
        props: page.data.getOpenAPIPageProps(),
      }
    }

    return {
      type: "docs" as const,
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      path: page.path,
      markdownUrl: slugsToMarkdownPath(page.slugs).url,
      pageTree,
    }
  })

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, default: MDX }, { markdownUrl }: { markdownUrl: string }) {
    return (
      <DocsPage toc={toc} breadcrumb={{ enabled: false }}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <PageActions markdownUrl={markdownUrl} />
        <DocsBody>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    )
  },
})

function PageActions({ markdownUrl }: { markdownUrl: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", gap: "0.5rem", alignItems: "center" }}>
      <MarkdownCopyButton markdownUrl={markdownUrl} />
      <ViewOptionsPopover
        markdownUrl={markdownUrl}
        githubUrl="https://github.com/Onnokh/sleevy"
      />
    </div>
  )
}

function Page() {
  const page = useFumadocsLoader(Route.useLoaderData())
  if (!page) return null
  let content: ReactNode

  if (page.type === "openapi") {
    content = (
      <DocsPage full breadcrumb={{ enabled: false }}>
        <DocsTitle>{page.title}</DocsTitle>
        <DocsDescription>{page.description}</DocsDescription>
        <DocsBody>
          <OpenAPIPage {...page.props} />
        </DocsBody>
      </DocsPage>
    )
  } else {
    content = <Suspense>{clientLoader.useContent(page.path, page)}</Suspense>
  }

  return <DocsShell tree={page.pageTree}>{content}</DocsShell>
}
