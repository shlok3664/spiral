import { LayoutDashboard, Shield } from "lucide-react"

export function Sidebar() {
  return (
    <div className="flex h-full flex-col">
      <a
        className="flex items-center gap-3 border-b border-border px-5 py-5 text-ink transition-colors duration-150 hover:bg-surface focus-visible:outline-none"
        href="#overview"
      >
        <Shield aria-hidden="true" size={20} strokeWidth={1.6} />
        <span className="text-base font-semibold">Spiral</span>
      </a>

      <nav aria-label="Primary navigation" className="px-3 py-5">
        <a
          aria-current="page"
          className="flex items-center gap-3 border border-border bg-surface px-3 py-2.5 text-sm text-ink transition-colors duration-150"
          href="#overview"
        >
          <LayoutDashboard aria-hidden="true" size={17} strokeWidth={1.7} />
          Overview
        </a>
      </nav>

      <div className="mt-auto border-t border-border p-4 text-[13px] leading-5 text-muted">
        NSL-KDD intrusion detection demo
      </div>
    </div>
  )
}
