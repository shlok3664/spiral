import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight, Pause, Play, X } from "lucide-react"
import { getAlerts, getStats } from "../api"
import type {
  Alert,
  AlertsResponse,
  CategoryDetection,
  ClassMetric,
  ConfusionMatrix,
  DashboardStats,
} from "../api"

import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

function formatCount(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(value)
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`
}

function formatConfidence(value: number | null) {
  if (value === null) return "—"
  return value >= 0.9995 ? "99.9%+" : formatPercent(value)
}

function useCountUp(target: number | null, enabled: boolean, precision = 0) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (target === null || !enabled) {
      setValue(0)
      return
    }

    if (
      document.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target)
      return
    }

    let frame = 0
    let startedAt = 0
    const duration = 620
    const factor = 10 ** precision
    const animate = (time: number) => {
      if (!startedAt) startedAt = time
      const progress = Math.min(1, (time - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased * factor) / factor)
      if (progress < 1) frame = window.requestAnimationFrame(animate)
    }

    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [enabled, precision, target])

  return value
}

function DashboardSkeleton() {
  return (
    <div aria-label="Loading replay data" className="space-y-5" role="status">
      <span className="sr-only">Loading replay data</span>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
        <div className="h-52 animate-pulse border-[1.5px] border-ink bg-forest" />
        <div className="h-52 animate-pulse border-[1.5px] border-ink bg-lime" />
        <div className="h-52 animate-pulse border-[1.5px] border-ink bg-ink" />
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="h-56 animate-pulse border-[1.5px] border-ink bg-sand lg:col-span-7" />
        <div className="h-56 animate-pulse border-[1.5px] border-ink bg-cream lg:col-span-5" />
      </div>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section aria-labelledby="dashboard-error" className="border-[1.5px] border-ink bg-cream p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
        <div>
          <h2 className="font-serif text-2xl text-ink" id="dashboard-error">
            Dashboard data could not be loaded
          </h2>
          <p className="mt-1 text-[13px] text-ink opacity-70">{error}</p>
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
    <header className="sticky top-11 z-30 border-b-[1.5px] border-ink bg-cream">
      <div className="mx-auto flex min-h-11 max-w-[1480px] items-center gap-2 px-4 sm:px-6 lg:px-8">
        <span className="min-w-0 flex-1 truncate text-[13px]">
          Replay of NSL-KDD test set
        </span>
        <span aria-hidden="true" className="hidden text-ink opacity-60 md:inline">·</span>
        <span className="shrink-0 text-[13px] tabular-nums">
          {loading ? "Loading" : available ? `${formatCount(count)} flows` : "Unavailable"}
        </span>
        {available && (
          <Button
            aria-label={paused ? "Resume dashboard refresh" : "Pause dashboard refresh"}
            aria-pressed={paused}
            className="ml-auto min-h-8 shrink-0 border-ink bg-sand px-2.5 py-1 text-[13px] md:ml-4"
            onClick={onTogglePause}
          >
            {paused ? <Play aria-hidden="true" size={14} /> : <Pause aria-hidden="true" size={14} />}
            <span>{paused ? "Resume" : "Pause"}</span>
          </Button>
        )}
      </div>
      <div
        aria-hidden="true"
        className={`replay-scan h-1 border-t-[1.5px] border-ink ${paused || !available ? "is-paused" : ""}`}
      />
    </header>
  )
}

function ReplayMetrics({
  available,
  animatedAttacks,
  animatedDetectionRate,
  animatedFalsePositiveRate,
}: {
  available: boolean
  animatedAttacks: number
  animatedDetectionRate: number
  animatedFalsePositiveRate: number
}) {
  return (
    <section aria-label="Replay metrics" className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
      <div className="flex min-h-48 flex-col justify-between border-[1.5px] border-ink bg-forest-block p-5 text-cream md:min-h-56 md:p-6">
        <p className="text-[13px]">Attacks flagged</p>
        <div aria-live="polite">
          <p className="font-serif text-[72px] leading-[0.88] tabular-nums md:text-[120px]">
            {available ? formatCount(animatedAttacks) : "—"}
          </p>
          <p className="mt-3 text-[14px]">attacks flagged in the replay</p>
        </div>
      </div>

      <div className="flex min-h-36 flex-col justify-between border-[1.5px] border-ink bg-lime-block p-5 text-ink md:min-h-56 md:p-6">
        <p className="text-[13px]">Detection rate</p>
        <div>
          <p className="font-serif text-5xl leading-none tabular-nums md:text-6xl">
            {available ? `${animatedDetectionRate.toFixed(1)}%` : "—"}
          </p>
          <p className="mt-3 text-[14px]">recall against replay labels</p>
        </div>
      </div>

      <div className="flex min-h-36 flex-col justify-between border-[1.5px] border-ink bg-ink p-5 text-cream md:min-h-56 md:p-6">
        <p className="text-[13px]">False-positive rate</p>
        <div>
          <p className="font-serif text-5xl leading-none tabular-nums md:text-6xl">
            {available ? `${animatedFalsePositiveRate.toFixed(1)}%` : "—"}
          </p>
          <p className="mt-3 text-[14px]">normal rows flagged</p>
        </div>
      </div>
    </section>
  )
}

function Confidence({ alert }: { alert: Alert }) {
  const value = Math.max(0, Math.min(1, alert.confidence))
  const lowConfidence = value < 0.7

  return (
    <span className="flex items-center justify-end gap-2">
      <span className={`font-mono text-[13px] tabular-nums ${lowConfidence ? "bg-lime px-1" : ""}`}>
        {formatConfidence(value)}
      </span>
      <span
        aria-label={`Confidence ${formatConfidence(value)}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(value * 100)}
        className="h-1 w-12 bg-stone"
        role="progressbar"
      >
        <span className="block h-full bg-crimson" style={{ width: `${value * 100}%` }} />
      </span>
    </span>
  )
}

