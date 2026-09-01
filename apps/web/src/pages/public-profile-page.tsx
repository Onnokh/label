import { Link } from "@tanstack/react-router"
import { Fragment } from "react"
import { useState } from "react"

import { SavedItemCard } from "../components/public-profile/saved-item-card"
import type {
  PublicProfile,
  PublicSavedItem,
  PublicSavedItems,
  ReadingActivity,
} from "../sleevy/public-profile"
import styles from "./public-profile-page.module.scss"

export type PublicProfileData = {
  readonly profile: PublicProfile
  readonly items: PublicSavedItems
  readonly activity: ReadingActivity
}

// Every date on a Public Profile is stated in UTC, because the domain counts in
// UTC: Reading Activity puts each save in a UTC day. State no zone and Intl uses
// the zone of the machine that formats — UTC in the server container, the
// visitor's zone in the browser — so the server markup and the browser markup
// disagree, and React discards the server markup and renders the page again.
// Do not change this to the visitor's zone: the page is cached at the edge, and
// one copy goes to every visitor.
const shortMonthYear = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

// The API buckets Reading Activity by UTC day, so the grid reads those days back
// as UTC too. Parsing "2026-08-13" as a local date would shift a save into the
// neighbouring cell for anyone west of Greenwich.
const utcDay = (iso: string) => new Date(`${iso}T00:00:00Z`)

const DAY_MS = 24 * 60 * 60 * 1000

const activityLevel = (count: number): string => {
  if (count === 0) return ""
  if (count === 1) return styles.level1!
  if (count <= 3) return styles.level2!
  if (count <= 6) return styles.level3!
  return styles.level4!
}

// One cell per day from `from` to `to`, padded at the front so every column is a
// full week starting on Sunday. The API sends only the days that carry a save.
const activityCells = (activity: ReadingActivity) => {
  const counts = new Map(activity.days.map((day) => [day.date, day.count]))
  const start = utcDay(activity.from)
  const end = utcDay(activity.to)

  const cells: Array<{ readonly date: string | null; readonly count: number }> = []
  for (let pad = 0; pad < start.getUTCDay(); pad += 1) {
    cells.push({ date: null, count: 0 })
  }
  for (let at = start.getTime(); at <= end.getTime(); at += DAY_MS) {
    const date = new Date(at).toISOString().slice(0, 10)
    cells.push({ date, count: counts.get(date) ?? 0 })
  }
  return cells
}

// The grid sits directly under the rule of the identity header, with no heading
// and no legend of dates: the header already states the total, so a sentence here
// would say it a second time.
//
// The window is a rolling 52 weeks rather than a calendar year, which is why the
// label below says "the last year" — naming a year would be a claim the count
// cannot support, because the window spans parts of two of them.
const ReadingActivityGrid = ({
  activity,
  handle,
}: {
  readonly activity: ReadingActivity
  readonly handle: string
}) => {
  const cells = activityCells(activity)
  const total = activity.days.reduce((sum, day) => sum + day.count, 0)
  const sentence =
    `@${handle} has sleeved ${total} ${total === 1 ? "link" : "links"} in the last year`

  return (
    <section className={styles.activitySection}>
      {/* Nothing states this in view, so the grid carries the sentence as its
          label: it reads as one image, and a screen reader hears the meaning
          once rather than 365 empty cells. Each day still carries its own count
          for a pointer. */}
      <div className={styles.activityGrid} role="img" aria-label={sentence}>
        {cells.map((cell, index) => (
          <div
            key={cell.date ?? `pad-${index}`}
            className={`${styles.day} ${activityLevel(cell.count)}`}
            title={cell.date && cell.count > 0
              ? `${cell.count} ${cell.count === 1 ? "save" : "saves"} on ${cell.date}`
              : undefined}
          />
        ))}
      </div>
    </section>
  )
}

