import * as RadixSelect from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"

import styles from "./select.module.scss"

export type SelectOption = {
  readonly value: string
  readonly label: string
}

type SelectProps = {
  // The label sits inside the trigger, so the control reads as one chip
  // ("Source: All") rather than a caption beside a box.
  readonly label: string
  readonly value: string
  readonly options: readonly SelectOption[]
  readonly onChange: (value: string) => void
  // Set when the choice narrows the page, so a filter that is on is visible
  // at a glance rather than only on reading its value.
  readonly active?: boolean
}

export function Select({ label, value, options, onChange, active = false }: SelectProps) {
  const selected = options.find((option) => option.value === value)

  return (
    <RadixSelect.Root value={value} onValueChange={onChange}>
      <RadixSelect.Trigger className={styles.trigger} data-active={active || undefined} aria-label={label}>
        <span className={styles.label}>{label}</span>
        <RadixSelect.Value className={styles.value}>
          {selected?.label ?? value}
        </RadixSelect.Value>
        <RadixSelect.Icon className={styles.icon}>
          <ChevronDown size={14} aria-hidden="true" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className={styles.content} position="popper" sideOffset={6}>
          <RadixSelect.Viewport className={styles.viewport}>
            {options.map((option) => (
              <RadixSelect.Item className={styles.item} key={option.value} value={option.value}>
                <span className={styles.indicator}>
                  <RadixSelect.ItemIndicator>
                    <Check size={14} aria-hidden="true" />
                  </RadixSelect.ItemIndicator>
                </span>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