function AlertRow({
  alert,
  onSelect,
  compact = false,
  index,
}: {
  alert: Alert
  onSelect: (alert: Alert) => void
  compact?: boolean
  index: number
}) {
  return (
    <button
      aria-label={`Open replay row ${alert.row}, ${alert.category}${alert.category === "Normal" ? ", false positive" : ""}, ${alert.protocol} ${alert.service}, confidence ${formatConfidence(alert.confidence)}`}
      className={`alert-enter relative grid w-full items-center gap-2 border-b-[1.5px] border-ink px-3 text-left text-ink transition-transform duration-500 ease-out hover:translate-x-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest ${
        compact
          ? "grid-cols-[1fr_auto] py-3.5"
          : "grid-cols-[68px_minmax(138px,1.15fr)_minmax(0,1.6fr)_112px_18px] py-3"
      }`}
      onClick={() => onSelect(alert)}
      style={{ animationDelay: `${index * 40}ms` }}
      type="button"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-crimson" />
      <span className="font-mono text-[13px] tabular-nums">
        #{alert.row.toString().padStart(5, "0")}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5 md:justify-start">
        <span className="truncate text-[13px]">{alert.category}</span>
        {alert.category === "Normal" && (
          <span className="shrink-0 border border-crimson bg-crimson px-1 py-0.5 text-[10px] leading-none text-cream">
            False positive
          </span>
        )}
      </span>
      <span className={compact ? "col-span-2 flex min-w-0 items-center justify-between gap-3" : "min-w-0"}>
        {compact ? (
          <>
            <span className="truncate text-[13px]">
              <span className="font-mono">{alert.protocol}</span>
              <span className="mx-1.5 opacity-60">/</span>
              {alert.service}
            </span>
            <Confidence alert={alert} />
          </>
        ) : (
          <span className="truncate text-[13px]">
            <span className="font-mono">{alert.protocol}</span>
            <span className="mx-1.5 opacity-60">/</span>
            {alert.service}
          </span>
        )}
      </span>
      {!compact && <Confidence alert={alert} />}
      {!compact && <ChevronRight aria-hidden="true" className="justify-self-end" size={14} />}
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
    <section
      aria-labelledby="alerts-heading"
      className="min-w-0 self-start border-[1.5px] border-ink bg-sand lg:col-span-7"
    >
      <div className="flex items-baseline justify-between gap-3 border-b-[1.5px] border-ink px-4 py-3">
        <h2 className="font-serif text-[26px] leading-tight" id="alerts-heading">
          Alerts needing review
        </h2>
        <span className="shrink-0 text-[13px] tabular-nums">
          {response.status === "available" ? `${response.alerts.length} shown` : "Unavailable"}
        </span>
      </div>

      {response.alerts.length ? (
        <>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[68px_minmax(138px,1.15fr)_minmax(0,1.6fr)_112px_18px] border-b-[1.5px] border-ink px-3 py-2 text-[13px] md:grid"
          >
            <span>Row ID</span>
            <span>Category</span>
            <span>Protocol / service</span>
            <span className="text-right">Confidence</span>
            <span />
          </div>
          <ul aria-label="Predicted attack alerts" className="hidden md:block">
            {response.alerts.map((alert, index) => (
              <li key={alert.row}>
                <AlertRow alert={alert} index={index} onSelect={onSelect} />
              </li>
            ))}
          </ul>
          <ul aria-label="Predicted attack alerts" className="md:hidden">
            {response.alerts.map((alert, index) => (
              <li key={alert.row}>
                <AlertRow alert={alert} compact index={index} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="px-4 py-8 text-[13px]">
          {response.status === "available"
            ? "No attack predictions in this replay."
            : "No alerts until an NSL-KDD test set is available."}
        </div>
      )}
    </section>
  )
}

function DetectionByCategory({
  categories,
  normalCount,
}: {
  categories: CategoryDetection[]
  normalCount: number
}) {
  const [barsReady, setBarsReady] = useState(false)
  const largest = Math.max(1, ...categories.map((category) => category.total))

  useEffect(() => {
    if (
      document.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setBarsReady(true)
      return
    }

    const frame = window.requestAnimationFrame(() => setBarsReady(true))
    return () => window.cancelAnimationFrame(frame)
  }, [categories])

  return (
    <section className="self-start border-[1.5px] border-ink bg-cream p-4 sm:p-5 lg:col-span-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[26px] leading-tight">Detection by category</h2>
        <span className="text-[13px]">Caught / missed</span>
      </div>

      {categories.length ? (
        <ul className="mt-4 space-y-4">
          {categories.map((category) => {
            const caught = (category.caught / largest) * 100
            const missed = (category.missed / largest) * 100
            return (
              <li key={category.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px]">{category.name}</span>
                  <span className="font-mono text-[13px] tabular-nums">
                    {formatCount(category.total)}
                  </span>
                </div>
                <div
                  aria-label={`${category.name}: ${category.caught} caught, ${category.missed} missed`}
                  className="mt-1.5 flex h-3 w-full bg-stone"
                  role="img"
                >
                  <span
                    className="bar-grow h-full bg-forest"
                    style={{ width: `${barsReady ? caught : 0}%` }}
                  />
                  <span
                    className="bar-grow h-full bg-stone"
                    style={{ width: `${barsReady ? missed : 0}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[13px]">
                  <span>Caught {formatCount(category.caught)}</span>
                  <span>Missed {formatCount(category.missed)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 border-t-[1.5px] border-ink pt-4 text-[13px]">
          Category results are unavailable for this replay.
        </p>
      )}
      {categories.length > 0 && (
        <p className="mt-4 border-t-[1.5px] border-ink pt-3 text-[13px]">
          Normal replay rows <span className="float-right font-mono tabular-nums">{formatCount(normalCount)}</span>
        </p>
      )}
      <div className="mt-4 flex gap-4 border-t-[1.5px] border-ink pt-3 text-[13px]">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 bg-forest" />
          Caught
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 bg-stone" />
          Missed
        </span>
      </div>
    </section>
  )
}

function ConfusionMatrixPanel({ matrix }: { matrix: ConfusionMatrix | null }) {
  return (
    <section className="self-start border-[1.5px] border-ink bg-cream p-4 sm:p-5 lg:col-span-4">
      <h2 className="font-serif text-[26px] leading-tight">Confusion matrix</h2>
      <p className="mt-1 text-[13px]">Replay labels vs model predictions</p>
      {matrix ? (
        <table
          aria-label="Confusion matrix with actual labels in rows and predictions in columns"
          className="mt-4 w-full table-fixed border-collapse text-center text-[13px]"
        >
          <thead>
            <tr>
              <th className="w-[30%] border-b-[1.5px] border-ink p-2 text-left font-normal">
                Actual
              </th>
              <th className="border-b-[1.5px] border-ink p-2 font-normal" colSpan={2}>
                Predicted
              </th>
            </tr>
            <tr>
              <th />
              {matrix.labels.map((label) => (
                <th className="p-2 font-normal" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.values.map((row, rowIndex) => (
              <tr key={matrix.labels[rowIndex]}>
                <th className="border-[1.5px] border-ink p-2 text-left font-normal">
                  {matrix.labels[rowIndex]}
                </th>
                {row.map((count, columnIndex) => {
                  const correct = rowIndex === columnIndex
                  return (
                    <td
                      className={`border-[1.5px] border-ink p-3 font-mono text-lg tabular-nums ${
                        correct ? "bg-forest text-cream" : "bg-crimson text-cream"
                      }`}
                      key={matrix.labels[columnIndex]}
                    >
                      {formatCount(count)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-4 border-t-[1.5px] border-ink pt-4 text-[13px]">
          Confusion matrix is unavailable for this replay.
        </p>
      )}
      <div className="mt-3 flex gap-4 border-t-[1.5px] border-ink pt-3 text-[13px]">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 bg-forest" />
          Correct
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-2.5 bg-crimson" />
          Error
        </span>
      </div>
    </section>
  )
}

function ClassMetricsTable({ metrics }: { metrics: ClassMetric[] }) {
  return (
    <section className="self-start border-[1.5px] border-ink bg-sand p-4 sm:p-5 lg:col-span-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[26px] leading-tight">Per-class scores</h2>
        <span className="text-[13px]">NSL-KDD replay</span>
      </div>
      {metrics.length ? (
        <table className="mt-4 w-full table-fixed border-collapse text-[13px]">
          <caption className="sr-only">
            Precision, recall, and F1 score for binary model classes on the replay
          </caption>
          <thead>
            <tr className="border-b-[1.5px] border-ink text-left">
              <th className="w-[34%] py-2 pr-2 font-normal">Class</th>
              <th className="py-2 px-1 text-right font-normal">Precision</th>
              <th className="py-2 px-1 text-right font-normal">Recall</th>
              <th className="py-2 pl-1 text-right font-normal">F1</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr className="border-b border-ink" key={metric.name}>
                <th className="py-3 pr-2 text-left font-normal">{metric.name}</th>
                <td className="py-3 px-1 text-right font-mono tabular-nums">
                  {formatPercent(metric.precision)}
                </td>
                <td className="py-3 px-1 text-right font-mono tabular-nums">
                  {formatPercent(metric.recall)}
                </td>
                <td className="py-3 pl-1 text-right font-mono tabular-nums">
                  {formatPercent(metric.f1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-4 border-t-[1.5px] border-ink pt-4 text-[13px]">
          Per-class scores are unavailable for this replay.
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
      className="alert-drawer fixed inset-y-0 right-0 m-0 ml-auto h-full max-h-none w-full max-w-[440px] border-[1.5px] border-ink bg-sand p-0 text-ink"
      onClose={onClose}
      ref={dialogRef}
    >
      {alert && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b-[1.5px] border-ink p-5">
            <div>
              <p className="text-[13px]">Replay row</p>
              <h2 className="mt-1 font-mono text-lg tabular-nums" id="alert-drawer-title">
                #{alert.row.toString().padStart(5, "0")}
              </h2>
            </div>
            <button
              aria-label="Close alert details"
              className="p-2 transition-colors duration-150 hover:bg-lime"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>

          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px]">Prediction</span>
              <Badge className="border-l-[3px] border-l-crimson px-2" tone="attack">
                Attack
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-4 border-t-[1.5px] border-ink pt-4">
              <span className="text-[13px]">Replay category</span>
              <span className="text-[13px]">{alert.category}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t-[1.5px] border-ink pt-4">
              <span className="text-[13px]">Model confidence</span>
              <Confidence alert={alert} />
            </div>

            <section aria-labelledby="flow-details-heading" className="border-t-[1.5px] border-ink pt-5">
              <h3 className="font-serif text-2xl" id="flow-details-heading">
                Flow details
              </h3>
              <dl className="mt-3 divide-y divide-ink">
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px]">Protocol</dt>
                  <dd className="font-mono text-[13px]">{alert.protocol}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px]">Service</dt>
                  <dd className="text-[13px]">{alert.service}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px]">Source bytes</dt>
                  <dd className="font-mono text-[13px] tabular-nums">{formatCount(alert.src_bytes)}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px]">Destination bytes</dt>
                  <dd className="font-mono text-[13px] tabular-nums">{formatCount(alert.dst_bytes)}</dd>
                </div>
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-[13px]">Dataset label</dt>
                  <dd className="text-[13px]">{alert.true_label}</dd>
                </div>
              </dl>
            </section>

            <p className="border-t-[1.5px] border-ink pt-4 text-[13px] leading-5">
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
  const animatedAttacks = useCountUp(stats?.attacks_detected ?? null, stats?.status === "available")
  const animatedDetectionRate = useCountUp(
    stats?.detection_rate === null || stats?.detection_rate === undefined
      ? null
      : stats.detection_rate * 100,
    stats?.status === "available",
    1,
  )
  const animatedFalsePositiveRate = useCountUp(
    stats?.false_positive_rate === null || stats?.false_positive_rate === undefined
      ? null
      : stats.false_positive_rate * 100,
    stats?.status === "available",
    1,
  )

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
  const normalCount = stats?.categories.find((category) => category.name === "Normal")?.value ?? 0

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <ReplayStrip
        available={Boolean(replayAvailable && !error)}
        count={stats?.total_flows ?? null}
        loading={loading}
        onTogglePause={() => setPaused((value) => !value)}
        paused={paused}
      />
      <main className="mx-auto max-w-[1480px] px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="font-serif text-3xl leading-tight">Overview</h1>
          <label className="flex items-center gap-2 text-[13px]">
            Range
            <span className="relative">
              <select
                aria-label="Replay range"
                className="min-h-9 appearance-none border-[1.5px] border-ink bg-cream py-1 pl-3 pr-8 text-[13px] focus:outline-none"
                defaultValue="full"
              >
                <option value="full">Full replay</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                size={14}
              />
            </span>
          </label>
        </div>

        {error && stats && (
          <div className="mb-4 flex items-center justify-between gap-4 border-[1.5px] border-ink bg-cream px-3 py-2.5 text-[13px]">
            <span>Refresh failed: {error}</span>
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
            <ReplayMetrics
              animatedAttacks={animatedAttacks}
              animatedDetectionRate={animatedDetectionRate}
              animatedFalsePositiveRate={animatedFalsePositiveRate}
              available={Boolean(replayAvailable)}
            />
            {!replayAvailable && (
              <p className="mt-3 text-[13px]">
                Replay data is unavailable. Add the NSL-KDD test file under data/ to populate
                dashboard metrics and charts.
              </p>
            )}

            <div className="mt-5 grid min-w-0 items-start gap-5 lg:grid-cols-12">
              <AlertsPanel onSelect={setSelectedAlert} response={alerts} />
              <DetectionByCategory
                categories={stats.detection_by_category}
                normalCount={normalCount}
              />
              <ConfusionMatrixPanel matrix={stats.confusion_matrix} />
              <ClassMetricsTable metrics={stats.class_metrics} />
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
