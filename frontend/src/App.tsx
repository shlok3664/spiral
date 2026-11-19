import { useEffect, useState } from "react"
import { LayoutDashboard, ScanSearch } from "lucide-react"

import { AnalyzePage } from "./components/analyze"
import { Dashboard } from "./components/dashboard"
import { TopBar } from "./components/topbar"

export default function App() {
  const [page, setPage] = useState<"overview" | "analyze">(() =>
    window.location.hash === "#analyze" ? "analyze" : "overview",
  )
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  )

  useEffect(() => {
    const updatePage = () => {
      setPage(window.location.hash === "#analyze" ? "analyze" : "overview")
    }
    window.addEventListener("hashchange", updatePage)
    return () => window.removeEventListener("hashchange", updatePage)
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark"
    document.documentElement.dataset.theme = nextTheme
    setTheme(nextTheme)
    try {
      window.localStorage.setItem("spiral-theme", nextTheme)
    } catch {
      // Theme selection remains active for this page view if storage is unavailable.
    }
  }

  return (
    <div className="min-h-screen bg-transparent text-text">
      <TopBar activePage={page} onToggleTheme={toggleTheme} theme={theme} />
      {page === "analyze" ? <AnalyzePage /> : <Dashboard />}

      <nav
        aria-label="Bottom navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t-[1.5px] border-border bg-surface px-4 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <a
          aria-current={page === "overview" ? "page" : undefined}
          className={`mx-auto flex min-h-14 w-full max-w-28 flex-col items-center justify-center gap-1 px-4 ${page === "overview" ? "bg-primary text-on-primary" : "text-text"}`}
          href="#overview"
        >
          <LayoutDashboard aria-hidden="true" size={18} strokeWidth={1.7} />
          <span className="text-xs">Overview</span>
        </a>
        <a
          aria-current={page === "analyze" ? "page" : undefined}
          className={`mx-auto flex min-h-14 w-full max-w-28 flex-col items-center justify-center gap-1 px-4 ${page === "analyze" ? "bg-primary text-on-primary" : "text-text"}`}
          href="#analyze"
        >
          <ScanSearch aria-hidden="true" size={18} strokeWidth={1.7} />
          <span className="text-xs">Analyze</span>
        </a>
      </nav>
    </div>
  )
}
