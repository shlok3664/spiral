import { LayoutDashboard, Moon, Shield, Sun } from "lucide-react"

export function TopBar({
  activePage,
  onToggleTheme,
  theme,
}: {
  activePage: "overview" | "analyze"
  onToggleTheme: () => void
  theme: "light" | "dark"
}) {
  return (
    <header
      className="sticky top-0 z-40 border-b-[1.5px] border-border bg-surface"
      id="overview"
    >
      <div className="mx-auto flex min-h-11 max-w-[1480px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <a
          className="flex items-center gap-2 text-text"
          href="#overview"
        >
          <Shield aria-hidden="true" size={18} strokeWidth={1.6} />
          <span className="font-semibold">Spiral</span>
        </a>

        <nav aria-label="Primary navigation" className="hidden md:flex md:items-center md:gap-2">
          <a
            aria-current={activePage === "overview" ? "page" : undefined}
            className={`flex items-center gap-2 border-[1.5px] px-3 py-1.5 text-[13px] ${activePage === "overview" ? "border-primary bg-primary text-on-primary" : "border-transparent text-text hover:bg-bg"}`}
            href="#overview"
          >
            <LayoutDashboard aria-hidden="true" size={15} strokeWidth={1.7} />
            Overview
          </a>
          <a
            aria-current={activePage === "analyze" ? "page" : undefined}
            className={`flex items-center gap-2 border-[1.5px] px-3 py-1.5 text-[13px] ${activePage === "analyze" ? "border-primary bg-primary text-on-primary" : "border-transparent text-text hover:bg-bg"}`}
            href="#analyze"
          >
            Analyze
          </a>
        </nav>
        <button
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          aria-pressed={theme === "dark"}
          className="inline-flex min-h-9 min-w-9 items-center justify-center border border-border bg-surface text-text hover:bg-bg"
          onClick={onToggleTheme}
          type="button"
        >
          {theme === "dark" ? (
            <Sun aria-hidden="true" size={17} strokeWidth={1.7} />
          ) : (
            <Moon aria-hidden="true" size={17} strokeWidth={1.7} />
          )}
        </button>
      </div>
    </header>
  )
}
