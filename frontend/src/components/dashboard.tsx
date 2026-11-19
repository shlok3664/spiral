import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, Pause, Play, X } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { getAlerts, getStats } from "../api"
import type { Alert, AlertsResponse, DashboardStats, TrafficPoint } from "../api"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

function formatCount(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(value)
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`
}

function DashboardSkeleton() {
  return (
    <div aria-label="Loading replay data" className="space-y-8" role="status">
      <span className="sr-only">Loading replay data</span>
      <div className="h-28 animate-pulse border-b border-border bg-surface" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-20 animate-pulse bg-surface" key={index} />
        ))}
      </div>
      <div className="h-64 animate-pulse bg-surface" />
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section aria-labelledby="dashboard-error" className="border-t border-border py-12">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-muted" size={18} />
        <div>
          <h2 className="text-base font-medium text-ink" id="dashboard-error">
            Dashboard data could not be loaded
          </h2>
          <p className="mt-1 text-[13px] text-muted">{error}</p>
          <Button className="mt-4" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </section>
  )
}

function ReplayStrip({
  count,
  loading,
  paused,
  available,
  onTogglePause,
}: {
  count: number | null
  loading: boolean
  paused: boolean
  available: boolean
  onTogglePause: () => void
}) {
  return (
    <div className="border-b border-border">
      <div className="mx-auto flex min-h-11 max-w-[1480px] items-center gap-2 px-4 sm:px-6 lg:px-8">
        <span className="min-w-0 truncate text-[13px] text-ink">
          Replay of NSL-KDD test set
        </span>
        <span aria-hidden="true" className="text-muted">·</span>
        <span className="shrink-0 text-[13px] tabular-nums text-muted">
          {loading ? "Loading" : available ? `${formatCount(count)} flows` : "Unavailable"}
        </span>
        {available && (
          <span className="ml-auto hidden text-[13px] text-ok sm:inline">Model healthy</span>
        )}
        {available && (
          <Button
            aria-label={paused ? "Resume dashboard refresh" : "Pause dashboard refresh"}
            className="min-h-8 shrink-0 px-2.5 py-1 text-[13px] sm:ml-4"
            onClick={onTogglePause}
          >
            {paused ? <Play aria-hidden="true" size={14} /> : <Pause aria-hidden="true" size={14} />}
            <span>{paused ? "Resume" : "Pause"}</span>
          </Button>
        )}
      </div>
    </div>
  )
}

function ReplayMetrics({ stats, available }: { stats: DashboardStats; available: boolean }) {
  const metrics = [
    {
      label: "Attacks flagged",
      value: available ? formatCount(stats.attacks_detected) : "—",
      description: "attacks flagged in the replay",
      hero: true,
    },
    {
      label: "Detection rate",
      value: available ? formatPercent(stats.detection_rate) : "—",
      description: "Recall against replay labels",
    },
    {
      label: "False-positive rate",
      value: available ? formatPercent(stats.false_positive_rate) : "—",
      description: "Normal rows flagged",
    },
    {
      label: "Flows analyzed",
      value: available ? formatCount(stats.total_flows) : "—",
      description: "Rows in the replay set",
    },
  ]

  return (
    <section aria-label="Replay metrics" className="grid grid-cols-2 border-y border-border md:grid-cols-4">
      {metrics.map((metric, index) => (
        <div
          className={`min-w-0 py-4 ${
            index % 2 === 0 ? "border-r border-border pr-3" : "pl-3"
          } ${index < 2 ? "border-b border-border" : ""} md:border-b-0 md:px-5 ${
            index < 3 ? "md:border-r md:border-border" : "md:border-r-0"
          } ${index === 0 ? "md:pl-0" : ""} ${index === 3 ? "md:pr-0" : ""}`}
          key={metric.label}
        >
          <p className="text-[13px] text-muted">{metric.label}</p>
          <p
            className={`mt-1 tabular-nums leading-tight ${
              metric.hero
                ? `text-[36px] font-medium ${available ? "text-attack" : "text-ink"}`
                : "text-[22px] font-medium text-ink"
            }`}
          >
            {metric.value}
          </p>
          <p className="mt-1 text-[13px] text-muted">{metric.description}</p>
        </div>
      ))}
    </section>
  )
}

function Confidence({ alert }: { alert: Alert }) {
  const value = Math.max(0, Math.min(1, alert.confidence))
  const lowConfidence = value < 0.7
  const tone = lowConfidence ? "warning" : "attack"

  return (
    <span className="flex items-center justify-end gap-2">
      <span className={`font-mono text-[13px] tabular-nums ${lowConfidence ? "text-warning" : "text-attack"}`}>
        {formatPercent(value)}
      </span>
      <span
        aria-label={`Confidence ${formatPercent(value)}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(value * 100)}
        className="h-1 w-12 bg-border"
        role="progressbar"
      >
        <span
          className={`block h-full ${tone === "warning" ? "bg-warning" : "bg-attack"}`}
          style={{ width: `${value * 100}%` }}
        />
      </span>
    </span>
  )
}

