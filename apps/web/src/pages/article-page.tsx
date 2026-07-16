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
  readonly sections: readonly ArticleSection[]
  readonly questions?: readonly { readonly question: string; readonly answer: string }[]
  readonly primaryAction: Action
  readonly secondaryAction?: Action
}

function ArticleActions({ primaryAction, secondaryAction }: { readonly primaryAction: Action; readonly secondaryAction?: Action }) {
  return (
    <div className={styles.actions}>
      <a
        className={styles.primaryAction}
        href={primaryAction.href}
        target={primaryAction.openInNewTab === false ? undefined : "_blank"}
        rel={primaryAction.openInNewTab === false ? undefined : "noreferrer"}
      >
        {primaryAction.label}
        {primaryAction.openInNewTab !== false && <span className={styles.actionAdornment} aria-hidden="true">↗</span>}
      </a>
      {secondaryAction && (
        <a
          className={styles.secondaryAction}
          href={secondaryAction.href}
          target={secondaryAction.openInNewTab === false ? undefined : "_blank"}
          rel={secondaryAction.openInNewTab === false ? undefined : "noreferrer"}
        >
          {secondaryAction.label}
          {secondaryAction.openInNewTab !== false && <span className={styles.actionAdornment} aria-hidden="true">↗</span>}
        </a>
      )}
    </div>
  )
}

/** A reusable long-form marketing page for comparisons and workflow guides. */
export function ArticlePage({ eyebrow, title, description, updatedAt, callout, sections, questions, primaryAction, secondaryAction }: ArticlePageProps) {
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

        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}

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
          <h2>Keep the good links. Lose the open tabs.</h2>
          <p>Save something when you find it, then come back to one calm, searchable queue when you have the time.</p>
          <ArticleActions primaryAction={primaryAction} />
        </section>
      </div>
    </article>
  )
}
