import { CommandDialog, CommandGroup, CommandInput, CommandList } from "cmdk"
import { Description as DialogDescription, Title as DialogTitle } from "@radix-ui/react-dialog"
import { Search } from "lucide-react"

import { CaptureCommandItem } from "../capture-command-item/capture-command-item"
import { useCapture } from "../../sleevy/saved-items"
import "../command-palette/command-palette.scss"

export function CaptureDialog({ initialUrl, onClose }: { readonly initialUrl: string; readonly onClose: () => void }) {
  const capture = useCapture(initialUrl)
  const trimmedUrl = capture.url.trim()

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
    }
  }

  const captureAndClose = () => {
    capture.captureUrl(trimmedUrl, () => {
      onClose()
    })
  }

  return (
    <CommandDialog
      open
      onOpenChange={handleOpenChange}
      label="Capture URL"
      shouldFilter={false}
      loop={false}
      vimBindings={false}
      overlayClassName="cmdk-overlay"
      contentClassName="cmdk-content"
    >
      <DialogTitle className="sr-only">Capture URL</DialogTitle>
      <DialogDescription className="sr-only">Paste a URL to save it to your reading list.</DialogDescription>
      <div className="cmdk-search">
        <Search aria-hidden="true" />
        <CommandInput
          placeholder="Paste a URL..."
          value={capture.url}
          onValueChange={capture.setUrl}
        />
        <kbd>esc</kbd>
      </div>
      <CommandList>
        <CommandGroup forceMount>
          <CaptureCommandItem
            url={trimmedUrl}
            disabled={!trimmedUrl || capture.isPending}
            actionLabel={capture.isPending ? "Saving..." : undefined}
            onSelect={captureAndClose}
          />
        </CommandGroup>
      </CommandList>
      {capture.formError ? <div className="cmdk-error">{capture.formError}</div> : null}
      <div className="cmdk-footer">
        <span className="cmdk-footer-hint"><kbd>↵</kbd> Capture</span>
      </div>
    </CommandDialog>
  )
}
