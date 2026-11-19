import type { HTMLAttributes } from "react"

import { cn } from "../../lib/utils"

type BadgeTone = "neutral" | "attack" | "warning" | "ok"

const tones: Record<BadgeTone, string> = {
  neutral: "border-border bg-surface text-text",
  attack: "border-threat bg-surface text-threat",
  warning: "border-border bg-surface text-muted",
  ok: "border-primary bg-primary text-on-primary",
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center border-[1.5px] px-2 py-1 text-xs", tones[tone], className)}
      {...props}
    />
  )
}
