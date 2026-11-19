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
        "inline-flex items-center justify-center gap-2 border-[1.5px] border-border bg-surface px-3 py-2 text-sm text-text transition-colors hover:bg-bg disabled:cursor-not-allowed",
        className,
      )}
      type={type}
      {...props}
    />
  )
}
