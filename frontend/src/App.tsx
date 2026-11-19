import { useState } from "react"
import { Menu, X } from "lucide-react"

import { Dashboard } from "./components/dashboard"
import { Sidebar } from "./components/sidebar"
import { Button } from "./components/ui/button"

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-canvas text-slate-200">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-canvas md:block">
        <Sidebar />
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <Button
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
              className="border-0 p-2 md:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
            </Button>
            <span className="text-[11px] font-semibold uppercase tracking-[0.17em] text-slate-500">
              Security operations
            </span>
            <span aria-hidden="true" className="hidden size-1 rounded-full bg-slate-700 sm:block" />
            <span className="hidden font-mono text-[10px] text-slate-600 sm:block">SPIRAL / DEMO</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">
            <span className="size-1.5 rounded-full bg-cyan" />
            Model ready
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="fixed inset-x-0 top-14 z-30 border-b border-line bg-canvas md:hidden">
            <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        )}

        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Dashboard />
        </main>
      </div>
    </div>
  )
}
