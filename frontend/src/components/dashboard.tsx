import { useEffect, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Database,
  RefreshCw,
  ShieldCheck,
  ShieldEllipsis,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { getAlerts, getMetrics, getStats } from "../api"
import type { AlertsResponse, DashboardStats, MetricsResponse } from "../api"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader } from "./ui/card"

const categoryColors = [
  "rgba(55, 214, 232, 0.32)",
  "rgba(55, 214, 232, 0.46)",
  "rgba(55, 214, 232, 0.60)",
  "rgba(55, 214, 232, 0.78)",
  "#37d6e8",
]

function formatCount(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(value)
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`
}

function DashboardLoading() {
  return (
    <div aria-label="Loading dashboard" className="space-y-6" role="status">
      <span className="sr-only">Loading replay data</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-32 animate-pulse rounded-lg border border-line bg-panel" key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="h-80 animate-pulse rounded-lg border border-line bg-panel" />
        <div className="h-80 animate-pulse rounded-lg border border-line bg-panel" />
      </div>
    </div>
  )
}

function EmptyChart({ children }: { children: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-line px-6 text-center text-sm text-muted">
      {children}
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-cyan/20 bg-cyan/[0.08] text-cyan">
        <AlertTriangle aria-hidden="true" size={20} />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-100">Dashboard data unavailable</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">{error}</p>
      <Button className="mt-5" onClick={onRetry}>
        <RefreshCw aria-hidden="true" size={14} />
        Retry connection
      </Button>
    </Card>
  )
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([getStats(), getAlerts(8), getMetrics()])
      .then(([nextStats, nextAlerts, nextMetrics]) => {
        if (!active) return
        setStats(nextStats)
        setAlerts(nextAlerts)
        setMetrics(nextMetrics)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : "The API request failed.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadToken])

  if (loading) return <DashboardLoading />
  if (error) {
    return <ErrorState error={error} onRetry={() => setReloadToken((token) => token + 1)} />
  }
  if (!stats || !alerts || !metrics) return null

  const replayAvailable = stats.status === "available" && alerts.status === "available"
  const benchmark = metrics.models.find((model) => model.model === "XGBoost")
  const kpis = [
    {
      label: "Flows analyzed",
      value: replayAvailable ? formatCount(stats.total_flows) : "—",
      detail: replayAvailable ? "Rows in the replay set" : "Replay dataset unavailable",
      icon: Database,
    },
    {
      label: "Attacks detected",
      value: replayAvailable ? formatCount(stats.attacks_detected) : "—",
      detail: "Predicted by the saved model",
      icon: ShieldEllipsis,
      tone: "text-red-400",
    },
    {
      label: "Detection rate",
      value: replayAvailable ? formatPercent(stats.detection_rate) : "—",
      detail: "Recall against replay labels",
      icon: ShieldCheck,
    },
    {
      label: "False-positive rate",
      value: replayAvailable ? formatPercent(stats.false_positive_rate) : "—",
      detail: "Normal rows flagged as attacks",
      icon: Activity,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.17em] text-muted">
              Security overview
            </p>
            <span className="size-1 rounded-full bg-slate-600" />
            <p className="font-mono text-[11px] text-slate-500">NSL-KDD · binary classifier</p>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 sm:text-[28px]">
            Detection dashboard
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Network flow classification from the saved XGBoost pipeline.
          </p>
        </div>
        <Button
          aria-label="Refresh dashboard data"
          onClick={() => setReloadToken((token) => token + 1)}
        >
          <RefreshCw aria-hidden="true" size={14} />
          Refresh replay
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-cyan/15 bg-cyan/[0.035] px-3.5 py-2.5">
        <Badge tone={replayAvailable ? "cyan" : "neutral"}>
          <span className={`size-1.5 rounded-full ${replayAvailable ? "bg-cyan" : "bg-slate-500"}`} />
          {replayAvailable ? "Replay of NSL-KDD test set" : "Replay unavailable"}
        </Badge>
        {replayAvailable && stats.dataset_file && (
          <span className="font-mono text-[11px] text-slate-500">{stats.dataset_file}</span>
        )}
        {!replayAvailable && (
          <span className="text-xs text-muted">
            Place KDDTest.parquet or KDDTest+.txt in the ignored data/ folder to enable replay.
          </span>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-slate-600">
          Ordered dataset replay · not live network telemetry
        </span>
      </div>

      <section aria-label="Replay metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, detail, icon: Icon, tone }) => (
          <Card className="min-w-0" key={label}>
            <CardHeader className="pb-3">
              <div>
                <p className="text-xs font-medium text-muted">{label}</p>
                <p className="mt-3 font-mono text-[27px] font-medium leading-none tracking-tight text-slate-100">
                  {value}
                </p>
              </div>
              <span className={`rounded-md border border-line bg-white/[0.02] p-2 ${tone ?? "text-slate-400"}`}>
                <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
              </span>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-[11px] text-slate-500">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-label="Replay charts" className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Traffic across replay batches</h2>
              <p className="mt-1 text-xs text-muted">
                Test-set row order grouped into batches · not a time series
              </p>
            </div>
            {replayAvailable && <Badge tone="cyan">Replay data</Badge>}
          </CardHeader>
          <CardContent>
            {stats.traffic.length ? (
              <div aria-label="Flow and predicted attack count by replay batch" className="h-64 w-full" role="img">
                <ResponsiveContainer height="100%" width="100%">
                  <AreaChart data={stats.traffic} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="flowFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#37d6e8" stopOpacity={0.17} />
                        <stop offset="95%" stopColor="#37d6e8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1d2732" strokeDasharray="3 5" vertical={false} />
                    <XAxis
                      axisLine={false}
                      dataKey="bucket"
                      tick={{ fill: "#647384", fontSize: 10 }}
                      tickLine={false}
                      tickFormatter={(value: number) => `B${value}`}
                      tickMargin={10}
                    />
                    <YAxis
                      axisLine={false}
                      tick={{ fill: "#647384", fontSize: 10 }}
                      tickLine={false}
                      tickMargin={8}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0d1219",
                        border: "1px solid #263341",
                        borderRadius: 6,
                        color: "#e2e8f0",
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        value.toLocaleString(),
                        name === "flows" ? "Flows" : "Predicted attacks",
                      ]}
                      labelFormatter={(value: number) => `Replay batch ${value}`}
                    />
                    <Area
                      dataKey="flows"
                      fill="url(#flowFill)"
                      name="flows"
                      stroke="#37d6e8"
                      strokeWidth={1.8}
                      type="monotone"
                    />
                    <Area
                      dataKey="attacks"
                      fill="transparent"
                      name="attacks"
                      stroke="#37d6e8"
                      strokeDasharray="4 4"
                      strokeOpacity={0.55}
                      strokeWidth={1.2}
                      type="monotone"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart>No replay rows available to chart.</EmptyChart>
            )}
            <div className="mt-2 flex items-center gap-4 border-t border-line pt-3 text-[10px] text-muted">
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-3 bg-cyan" />
                Flows
              </span>
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-3 border-t border-dashed border-cyan/60" />
                Predicted attacks
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Attack category breakdown</h2>
              <p className="mt-1 text-xs text-muted">Dataset labels grouped by NSL-KDD family</p>
            </div>
            {replayAvailable && <Badge tone="cyan">Replay data</Badge>}
          </CardHeader>
          <CardContent>
            {stats.categories.some((category) => category.value > 0) ? (
              <>
                <div aria-label="NSL-KDD category distribution" className="h-64 w-full" role="img">
                  <ResponsiveContainer height="100%" width="100%">
                    <PieChart>
                      <Pie
                        data={stats.categories}
                        dataKey="value"
                        innerRadius={66}
                        nameKey="name"
                        outerRadius={94}
                        paddingAngle={2}
                        stroke="#0d1219"
                        strokeWidth={3}
                      >
                        {stats.categories.map((category, index) => (
                          <Cell fill={categoryColors[index % categoryColors.length]} key={category.name} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "#0d1219",
                          border: "1px solid #263341",
                          borderRadius: 6,
                          color: "#e2e8f0",
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [value.toLocaleString(), "Flows"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul aria-label="Category counts" className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
                  {stats.categories.map((category, index) => (
                    <li className="flex min-w-0 items-center justify-between gap-2 text-[11px]" key={category.name}>
                      <span className="flex min-w-0 items-center gap-2 text-slate-400">
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: categoryColors[index % categoryColors.length] }}
                        />
                        <span className="truncate">{category.name}</span>
                      </span>
                      <span className="font-mono text-slate-300">{formatCount(category.value)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyChart>No labeled replay rows available for category counts.</EmptyChart>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Alert feed and benchmark" className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Alert feed</h2>
              <p className="mt-1 text-xs text-muted">Highest-confidence predicted attacks in this replay</p>
            </div>
            <Badge tone="red">
              <span className="size-1.5 rounded-full bg-red-400" />
              {alerts.alerts.length} shown
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            {alerts.alerts.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-y border-line text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      <th className="py-2.5 pr-3 font-medium">Replay row</th>
                      <th className="py-2.5 pr-3 font-medium">Protocol / service</th>
                      <th className="py-2.5 pr-3 text-right font-medium">Bytes in / out</th>
                      <th className="py-2.5 text-right font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.alerts.map((alert) => {
                      const highConfidence = alert.attack_probability >= 0.9
                      return (
                        <tr className="border-b border-line/70 last:border-0" key={alert.row}>
                          <td className="py-3 pr-3 font-mono text-slate-400">
                            <span
                              className={`mr-2 inline-block size-1.5 rounded-full ${
                                highConfidence ? "bg-red-400" : "bg-amber-400"
                              }`}
                            />
                            #{alert.row.toString().padStart(5, "0")}
                          </td>
                          <td className="py-3 pr-3">
                            <span className="font-mono uppercase text-slate-300">{alert.protocol}</span>
                            <span className="ml-2 text-slate-500">{alert.service}</span>
                          </td>
                          <td className="py-3 pr-3 text-right font-mono text-slate-400">
                            {formatCount(alert.src_bytes)} / {formatCount(alert.dst_bytes)}
                          </td>
                          <td className="py-3 text-right">
                            <span className={`font-mono ${highConfidence ? "text-red-400" : "text-amber-400"}`}>
                              {formatPercent(alert.attack_probability)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-line px-4 text-center text-sm text-muted">
                {alerts.status === "available"
                  ? "No attack predictions in this replay."
                  : "No alerts until an NSL-KDD test set is available."}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Published XGBoost benchmark</h2>
              <p className="mt-1 text-xs text-muted">Test results at the documented 0.5 cutoff</p>
            </div>
            <Badge tone="neutral">README</Badge>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {benchmark ? (
              <>
                <div className="flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className="text-muted">Accuracy</span>
                  <span className="font-mono text-slate-200">{formatPercent(benchmark.accuracy)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className="text-muted">Attack precision</span>
                  <span className="font-mono text-slate-200">{formatPercent(benchmark.attack_precision)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3 text-xs">
                  <span className="text-muted">Attack recall</span>
                  <span className="font-mono text-slate-200">{formatPercent(benchmark.attack_recall)}</span>
                </div>
                <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-slate-500">
                  Published README result · separate from the current replay calculation.
                </p>
              </>
            ) : (
              <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-line px-4 text-center text-sm text-muted">
                No documented XGBoost benchmark found.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <footer className="flex flex-col gap-2 border-t border-line pt-4 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>Spiral · NSL-KDD intrusion detection demo</span>
        <span className="flex items-center gap-1.5 font-mono">
          {replayAvailable ? "Replay data loaded" : "Replay dataset unavailable"}
          <ArrowUpRight aria-hidden="true" size={11} />
        </span>
      </footer>
    </div>
  )
}
