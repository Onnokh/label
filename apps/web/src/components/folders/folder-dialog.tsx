import * as Dialog from "@radix-ui/react-dialog"
import { type CSSProperties, type FormEvent, useState } from "react"

import type { Folder } from "../../sleevy/folders"
import { Button } from "../ui/button/button"
import { InputField } from "../ui/input-field/input-field"
import { folderCardColorOptions, type FolderCardColor } from "./folder-card-shader"
import styles from "./folder-dialog.module.scss"

const colorSwatches: Record<FolderCardColor, string> = {
  red: "#c95757",
  orange: "#d9823b",
  yellow: "#c9a747",
  green: "#4b9d72",
  teal: "#3f9ca1",
  blue: "#5877d8",
  purple: "#8a64c2",
  pink: "#c86d91",
  neutral: "#7e8799",
}

const colorLabel = (color: FolderCardColor) => color[0].toUpperCase() + color.slice(1)

function initialColor(folder: Folder): FolderCardColor | null {
  return folder.color && (folderCardColorOptions as readonly string[]).includes(folder.color)
    ? folder.color as FolderCardColor
    : null
}

type NameDialogProps = {
  readonly open: boolean
  readonly title: string
  readonly initialName?: string
  readonly submitLabel: string
  readonly isPending: boolean
  readonly error: string | null
  readonly onClose: () => void
  readonly onSubmit: (name: string) => void
}

export function FolderNameDialog({
  open,
  title,
  initialName = "",
  submitLabel,
  isPending,
  error,
  onClose,
  onSubmit,
}: NameDialogProps) {
  const [name, setName] = useState(initialName)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(name)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{title}</Dialog.Title>
          <form className={styles.form} onSubmit={submit}>
            <InputField
              autoFocus
              maxLength={80}
              placeholder="Folder name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.actions}>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending || !name.trim()}>
                {isPending ? "Saving..." : submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type FolderEditDialogProps = {
  readonly folder: Folder
  readonly isPending: boolean
  readonly error: string | null
  readonly onClose: () => void
  readonly onSubmit: (name: string, color: FolderCardColor | null) => void
}

export function FolderEditDialog({ folder, isPending, error, onClose, onSubmit }: FolderEditDialogProps) {
  const [name, setName] = useState(folder.name)
  const [color, setColor] = useState<FolderCardColor | null>(() => initialColor(folder))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(name, color)
  }

  return (
    <Dialog.Root open onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Edit Folder</Dialog.Title>
          <Dialog.Description className={styles.description}>
            Change the name and the Corona color used for this folder.
          </Dialog.Description>
          <form className={styles.form} onSubmit={submit}>
            <InputField
              autoFocus
              maxLength={80}
              placeholder="Folder name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <fieldset className={styles.colorField}>
              <legend className={styles.colorLegend}>Color</legend>
              <div className={styles.colorOptions}>
                <button
                  className={styles.colorOption}
                  type="button"
                  aria-label="No color"
                  aria-pressed={color === null}
                  data-selected={color === null || undefined}
                  onClick={() => setColor(null)}
                >
                  <span className={styles.noColorSwatch} aria-hidden="true" />
                </button>
                {folderCardColorOptions.map((option) => (
                  <button
                    className={styles.colorOption}
                    key={option}
                    type="button"
                    aria-label={colorLabel(option)}
                    aria-pressed={color === option}
                    data-selected={color === option || undefined}
                    onClick={() => setColor(option)}
                  >
                    <span
                      className={styles.colorSwatch}
                      style={{ "--folder-color-swatch": colorSwatches[option] } as CSSProperties}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </fieldset>
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.actions}>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending || !name.trim()}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

type DeleteDialogProps = {
  readonly folderName: string | null
  readonly isPending: boolean
  readonly error: string | null
  readonly onClose: () => void
  readonly onDelete: () => void
}

export function FolderDeleteDialog({ folderName, isPending, error, onClose, onDelete }: DeleteDialogProps) {
  return (
    <Dialog.Root open={folderName !== null} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>Delete {folderName}?</Dialog.Title>
          <Dialog.Description className={styles.description}>
            Saved items in this folder are kept in your Library.
          </Dialog.Description>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="button" className={styles.destructive} disabled={isPending} onClick={onDelete}>
              {isPending ? "Deleting..." : "Delete Folder"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
