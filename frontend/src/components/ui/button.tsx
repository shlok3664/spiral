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
        "inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition-colors hover:border-slate-600 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      type={type}
      {...props}
    />
  )
}
