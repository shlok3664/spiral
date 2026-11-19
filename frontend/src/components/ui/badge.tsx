import type { HTMLAttributes } from "react"

import { cn } from "../../lib/utils"

type BadgeTone = "neutral" | "cyan" | "red" | "amber"

const tones: Record<BadgeTone, string> = {
  neutral: "border-line bg-white/[0.03] text-muted",
  cyan: "border-cyan/20 bg-cyan/[0.08] text-cyan",
  red: "border-red-500/20 bg-red-500/[0.08] text-red-400",
  amber: "border-amber-500/20 bg-amber-500/[0.08] text-amber-400",
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
