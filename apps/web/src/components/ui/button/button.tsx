import clsx from "clsx"
import { type ButtonHTMLAttributes } from "react"

import styles from "./button.module.scss"

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: "primary" | "ghost"
}

export function Button({ variant = "primary", className, type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      className={clsx(styles.button, styles[variant], className)}
      {...props}
    />
  )
}
