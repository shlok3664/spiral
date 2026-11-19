import type { HTMLAttributes } from "react"

import { cn } from "../../lib/utils"

type BadgeTone = "neutral" | "attack" | "warning" | "ok"

const tones: Record<BadgeTone, string> = {
  neutral: "border-ink bg-cream text-ink",
  attack: "border-crimson bg-cream text-ink",
  warning: "border-lime bg-lime text-ink",
  ok: "border-forest bg-forest text-cream",
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
