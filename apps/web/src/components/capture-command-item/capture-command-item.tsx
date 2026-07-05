import { CommandItem } from "cmdk"
import { Plus } from "lucide-react"

const ICON_SIZE = 14

type CaptureCommandItemProps = {
  readonly url: string
  readonly disabled?: boolean
  readonly actionLabel?: string
  readonly onSelect: () => void
}

export function CaptureCommandItem({
  url,
  disabled = false,
  actionLabel,
  onSelect,
}: CaptureCommandItemProps) {
  return (
    <CommandItem
      value={`capture:${url}`}
      keywords={[url]}
      disabled={disabled}
      forceMount
      onSelect={onSelect}
    >
      <Plus size={ICON_SIZE} className="cmdk-icon" />
      <div className="cmdk-item-text">
        <span className="cmdk-item-title">Save to Sleeve</span>
        {url ? <span className="cmdk-capture-url">{url}</span> : null}
      </div>
      {actionLabel ? <span className="cmdk-item-type">{actionLabel}</span> : null}
    </CommandItem>
  )
}
