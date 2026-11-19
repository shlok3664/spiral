import type { HTMLAttributes } from "react"

import { cn } from "../../lib/utils"

type BadgeTone = "neutral" | "attack" | "warning" | "ok"

const tones: Record<BadgeTone, string> = {
  neutral: "border-border bg-surface text-muted",
  attack: "border-attack text-attack",
  warning: "border-warning text-warning",
  ok: "border-ok text-ok",
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center border px-2 py-1 text-xs", tones[tone], className)}
      {...props}
    />
  )
}
