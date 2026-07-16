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
export function ArticlePage({ eyebrow, title, description, updatedAt, callout, proof, sections, questions, relatedLinks, primaryAction, secondaryAction, closing }: ArticlePageProps) {
  return (
    <article className={styles.page}>
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

        <section className={styles.closing}>
          <h2>{closing?.title ?? "Keep the good links. Lose the open tabs."}</h2>
          <p>{closing?.body ?? "Save something when you find it, then come back to one calm, searchable queue when you have the time."}</p>
          <ArticleActions primaryAction={primaryAction} />
        </section>
      </div>
    </article>
  )
}
