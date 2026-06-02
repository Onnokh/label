import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys"
import { useRouter } from "@tanstack/react-router"

export type ItemActions = {
  readonly onOpen: () => void
  readonly onToggleRead: () => void
  readonly onCopyUrl: () => void
  readonly onDelete: () => void
}

type KeyboardNavContextValue = {
  readonly selectedIndex: number
  readonly setSelectedIndex: (i: number) => void
  readonly setListLength: (n: number) => void
  readonly setItemActions: (actions: ItemActions | null) => void
  readonly paletteOpen: boolean
  readonly openPalette: () => void
  readonly closePalette: () => void
  readonly captureDialogOpen: boolean
  readonly captureDialogInitialUrl: string
  readonly openCaptureDialog: (initialUrl?: string) => void
  readonly closeCaptureDialog: () => void
  readonly helpOpen: boolean
  readonly setHelpOpen: (open: boolean) => void
  readonly pendingDelete: boolean
}

const KeyboardNavContext = createContext<KeyboardNavContextValue | null>(null)

const overlappingHotkeyOptions = { conflictBehavior: "allow" as const }

export function useKeyboardNav() {
  const ctx = use(KeyboardNavContext)
  if (!ctx) throw new Error("useKeyboardNav must be used within KeyboardNavProvider")
  return ctx
}

type ModalState = {
  paletteOpen: boolean
  captureDialogOpen: boolean
  helpOpen: boolean
}

export function KeyboardNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [modalState, setModalState] = useState<ModalState>({
    paletteOpen: false,
    captureDialogOpen: false,
    helpOpen: false,
  })
  const [captureDialogInitialUrl, setCaptureDialogInitialUrl] = useState("")
  const [pendingDelete, setPendingDelete] = useState(false)

  const listLengthRef = useRef(0)
  const itemActionsRef = useRef<ItemActions | null>(null)
  const savedIndexRef = useRef(-1)

  const setListLength = useCallback((n: number) => {
    listLengthRef.current = n
  }, [])

  const setItemActions = useCallback((actions: ItemActions | null) => {
    itemActionsRef.current = actions
  }, [])

  const openPalette = useCallback(() => {
    savedIndexRef.current = selectedIndex
    setModalState((prev) => ({ ...prev, paletteOpen: true }))
  }, [selectedIndex])

  const closePalette = useCallback(() => {
    setModalState((prev) => ({ ...prev, paletteOpen: false }))
    setSelectedIndex(savedIndexRef.current)
  }, [])

  const openCaptureDialog = useCallback((initialUrl = "") => {
    savedIndexRef.current = selectedIndex
    setCaptureDialogInitialUrl(initialUrl)
    setModalState((prev) => ({ ...prev, captureDialogOpen: true }))
  }, [selectedIndex])

  const closeCaptureDialog = useCallback(() => {
    setModalState((prev) => ({ ...prev, captureDialogOpen: false }))
    setCaptureDialogInitialUrl("")
    setSelectedIndex(savedIndexRef.current)
  }, [])

  const setHelpOpen = useCallback((open: boolean) => {
    setModalState((prev) => ({ ...prev, helpOpen: open }))
  }, [])

  const { paletteOpen, captureDialogOpen, helpOpen } = modalState
  const suppressGlobal = paletteOpen || captureDialogOpen || helpOpen

  useHotkey("J", () => {
    setSelectedIndex(Math.min(selectedIndex + 1, listLengthRef.current - 1))
  }, { enabled: !suppressGlobal })

  useHotkey("K", () => {
    setSelectedIndex(Math.max(selectedIndex - 1, 0))
  }, { enabled: !suppressGlobal })

  useHotkey("O", () => {
    itemActionsRef.current?.onOpen()
  }, { enabled: !suppressGlobal })

  useHotkey("Enter", () => {
    itemActionsRef.current?.onOpen()
  }, { enabled: !suppressGlobal })

  useHotkey("R", () => {
    itemActionsRef.current?.onToggleRead()
  }, { enabled: !suppressGlobal })

  useHotkey("C", () => {
    itemActionsRef.current?.onCopyUrl()
  }, { enabled: !suppressGlobal })

  useHotkey("D", () => {
    if (itemActionsRef.current) setPendingDelete(true)
  }, { enabled: !suppressGlobal && !pendingDelete })

  useHotkey({ key: "3", shift: true }, () => {
    if (itemActionsRef.current) setPendingDelete(true)
  }, { enabled: !suppressGlobal && !pendingDelete })

  useHotkey("Y", () => {
    itemActionsRef.current?.onDelete()
    setPendingDelete(false)
  }, { enabled: pendingDelete })

  useHotkey("N", () => {
    setPendingDelete(false)
  }, { enabled: pendingDelete, ...overlappingHotkeyOptions })

  useHotkey("Escape", () => {
    setPendingDelete(false)
  }, { enabled: pendingDelete, ...overlappingHotkeyOptions })

  useHotkey("N", () => {
    openCaptureDialog()
  }, { enabled: !suppressGlobal && !pendingDelete, ...overlappingHotkeyOptions })

  useHotkey({ key: "/", shift: true }, () => {
    setHelpOpen(true)
  }, { enabled: !suppressGlobal })

  useHotkey("Mod+K", (e) => {
    e.preventDefault()
    openPalette()
  }, { enabled: !paletteOpen })

  useHotkeySequence(["G", "I"], () => {
    void router.navigate({ to: "/inbox" })
    setSelectedIndex(-1)
  }, { enabled: !suppressGlobal })

  useHotkeySequence(["G", "L"], () => {
    void router.navigate({ to: "/library" })
    setSelectedIndex(-1)
  }, { enabled: !suppressGlobal })

  const value = useMemo(() => ({
    selectedIndex,
    setSelectedIndex,
    setListLength,
    setItemActions,
    paletteOpen,
    openPalette,
    closePalette,
    captureDialogOpen,
    captureDialogInitialUrl,
    openCaptureDialog,
    closeCaptureDialog,
    helpOpen,
    setHelpOpen,
    pendingDelete,
  }), [
    selectedIndex,
    paletteOpen,
    openPalette,
    closePalette,
    captureDialogOpen,
    captureDialogInitialUrl,
    openCaptureDialog,
    closeCaptureDialog,
    helpOpen,
    setHelpOpen,
    pendingDelete,
    setListLength,
    setItemActions,
  ])

  return (
    <KeyboardNavContext.Provider value={value}>
      {children}
    </KeyboardNavContext.Provider>
  )
}
