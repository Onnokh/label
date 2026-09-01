import type { PublicSavedItem } from "../../sleevy/public-profile"
import { RemoveFromProfileButton } from "./remove-from-profile-button"
import { SaveToLibraryButton } from "./save-to-library-button"
import styles from "./saved-item-card.module.scss"

// The date of a Saved Item is stated in UTC, the zone the month markers and the
// Reading Activity grid above already use, so a card never disagrees with the
// marker it sits under. State no zone and Intl uses the zone of the machine that
// formats: UTC in the server container, the visitor's zone in the browser. The
// two strings then disagree, and React discards the server markup and renders
// the page again. Do not change this to the visitor's zone.
const dayMonth = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

// Every published outbound link carries ugc and nofollow, so a Public Profile is
// not worth targeting for link spam.
const OUTBOUND_REL = "ugc nofollow noopener noreferrer"

const bareHost = (host: string) => host.replace(/^www\./, "")

const faviconFor = (item: PublicSavedItem) =>
  item.faviconUrl ?? item.faviconLightUrl ?? item.faviconDarkUrl ?? null

// A host with no favicon gets its initial rather than an empty square, so a card
// is never anonymous. x.com serves none that the fetcher captures, which used to
// leave every saved post as the same grey box.
const initialOf = (name: string) => bareHost(name).charAt(0).toUpperCase()

const Favicon = ({ item }: { readonly item: PublicSavedItem }) => {
  const favicon = faviconFor(item)

  return favicon
    ? <img className={styles.favicon} src={favicon} alt="" loading="lazy" />
    : <span className={styles.faviconFallback} aria-hidden="true">{initialOf(item.host)}</span>
}

// The X mark, inlined because x.com publishes no favicon this page can reach and
// a post needs to be recognizable as one at a glance.
const XGlyph = () => (
  <svg className={styles.platform} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.63 7.58H.49l8.6-9.83L0 1.15h7.59l5.24 6.93ZM17.61 20.64h2.04L6.48 3.24H4.29Z"
    />
  </svg>
)

// The click target of a card: the card itself. One link covers the whole of it
// rather than several links to the same address, which a screen reader would read
// out one after another. It is a real anchor with a real address, so a crawler
// follows it and a visitor can copy it.
const Cover = ({ item, label }: { readonly item: PublicSavedItem; readonly label: string }) => (
  <a
    className={styles.cover}
    href={item.originalUrl}
    rel={OUTBOUND_REL}
    target="_blank"
    aria-label={`${label} — ${bareHost(item.host)}`}
  />
)

// A signed-in visitor may take this Link into their own Library without leaving
// the profile. The button attaches in the browser only, so the cached
// server-rendered HTML stays the same for every viewer — and an empty slot in
// that HTML costs a signed-out reader nothing.
const SaveSlot = ({
  handle,
  url,
  name,
  onRemoved,
}: {
  readonly handle: string
  readonly url: string
  readonly name: string
  readonly onRemoved: () => void
}) => (
  <div className={styles.saveSlot}>
    <SaveToLibraryButton url={url} name={name} />
    <RemoveFromProfileButton handle={handle} url={url} name={name} onRemoved={onRemoved} />
  </div>
)

const Tags = ({ tags }: { readonly tags: ReadonlyArray<string> }) =>
  tags.length === 0 ? null : (
    <ul className={styles.tags}>
      {tags.map((tag) => <li key={tag} className={styles.tag}>{tag}</li>)}
    </ul>
  )

// A post shows the message itself. Its Link Metadata title holds the words rather
// than a headline for them, so it is set at reading size with its line breaks
// kept, under the Link Author who wrote it — and never as a headline, which is what
// made one long tweet shout down every other card on the page.
const PostCard = ({
  item,
  handle,
  onRemoved,
}: {
  readonly item: PublicSavedItem
  readonly handle: string
  readonly onRemoved: () => void
}) => {
  const authorHandle = item.authorHandle ?? null
  const name = item.authorName ?? authorHandle ?? bareHost(item.host)
  const label = `Post by ${name}`

  return (
    <article className={styles.card}>
      <div className={styles.postBody}>
        <header className={styles.author}>
          {item.authorAvatarUrl
            ? <img className={styles.avatar} src={item.authorAvatarUrl} alt="" loading="lazy" />
            : <span className={styles.avatarFallback} aria-hidden="true">{initialOf(name)}</span>}
          <div className={styles.authorNames}>
            <span className={styles.authorName}>{name}</span>
            {authorHandle ? <span className={styles.authorHandle}>{authorHandle}</span> : null}
          </div>
          <XGlyph />
        </header>

        {item.title
          ? <p className={styles.message}>{item.title}</p>
          : <p className={styles.messageEmpty}>{label}</p>}

        <footer className={styles.meta}>
          <time dateTime={item.savedAt}>{dayMonth.format(new Date(item.savedAt))}</time>
          <Tags tags={item.tags} />
        </footer>
      </div>

      {/* The same thumbnail a Link Card uses, so a post keeps the rhythm of the
          list rather than standing three cards tall. */}
      {item.imageUrl
        ? <img className={styles.thumbnail} src={item.imageUrl} alt="" loading="lazy" />
        : null}

      <Cover item={item} label={label} />
      <SaveSlot handle={handle} url={item.originalUrl} name={label} onRemoved={onRemoved} />
    </article>
  )
}

// Every other Type: the title is a headline for something else, so it leads, with
// the Preview Summary under it and the cover image beside it.
const LinkCard = ({
  item,
  handle,
  onRemoved,
}: {
  readonly item: PublicSavedItem
  readonly handle: string
  readonly onRemoved: () => void
}) => {
  const title = item.title ?? item.originalUrl

  return (
    <article className={styles.card}>
      <div className={styles.linkBody}>
        <div className={styles.source}>
          <Favicon item={item} />
          <span className={styles.host}>{bareHost(item.host)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={item.savedAt}>{dayMonth.format(new Date(item.savedAt))}</time>
          <Tags tags={item.tags} />
        </div>

        <h3 className={styles.title}>{title}</h3>

        {item.previewSummary ? <p className={styles.summary}>{item.previewSummary}</p> : null}
      </div>

      {item.imageUrl
        ? <img className={styles.thumbnail} src={item.imageUrl} alt="" loading="lazy" />
        : null}

      <Cover item={item} label={title} />
      <SaveSlot handle={handle} url={item.originalUrl} name={title} onRemoved={onRemoved} />
    </article>
  )
}

export const SavedItemCard = ({
  item,
  handle,
  onRemoved,
}: {
  readonly item: PublicSavedItem
  readonly handle: string
  readonly onRemoved: () => void
}) => (
  <li className={styles.item}>
    {item.type === "post"
      ? <PostCard item={item} handle={handle} onRemoved={onRemoved} />
      : <LinkCard item={item} handle={handle} onRemoved={onRemoved} />}
  </li>
)
