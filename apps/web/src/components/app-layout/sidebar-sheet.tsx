import * as Dialog from "@radix-ui/react-dialog"
import { createContext, use, useMemo, type ReactNode } from "react"

import styles from "./sidebar-sheet.module.scss"

/// A row inside the sheet has no way of knowing it is in one. Rather than hand
/// every sidebar row an `onNavigate`, the sheet publishes one call: dismiss
/// yourself. On the wide layout there is no sheet and this does nothing, which
/// is what lets the same rows render in both places unchanged.
const SidebarSheetContext = createContext<{ readonly close: () => void }>({ close: () => {} })

export function useSidebarSheet() {
  return use(SidebarSheetContext)
}

type SidebarSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /// The same rows the wide layout puts in its standing column.
  readonly children: ReactNode
}

/// The sidebar as an off-canvas sheet, for viewports with no room for a
/// standing column beside the content.
///
/// It is a modal dialog rather than a panel that slides in: on a phone the
/// sheet covers the page it navigates away from, so the focus trap, the
/// dismiss on Escape and the scrim are all things the reader expects, and
/// Radix owns every one of them.
export function SidebarSheet({ open, onOpenChange, children }: SidebarSheetProps) {
  const value = useMemo(() => ({ close: () => onOpenChange(false) }), [onOpenChange])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.scrim} />
        {/* No description: the rows are the content, and a sentence naming
            them would only be read out before every one of them. */}
        <Dialog.Content className={styles.panel} aria-describedby={undefined}>
          <Dialog.Title className={styles.label}>Sleevy navigation</Dialog.Title>
          <SidebarSheetContext.Provider value={value}>{children}</SidebarSheetContext.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
