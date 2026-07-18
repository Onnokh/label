import { createOpenAPIPage } from "fumadocs-openapi/ui"

export const OpenAPIPage = createOpenAPIPage({
  storageKeyPrefix: "sleevy-openapi-",
  playground: { enabled: false },
})
