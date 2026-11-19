import type { ButtonHTMLAttributes } from "react"

import { cn } from "../../lib/utils"

export function Button({
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 border border-border bg-surface px-3 py-2 text-sm text-ink transition-colors duration-150 hover:bg-[#202225] disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      type={type}
      {...props}
    />
  )
}
