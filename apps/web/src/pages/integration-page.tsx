import { useEffect, useState } from "react"

import styles from "./integration-page.module.scss"

type Action = {
  readonly href: string
  readonly label: string
  readonly trailingIcon?: { readonly src: string; readonly alt: string; readonly width: number; readonly height: number }
  readonly iosOnly?: boolean
  readonly openInNewTab?: boolean
}

type IntegrationPageProps = {
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly benefits: readonly { readonly title: string; readonly body: string }[]
  readonly icon: { readonly src: string; readonly alt: string; readonly width: number; readonly height: number }
  readonly primaryAction: Action
  readonly secondaryAction?: Action
}

export function IntegrationPage({ eyebrow, title, description, benefits, icon, primaryAction, secondaryAction }: IntegrationPageProps) {
  const [isIOS, setIsIOS] = useState(false)
  const visibleSecondaryAction = secondaryAction && (!secondaryAction.iosOnly || isIOS) ? secondaryAction : undefined

  useEffect(() => {
    const { userAgent, platform, maxTouchPoints } = navigator
    setIsIOS(/iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1))
  }, [])

  return (
    <article className={styles.page}>
      <section className={styles.hero}>
        <img className={styles.icon} src={icon.src} alt={icon.alt} width={icon.width} height={icon.height} />
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className={styles.actions}>
          <a
            className={styles.primaryAction}
            href={primaryAction.href}
            target={primaryAction.openInNewTab === false ? undefined : "_blank"}
            rel={primaryAction.openInNewTab === false ? undefined : "noreferrer"}
          >
            {primaryAction.label}
            <span className={styles.actionAdornment} aria-hidden="true">↗</span>
          </a>
          {visibleSecondaryAction && (
            <a
              className={styles.secondaryAction}
              href={visibleSecondaryAction.href}
              target={visibleSecondaryAction.openInNewTab === false ? undefined : "_blank"}
              rel={visibleSecondaryAction.openInNewTab === false ? undefined : "noreferrer"}
            >
              {visibleSecondaryAction.label}
              {visibleSecondaryAction.trailingIcon ? (
                <span className={styles.actionAdornment}>
                  <img className={styles.actionIcon} src={visibleSecondaryAction.trailingIcon.src} alt={visibleSecondaryAction.trailingIcon.alt} width={visibleSecondaryAction.trailingIcon.width} height={visibleSecondaryAction.trailingIcon.height} />
                </span>
              ) : (
                <span className={styles.actionAdornment} aria-hidden="true">↗</span>
              )}
            </a>
          )}
        </div>
      </section>

      <section className={styles.article} aria-label={`About Sleevy ${eyebrow}`}>
        <div className={styles.intro}>
          <p>Sleevy keeps one reading queue across the places where you find useful things. Save it now; decide what to do with it later.</p>
        </div>
        {benefits.map((benefit) => (
          <article key={benefit.title}>
            <h2>{benefit.title}</h2>
            <p>{benefit.body}</p>
          </article>
        ))}
      </section>
    </article>
  )
}