// Numbered links rather than a scroll listener: a crawler cannot reach infinite
// scroll, and a visitor cannot share a scroll position.
const Pagination = ({
  handle,
  items,
}: {
  readonly handle: string
  readonly items: PublicSavedItems
}) => {
  if (items.totalPages <= 1) return null

  return (
    <nav className={styles.pagination} aria-label="Saved item pages">
      {items.page > 1
        ? (
            <Link
              className={styles.pageLink}
              to="/u/$handle"
              params={{ handle }}
              search={items.page - 1 === 1 ? {} : { page: items.page - 1 }}
              rel="prev"
            >
              Newer
            </Link>
          )
        : <span />}
      <span className={styles.pageCount}>Page {items.page} of {items.totalPages}</span>
      {items.page < items.totalPages
        ? (
            <Link
              className={styles.pageLink}
              to="/u/$handle"
              params={{ handle }}
              search={{ page: items.page + 1 }}
              rel="next"
            >
              Older
            </Link>
          )
        : <span />}
    </nav>
  )
}

// A Handle names a page, and "sleeve" is what the product calls the thing it
// holds, so the two are set as one line: the Handle in full strength and the
// possessive behind it, quieter.
const ProfileIdentity = ({ profile }: { readonly profile: PublicProfile }) => (
  <header className={styles.identity}>
    <h1 className={styles.handle}>
      @{profile.handle}
      <span className={styles.possessive}>&rsquo;s sleeve</span>
    </h1>

    {/* A description list rather than two paragraphs: each number is a labelled
        term, so a screen reader reads "Sleeves, 118" rather than a bare count. */}
    <dl className={styles.stats}>
      <div className={styles.stat}>
        <dt className={styles.statLabel}>Sleeved</dt>
        <dd className={styles.statValue}>{profile.publicSavedItemCount}</dd>
      </div>
      <div className={styles.stat}>
        <dt className={styles.statLabel}>Member since</dt>
        <dd className={styles.statValue}>
          {shortMonthYear.format(new Date(profile.joinedAt))}
        </dd>
      </div>
    </dl>
  </header>
)

// The month a Saved Item was sleeved in, announced wherever it changes going down
// the list. A head at the top of the list stops helping fifty cards later, which
// is the problem a list that runs over three pages actually has; a marker in the
// stream keeps answering it.
//
// Months are compared and formatted in UTC, the way Reading Activity buckets its
// days, so a marker never disagrees with the grid above it.
const monthLabel = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const monthChanged = (item: PublicSavedItem, previous: PublicSavedItem | undefined) =>
  previous === undefined || item.savedAt.slice(0, 7) !== previous.savedAt.slice(0, 7)

const MonthMarker = ({
  savedAt,
  isFirst,
}: {
  readonly savedAt: string
  readonly isFirst: boolean
}) => (
  <li className={isFirst ? `${styles.month} ${styles.monthFirst}` : styles.month}>
    <span className={styles.monthLabel}>{monthLabel.format(new Date(savedAt))}</span>
    <span className={styles.monthRule} aria-hidden="true" />
  </li>
)

export const PublicProfileNotFound = () => (
  <div className={styles.notFound}>
    <h1>No profile here</h1>
    <p>This handle has no public Sleevy profile.</p>
  </div>
)

export const PublicProfilePage = ({ data }: { readonly data: PublicProfileData }) => {
  const { profile, items, activity } = data
  const [removedItemUrls, setRemovedItemUrls] = useState<ReadonlySet<string>>(new Set())
  const visibleItems = items.savedItems.filter((item) => !removedItemUrls.has(item.originalUrl))
  const removeFromView = (url: string) => {
    setRemovedItemUrls((current) => new Set(current).add(url))
  }

  return (
    <div className={styles.page}>
      <ProfileIdentity profile={profile} />

      <ReadingActivityGrid activity={activity} handle={profile.handle} />

      <section className={styles.section}>
        {/* The markers in the list are what a reader sees, so the heading that
            keeps this section in the document outline is spoken, not shown. */}
        <h2 className={styles.visuallyHidden}>Sleeved links</h2>
        {visibleItems.length === 0
          ? <p className={styles.empty}>Nothing published on this page.</p>
          : (
              <ul className={styles.items}>
                {visibleItems.map((item, at) => (
                  <Fragment key={item.originalUrl}>
                    {monthChanged(item, visibleItems[at - 1])
                      ? <MonthMarker savedAt={item.savedAt} isFirst={at === 0} />
                      : null}
                    <SavedItemCard
                      item={item}
                      handle={profile.handle}
                      onRemoved={() => removeFromView(item.originalUrl)}
                    />
                  </Fragment>
                ))}
              </ul>
            )}
        <Pagination handle={profile.handle} items={items} />
      </section>
    </div>
  )
}
