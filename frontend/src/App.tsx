import { LayoutDashboard } from "lucide-react"

import { Dashboard } from "./components/dashboard"
import { Sidebar } from "./components/sidebar"

export default function App() {
  return (
    <div className="min-h-screen bg-transparent text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 border-r-[1.5px] border-ink bg-cream md:block">
        <Sidebar />
      </aside>

      <div className="min-h-screen min-w-0 md:pl-56">
        <Dashboard />
      </div>

      <nav
        aria-label="Bottom navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-ink bg-cream px-4 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <a
          aria-current="page"
          className="mx-auto flex min-h-14 max-w-24 flex-col items-center justify-center gap-1 bg-forest px-4 text-cream"
          href="#overview"
        >
          <LayoutDashboard aria-hidden="true" size={18} strokeWidth={1.7} />
          <span className="text-xs">Overview</span>
        </a>
      </nav>
    </div>
  )
}
