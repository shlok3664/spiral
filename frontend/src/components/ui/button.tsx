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
        "inline-flex items-center justify-center gap-2 border-[1.5px] border-ink bg-cream px-3 py-2 text-sm text-ink transition-colors duration-150 hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      type={type}
      {...props}
    />
  )
}
