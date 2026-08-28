import { ProductHuntCard } from "../components/marketing/product-hunt-card/product-hunt-card"
import { StructuredData } from "../components/marketing/structured-data"

import styles from "./article-page.module.scss"

type ArticleSection = {
  readonly title: string
  readonly paragraphs: readonly string[]
}

type Action = {
  readonly href: string
  readonly label: string
  readonly openInNewTab?: boolean
}

type ArticlePageProps = {
  readonly schema: { readonly url: string; readonly datePublished: string }
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly updatedAt: { readonly dateTime: string; readonly label: string }
  readonly callout: { readonly title: string; readonly body: string }
  readonly proof?: {
    readonly title: string
    readonly body: string
    readonly image: { readonly src: string; readonly alt: string; readonly width: number; readonly height: number }
  }
  readonly comparison?: {
    readonly title: string
    readonly note?: string
    readonly columns: readonly [string, string, string]
    readonly rows: readonly { readonly label: string; readonly values: readonly [string, string] }[]
  }
  readonly sections: readonly ArticleSection[]
  readonly questions?: readonly { readonly question: string; readonly answer: string }[]
  readonly relatedLinks?: readonly Action[]
  readonly primaryAction: Action
  readonly secondaryAction?: Action
  readonly closing?: { readonly title: string; readonly body: string }
}

function ActionLink({ action, className, adornmentClassName }: { readonly action: Action; readonly className?: string; readonly adornmentClassName?: string }) {
  const isExternal = action.openInNewTab !== false

  return (
    <a className={className} href={action.href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer" : undefined}>
      {action.label}
      {isExternal && <span className={adornmentClassName} aria-hidden="true">↗</span>}
    </a>
  )
}

function ArticleActions({ primaryAction, secondaryAction }: { readonly primaryAction: Action; readonly secondaryAction?: Action }) {
  return (
    <div className={styles.actions}>
      <ActionLink action={primaryAction} className={styles.primaryAction} adornmentClassName={styles.actionAdornment} />
      {secondaryAction && (
        <ActionLink action={secondaryAction} className={styles.secondaryAction} adornmentClassName={styles.actionAdornment} />
      )}
    </div>
  )
}

/** A reusable long-form marketing page for comparisons and workflow guides. */
export function ArticlePage({ schema, eyebrow, title, description, updatedAt, callout, proof, comparison, sections, questions, relatedLinks, primaryAction, secondaryAction, closing }: ArticlePageProps) {
  const article = {
    "@type": "BlogPosting",
    "@id": `${schema.url}#article`,
    url: schema.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": schema.url },
    headline: title,
    description,
    datePublished: schema.datePublished,
    dateModified: updatedAt.dateTime,
    author: {
      "@type": "Organization",
      "@id": "https://sleevy.app/#organization",
      name: "Sleevy",
      url: "https://sleevy.app/",
    },
    publisher: { "@id": "https://sleevy.app/#organization" },
    ...(proof && {
      image: {
        "@type": "ImageObject",
        url: new URL(proof.image.src, "https://sleevy.app").href,
        width: proof.image.width,
        height: proof.image.height,
      },
    }),
  }

  const faq = questions && questions.length > 0
    ? {
        "@type": "FAQPage",
        "@id": `${schema.url}#faq`,
        url: schema.url,
        mainEntity: questions.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      }
    : undefined

  return (
    <article className={styles.page}>
      <StructuredData data={{ "@context": "https://schema.org", "@graph": faq ? [article, faq] : [article] }} />
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        <p className={styles.description}>{description}</p>
        <time className={styles.updated} dateTime={updatedAt.dateTime}>{updatedAt.label}</time>
        <ArticleActions primaryAction={primaryAction} secondaryAction={secondaryAction} />
      </header>

      <div className={styles.content}>
        <aside className={styles.callout} aria-label={callout.title}>
          <h2>{callout.title}</h2>
          <p>{callout.body}</p>
        </aside>

        {proof && (
          <figure className={styles.proof}>
            <figcaption>
              <h2>{proof.title}</h2>
              <p>{proof.body}</p>
            </figcaption>
            <img src={proof.image.src} alt={proof.image.alt} width={proof.image.width} height={proof.image.height} loading="lazy" />
          </figure>
        )}

        {comparison && (
          <section className={styles.comparison} aria-labelledby="comparison-title">
            <h2 id="comparison-title">{comparison.title}</h2>
            {comparison.note && <p>{comparison.note}</p>}
            <div className={styles.tableScroll} role="region" tabIndex={0} aria-labelledby="comparison-title">
              <table>
                <thead>
                  <tr>
                    {comparison.columns.map((column) => <th key={column} scope="col">{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {row.values.map((value, index) => <td key={`${row.label}-${index}`}>{value}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}

        {relatedLinks && relatedLinks.length > 0 && (
          <nav className={styles.relatedLinks} aria-label="Related pages">
            <span>Related</span>
            {relatedLinks.map((link) => (
              <ActionLink key={link.href} action={link} />
            ))}
          </nav>
        )}

        {questions && questions.length > 0 && (
          <section className={styles.questions} aria-label="Frequently asked questions">
            <h2>Questions, answered.</h2>
            {questions.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </section>
        )}

        <ProductHuntCard />

        <section className={styles.closing}>
          <h2>{closing?.title ?? "Keep the good links. Lose the open tabs."}</h2>
          <p>{closing?.body ?? "Save something when you find it, then come back to one calm, searchable queue when you have the time."}</p>
          <ArticleActions primaryAction={primaryAction} />
        </section>
      </div>
    </article>
  )
}