function AlertRow({
  alert,
  onSelect,
  compact = false,
}: {
  alert: Alert
  onSelect: (alert: Alert) => void
  compact?: boolean
}) {
  return (
    <button
      aria-label={`Open replay row ${alert.row}, ${alert.category}, ${alert.protocol} ${alert.service}, confidence ${formatPercent(alert.confidence)}`}
      className={`relative grid w-full items-center gap-2 border-b border-border px-3 text-left transition-colors duration-150 hover:bg-surface focus-visible:bg-surface ${
        compact
          ? "grid-cols-[1fr_auto] py-3"
          : "grid-cols-[62px_74px_minmax(0,1fr)_112px_18px] py-3"
      }`}
      onClick={() => onSelect(alert)}
      type="button"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-attack" />
      <span className="font-mono text-[13px] tabular-nums text-muted">
        #{alert.row.toString().padStart(5, "0")}
      </span>
      <span className="truncate text-[13px] text-ink">{alert.category}</span>
      <span className={compact ? "col-span-2 flex min-w-0 items-center justify-between gap-3" : "min-w-0"}>
        {compact ? (
          <>
            <span className="truncate text-[13px] text-muted">
              <span className="font-mono text-ink">{alert.protocol}</span>
              <span className="mx-1.5">/</span>
              {alert.service}
            </span>
            <Confidence alert={alert} />
          </>
        ) : (
          <span className="truncate text-[13px] text-muted">
            <span className="font-mono text-ink">{alert.protocol}</span>
            <span className="mx-1.5">/</span>
            {alert.service}
          </span>
        )}
      </span>
      {!compact && <Confidence alert={alert} />}
      {!compact && <ChevronRight aria-hidden="true" className="justify-self-end text-muted" size={14} />}
    </button>
  )
}

