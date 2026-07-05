import { Button } from "../ui/button/button"
import { useKeyboardNav } from "../../contexts/keyboard-nav-context"

export function SidebarCaptureButton() {
  const { openCaptureDialog } = useKeyboardNav()

  return (
    <Button type="button" className="sidebar-capture-button" onClick={() => openCaptureDialog()}>
      <span>Add Item</span>
      <kbd>N</kbd>
    </Button>
  )
}
