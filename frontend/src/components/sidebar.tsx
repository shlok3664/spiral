import {
  Activity,
  BarChart3,
  CircleHelp,
  LayoutDashboard,
  ScanLine,
  Shield,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "./ui/badge"

const sections: { label: string; icon: LucideIcon; active?: boolean }[] = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Analyze", icon: ScanLine },
  { label: "Model insights", icon: BarChart3 },
  { label: "Live monitor", icon: Activity },
]

interface SidebarProps {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <a
        className="flex items-center gap-3 px-6 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
        href="#dashboard"
        onClick={onNavigate}
      >
        <span className="flex size-9 items-center justify-center rounded-md border border-cyan/20 bg-cyan/[0.08] text-cyan">
          <Shield aria-hidden="true" size={19} strokeWidth={1.8} />
        </span>
        <span>
          <span className="block text-sm font-bold tracking-[0.19em] text-slate-100">SPIRAL</span>
          <span className="mt-0.5 block text-[9px] font-medium tracking-[0.19em] text-muted">
            NETWORK DEFENSE
          </span>
        </span>
      </a>

      <div className="mx-5 border-t border-line" />
      <nav aria-label="Primary navigation" className="space-y-1 px-3 py-5">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          Workspace
        </p>
        {sections.map(({ label, icon: Icon, active }) => (
          <button
            aria-current={active ? "page" : undefined}
            className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
              active
                ? "bg-cyan/[0.08] text-cyan"
                : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"
            }`}
            disabled={!active}
            key={label}
            onClick={active ? onNavigate : undefined}
            title={active ? undefined : `${label} is not part of this phase`}
            type="button"
          >
            <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
            <span className="flex-1">{label}</span>
            {!active && (
              <span className="text-[9px] uppercase tracking-wider text-slate-600">Soon</span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-4 p-5">
        <div className="rounded-md border border-line bg-white/[0.02] p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <span className="size-1.5 rounded-full bg-cyan" />
            Demo environment
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            NSL-KDD test-set replay. Not a production sensor.
          </p>
        </div>
        <a
          className="flex items-center gap-2 px-2 text-xs text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          href="https://github.com/shlok3664/spiral"
          rel="noreferrer"
          target="_blank"
        >
          <CircleHelp aria-hidden="true" size={15} />
          About this project
          <Badge className="ml-auto">Demo</Badge>
        </a>
      </div>
    </div>
  )
}
