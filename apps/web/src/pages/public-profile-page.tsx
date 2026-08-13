import { Link } from "@tanstack/react-router"

import { SaveToLibraryButton } from "../components/public-profile/save-to-library-button"
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

const monthYear = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" })
const dayMonth = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" })

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

const ReadingActivityGrid = ({ activity }: { readonly activity: ReadingActivity }) => {
  const cells = activityCells(activity)
  const total = activity.days.reduce((sum, day) => sum + day.count, 0)

  return (
    <section className={styles.section}>
      <h2>{total} {total === 1 ? "save" : "saves"} in the last year</h2>
      <div className={styles.activity}>
        <div className={styles.activityGrid} role="img" aria-label={`${total} saves in the last year`}>
          {cells.map((cell, index) => (
            <div
              key={cell.date ?? `pad-${index}`}
              className={`${styles.day} ${activityLevel(cell.count)}`}
              title={cell.date ? `${cell.count} on ${cell.date}` : undefined}
            />
          ))}
        </div>
      </div>
      <p className={styles.activityLegend}>
        <span>{activity.from}</span>
        <span>→</span>
        <span>{activity.to} (UTC)</span>
      </p>
    </section>
  )
}

const faviconFor = (item: PublicSavedItem) =>
  item.faviconUrl ?? item.faviconLightUrl ?? item.faviconDarkUrl ?? null

const SavedItemRow = ({ item }: { readonly item: PublicSavedItem }) => {
  const favicon = faviconFor(item)

  return (
    <li className={styles.item}>
      {favicon
        ? <img className={styles.favicon} src={favicon} alt="" width={20} height={20} loading="lazy" />
        : <span className={styles.favicon} aria-hidden="true" />}
      <div className={styles.itemBody}>
        {/* Every published outbound link carries ugc and nofollow, so a Public
            Profile is not worth targeting for link spam. */}
        <a
          className={styles.itemTitle}
          href={item.originalUrl}
          rel="ugc nofollow noopener noreferrer"
          target="_blank"
        >
          {item.title ?? item.originalUrl}
        </a>
        {item.previewSummary ? <p className={styles.itemSummary}>{item.previewSummary}</p> : null}
        <div className={styles.itemMeta}>
          <span>{item.host}</span>
          <span>·</span>
          <time dateTime={item.savedAt}>{dayMonth.format(new Date(item.savedAt))}</time>
          {item.tags.map((tag) => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
        </div>
      </div>
      {/* A signed-in visitor may take this Link into their own Library without
          leaving the profile. The button attaches on the client only, so the
          cached server-rendered HTML stays the same for every viewer. */}
      <SaveToLibraryButton url={item.originalUrl} name={item.title ?? item.originalUrl} />
    </li>
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

export const PublicProfileNotFound = () => (
  <div className={styles.notFound}>
    <h1>No profile here</h1>
    <p>This handle has no public Sleevy profile.</p>
  </div>
)

export const PublicProfilePage = ({ data }: { readonly data: PublicProfileData }) => {
  const { profile, items, activity } = data

  return (
    <div className={styles.page}>
      <header className={styles.identity}>
        <h1>@{profile.handle}</h1>
        <p className={styles.meta}>
          {profile.publicSavedItemCount} public {profile.publicSavedItemCount === 1 ? "save" : "saves"}
          {" · joined "}
          {monthYear.format(new Date(profile.joinedAt))}
        </p>
      </header>

      <ReadingActivityGrid activity={activity} />

      <section className={styles.section}>
        <h2>Saved</h2>
        {items.savedItems.length === 0
          ? <p className={styles.empty}>Nothing published on this page.</p>
          : (
              <ul className={styles.items}>
                {items.savedItems.map((item) => (
                  <SavedItemRow key={item.originalUrl} item={item} />
                ))}
              </ul>
            )}
        <Pagination handle={profile.handle} items={items} />
      </section>
    </div>
  )
}