function AlertsPanel({
  response,
  onSelect,
}: {
  response: AlertsResponse
  onSelect: (alert: Alert) => void
}) {
  return (
    <section aria-labelledby="alerts-heading" className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-medium text-ink" id="alerts-heading">
          Alerts needing review
        </h2>
        <span className="text-[13px] text-muted">
          {response.status === "available" ? `${response.alerts.length} shown` : "Unavailable"}
        </span>
      </div>

      {response.alerts.length ? (
        <>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[62px_74px_minmax(0,1fr)_112px_18px] border-y border-border px-3 py-2 text-[13px] text-muted md:grid"
          >
            <span>Row ID</span>
            <span>Category</span>
            <span>Protocol / service</span>
            <span className="text-right">Confidence</span>
            <span />
          </div>
          <ul aria-label="Predicted attack alerts" className="hidden md:block">
            {response.alerts.map((alert) => (
              <li key={alert.row}>
                <AlertRow alert={alert} onSelect={onSelect} />
              </li>
            ))}
          </ul>
          <ul aria-label="Predicted attack alerts" className="md:hidden">
            {response.alerts.map((alert) => (
              <li key={alert.row}>
                <AlertRow alert={alert} compact onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="border-y border-border py-8 text-[13px] text-muted">
          {response.status === "available"
            ? "No attack predictions in this replay."
            : "No alerts until an NSL-KDD test set is available."}
        </div>
      )}
    </section>
  )
}

function CategoryBreakdown({ stats }: { stats: DashboardStats }) {
  const categories = [...stats.categories].sort((a, b) => b.value - a.value)
  const largest = Math.max(1, ...categories.map((category) => category.value))

  return (
    <section aria-labelledby="categories-heading">
      <h2 className="text-base font-medium text-ink" id="categories-heading">
        By category
      </h2>
      <p className="mt-1 text-[13px] text-muted">Replay labels · flow count</p>
      {categories.length ? (
        <ul className="mt-4 space-y-3">
          {categories.map((category) => {
            const normal = category.name === "Normal"
            const width = `${(category.value / largest) * 100}%`
            return (
              <li key={category.name}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink">{category.name}</span>
                  <span className="tabular-nums text-muted">{formatCount(category.value)}</span>
                </div>
                <div aria-hidden="true" className="mt-1.5 h-1.5 bg-border">
                  <div
                    className={`h-full transition-[width] duration-150 ${normal ? "bg-[#65696e]" : "bg-attack"}`}
                    style={{ width }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 border-y border-border py-6 text-[13px] text-muted">
          No labeled rows available.
        </p>
      )}
    </section>
  )
}

function TrafficChart({ points }: { points: TrafficPoint[] }) {
  const data = points.map((point) => ({
    ...point,
    normal: Math.max(0, point.flows - point.attacks),
  }))

  return (
    <section aria-labelledby="traffic-heading" className="border-t border-border pt-4">
      <h2 className="text-base font-medium text-ink" id="traffic-heading">
        Flows over replay batches
      </h2>
      <p className="mt-1 text-[13px] text-muted">
        Rows in file order; the dataset has no timestamps
      </p>
      {data.length ? (
        <>
          <div aria-label="Stacked area chart of benign and flagged flows by replay batch" className="mt-4 h-44 w-full" role="img">
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="bucket"
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  tickFormatter={(value: number) => `B${value}`}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    color: "var(--text)",
                    fontSize: 13,
                  }}
                  formatter={(value: number, name: string | number) => [
                    value.toLocaleString(),
                    name === "attacks" ? "Flagged attacks" : "Benign flows",
                  ]}
                  labelFormatter={(value: number) => `Replay batch ${value}`}
                />
                <Area
                  dataKey="normal"
                  fill="#65696e"
                  fillOpacity={0.28}
                  name="normal"
                  stackId="flows"
                  stroke="#65696e"
                  strokeWidth={1}
                  type="monotone"
                />
                <Area
                  dataKey="attacks"
                  fill="var(--attack)"
                  fillOpacity={0.62}
                  name="attacks"
                  stackId="flows"
                  stroke="var(--attack)"
                  strokeWidth={1}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-[13px] text-muted">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 bg-[#65696e]" />
              Benign flows
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 bg-attack" />
              Flagged attacks
            </span>
          </div>
        </>
      ) : (
        <p className="mt-4 border-y border-border py-6 text-[13px] text-muted">
          No replay rows available to chart.
        </p>
      )}
    </section>
  )
}

function AlertDrawer({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (alert && !dialog.open) dialog.showModal()
    if (!alert && dialog.open) dialog.close()
  }, [alert])

  return (
    <dialog
      aria-labelledby="alert-drawer-title"
      className="fixed inset-y-0 right-0 m-0 ml-auto h-full max-h-none w-full max-w-[440px] border-l border-border bg-surface p-0 text-ink"
      onClose={onClose}
      ref={dialogRef}
    >
      {alert && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-border p-5">
            <div>
              <p className="text-[13px] text-muted">Replay row</p>
              <h2 className="mt-1 font-mono text-lg tabular-nums" id="alert-drawer-title">
                #{alert.row.toString().padStart(5, "0")}
              </h2>
            </div>
            <button
              aria-label="Close alert details"
              className="p-2 text-muted transition-colors duration-150 hover:bg-[#202225] hover:text-ink"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>

          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-muted">Prediction</span>
              <Badge tone="attack">Attack</Badge>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <span className="text-[13px] text-muted">Replay category</span>
              <span className="text-[13px] text-ink">{alert.category}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <span className="text-[13px] text-muted">Model confidence</span>
              <Confidence alert={alert} />
            </div>

            <section aria-labelledby="flow-details-heading" className="border-t border-border pt-5">
              <h3 className="text-sm font-medium" id="flow-details-heading">
                Flow details
              </h3>
              <dl className="mt-3 divide-y divide-border">
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px] text-muted">Protocol</dt>
                  <dd className="font-mono text-[13px]">{alert.protocol}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px] text-muted">Service</dt>
                  <dd className="text-[13px]">{alert.service}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px] text-muted">Source bytes</dt>
                  <dd className="font-mono text-[13px] tabular-nums">{formatCount(alert.src_bytes)}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px] text-muted">Destination bytes</dt>
                  <dd className="font-mono text-[13px] tabular-nums">{formatCount(alert.dst_bytes)}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px] text-muted">Dataset label</dt>
                  <dd className="text-[13px]">{alert.true_label}</dd>
                </div>
              </dl>
            </section>

            <p className="border-t border-border pt-4 text-[13px] leading-5 text-muted">
              This NSL-KDD data slice has no IP addresses or timestamps. The category and dataset
              label above come from the replay row.
            </p>
          </div>
        </div>
      )}
    </dialog>
  )
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const refresh = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const [nextStats, nextAlerts] = await Promise.all([getStats(), getAlerts(8)])
      setStats(nextStats)
      setAlerts(nextAlerts)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The API request failed.")
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh(true)
  }, [refresh, reloadToken])

  useEffect(() => {
    if (paused) return
    const interval = window.setInterval(() => void refresh(false), 30_000)
    return () => window.clearInterval(interval)
  }, [paused, refresh])

  const replayAvailable =
    stats?.status === "available" && alerts?.status === "available"
  const retry = () => setReloadToken((token) => token + 1)

  return (
    <div className="min-h-screen pb-20 md:pb-0" id="overview">
      <ReplayStrip
        available={Boolean(replayAvailable && !error)}
        count={stats?.total_flows ?? null}
        loading={loading}
        onTogglePause={() => setPaused((value) => !value)}
        paused={paused}
      />
      <main className="mx-auto max-w-[1480px] px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium text-ink">Overview</h1>
            <p className="mt-1 text-[13px] text-muted">
              Saved XGBoost pipeline · NSL-KDD flow classification
            </p>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Range
            <span className="relative">
              <select
                aria-label="Replay range"
                className="min-h-9 appearance-none border border-border bg-surface py-1 pl-3 pr-8 text-[13px] text-ink focus:outline-none"
                defaultValue="full"
              >
                <option value="full">Full replay</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
                size={14}
              />
            </span>
          </label>
        </div>

        {error && stats && (
          <div className="mb-5 flex items-center justify-between gap-4 border border-border bg-surface px-3 py-2.5 text-[13px]">
            <span className="text-muted">Refresh failed: {error}</span>
            <Button className="shrink-0 px-2 py-1 text-[13px]" onClick={retry}>
              Retry
            </Button>
          </div>
        )}

        {loading && !stats ? (
          <DashboardSkeleton />
        ) : error && !stats ? (
          <ErrorState error={error} onRetry={retry} />
        ) : stats && alerts ? (
          <>
            <ReplayMetrics available={Boolean(replayAvailable)} stats={stats} />
            {!replayAvailable && (
              <p className="mt-3 text-[13px] text-muted">
                Replay data is unavailable. Add the NSL-KDD test file under data/ to populate
                dashboard metrics and charts.
              </p>
            )}

            <div className="mt-7 grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
              <AlertsPanel onSelect={setSelectedAlert} response={alerts} />
              <aside className="min-w-0 space-y-8">
                <CategoryBreakdown stats={stats} />
                <TrafficChart points={stats.traffic} />
              </aside>
            </div>
          </>
        ) : (
          <ErrorState error="The API returned no dashboard data." onRetry={retry} />
        )}
      </main>
      <AlertDrawer alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  )
}
