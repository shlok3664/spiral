import { LayoutDashboard, Shield } from "lucide-react"

export function TopBar() {
  return (
    <header
      className="sticky top-0 z-40 border-b-[1.5px] border-ink bg-cream"
      id="overview"
    >
      <div className="mx-auto flex min-h-11 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          className="flex items-center gap-2 text-ink"
          href="#overview"
        >
          <Shield aria-hidden="true" size={18} strokeWidth={1.6} />
          <span className="font-semibold">Spiral</span>
        </a>

        <nav aria-label="Primary navigation" className="hidden md:block">
          <a
            aria-current="page"
            className="flex items-center gap-2 border-[1.5px] border-forest bg-forest px-3 py-1.5 text-[13px] text-cream transition-colors duration-150"
            href="#overview"
          >
            <LayoutDashboard aria-hidden="true" size={15} strokeWidth={1.7} />
            Overview
          </a>
        </nav>
      </div>
    </header>
  )
}
