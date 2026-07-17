type StructuredDataValue = Record<string, unknown>

type StructuredDataProps = {
  readonly data: StructuredDataValue
}

/** Renders safely escaped JSON-LD into the server-rendered page. */
export function StructuredData({ data }: StructuredDataProps) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c")

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
