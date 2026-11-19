import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  RefreshCw,
  Upload,
  X,
} from "lucide-react"

import {
  ApiClientError,
  downloadBatchCsv,
  getDefaults,
  getHealth,
  getSamples,
  getSample,
  predictSingle,
  uploadBatch,
} from "../api/client"
import type {
  ApiHealth,
  BatchResponse,
  BatchResult,
  FeatureImportance,
  FlowDefaults,
  PredictResponse,
  SampleFile,
} from "../api/client"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

const MAX_FILE_BYTES = 10 * 1024 * 1024
const PAGE_SIZE = 50
const CATEGORICAL_FIELDS = ["protocol_type", "service", "flag"] as const
const NUMERIC_FIELDS = [
  "src_bytes",
  "dst_bytes",
  "count",
  "srv_count",
  "serror_rate",
  "same_srv_rate",
] as const

type UploadStatus = "idle" | "uploading" | "scoring" | "success" | "error"
type ResultFilter = "all" | "attacks" | "normal" | "false_positives"
type SortKey =
  | "row"
  | "prediction"
  | "category"
  | "protocol"
  | "service"
  | "src_bytes"
  | "dst_bytes"
  | "confidence"

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function useCountUp(target: number, precision = 0) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (
      document.hidden ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target)
      return
    }

    let frame = 0
    let startedAt = 0
    const duration = 700
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
  }, [precision, target])

  return value
}

function friendlyError(error: unknown) {
  if (!(error instanceof ApiClientError)) {
    return "The file could not be analyzed. Check it and try again."
  }
  switch (error.code) {
    case "unsupported_media_type":
      return "Choose a .csv, .txt, or .tsv file."
    case "file_too_large":
      return "This file is larger than the 10 MB limit."
    case "too_many_rows":
      return "This file has more than 50,000 rows. Split it into smaller files."
    case "invalid_columns":
      return error.message.startsWith("Expected 41, 42 or 43 columns")
        ? error.message
        : "The file columns are not a supported NSL-KDD format."
    case "missing_columns":
      return error.message
    case "non_numeric":
      return error.message
    case "empty_category":
      return error.message
    case "empty_file":
      return "The selected file is empty."
    case "invalid_file":
      return "The file is not a readable UTF-8 CSV, TXT, or TSV."
    case "invalid_label":
      return error.message
    case "network_error":
      return "The API server could not be reached. Check the server and retry."
    case "timeout":
      return "The request timed out. Retry the analysis."
    case "cancelled":
      return "The request was cancelled."
    default:
      return error.message || "The file could not be analyzed. Try again."
  }
}

function UploadProgress({
  status,
  percent,
}: {
  status: UploadStatus
  percent: number
}) {
  if (status !== "uploading" && status !== "scoring") return null
  return (
    <div aria-live="polite" className="mt-4" role="status">
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span>{status === "uploading" ? "Uploading file" : "Scoring flows"}</span>
        {status === "uploading" && <span className="font-mono tabular-nums">{percent}%</span>}
      </div>
      <div
        aria-label={status === "uploading" ? `Upload progress ${percent}%` : "Scoring flows"}
        aria-valuemax={status === "uploading" ? 100 : undefined}
        aria-valuemin={status === "uploading" ? 0 : undefined}
        aria-valuenow={status === "uploading" ? percent : undefined}
        className="h-2 w-full overflow-hidden bg-stone"
        role="progressbar"
      >
        {status === "uploading" ? (
          <span className="block h-full bg-primary transition-[width] duration-150" style={{ width: `${percent}%` }} />
        ) : (
          <span className="block h-full w-1/3 animate-pulse bg-primary" />
        )}
      </div>
    </div>
  )
}

function UploadPanel({
  file,
  status,
  percent,
  samples,
  error,
  onFile,
  onSample,
  onCancel,
  onRetry,
  onReset,
}: {
  file: File | null
  status: UploadStatus
  percent: number
  samples: SampleFile[]
  error: string | null
  onFile: (file: File) => void
  onSample: (sample: SampleFile) => void
  onCancel: () => void
  onRetry: () => void
  onReset: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = status === "uploading" || status === "scoring"

  const chooseFile = (file: File | undefined) => {
    if (file) onFile(file)
  }

  return (
    <section aria-labelledby="upload-heading" className="border-[1.5px] border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[22px]" id="upload-heading">Upload network flows</h2>
          <p className="mt-1 text-[13px] text-muted">
            Score a labeled or unlabeled NSL-KDD flow file with the deployed model.
          </p>
        </div>
        {status === "success" && (
          <Button onClick={onReset}>
            <RefreshCw aria-hidden="true" size={15} />
            Analyze another file
          </Button>
        )}
      </div>

      <div
        aria-label="Drop a CSV, TXT, or TSV file here, or choose a file"
        className="mt-4 border border-dashed border-border bg-bg p-5 sm:p-7"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          chooseFile(event.dataTransfer.files[0])
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return
          inputRef.current?.click()
        }}
        role="button"
        tabIndex={0}
      >
        <input
          accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values"
          aria-label="Choose a network flow file"
          className="sr-only"
          onChange={(event) => {
            chooseFile(event.target.files?.[0])
            event.currentTarget.value = ""
          }}
          ref={inputRef}
          type="file"
        />
        <div className="flex flex-col items-center text-center">
          <Upload aria-hidden="true" className="text-muted" size={24} strokeWidth={1.6} />
          <p className="mt-2 text-sm">Drop a file here or choose one</p>
          <p className="mt-1 text-[13px] text-muted">CSV, TXT, or TSV · up to 10 MB · 50,000 rows</p>
          <Button className="mt-3" onClick={() => inputRef.current?.click()}>
            <FileText aria-hidden="true" size={15} />
            Choose file
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <div className="flex min-w-0 items-center gap-2">
          {file ? (
            <>
              <FileText aria-hidden="true" className="shrink-0 text-muted" size={15} />
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 font-mono text-muted">{formatSize(file.size)}</span>
            </>
          ) : (
            <span className="text-muted">Maximum file size 10 MB; maximum 50,000 flows.</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy && <Button className="px-2 py-1" onClick={onCancel}>Cancel</Button>}
          {status === "error" && (
            <Button className="px-2 py-1" onClick={onRetry}>Retry</Button>
          )}
          {samples.length > 0 && !busy && (
            <Button className="px-2 py-1" onClick={() => onSample(samples[0])}>
              Try a sample file
            </Button>
          )}
        </div>
      </div>

      <UploadProgress percent={percent} status={status} />

      {error && (
        <div className="mt-4 border-[1.5px] border-threat bg-surface p-3" role="alert">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-[13px]">
              <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-threat" size={16} />
              <span>{error}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function SummaryStrip({ response }: { response: BatchResponse }) {
  const scored = useCountUp(response.rows_scored)
  const attacks = useCountUp(response.summary.attacks_flagged)
  const normal = useCountUp(response.summary.normal)
  const flagRate = useCountUp(response.summary.flag_rate * 100, 1)
  const confidence = useCountUp(response.summary.mean_confidence * 100, 1)
  const items = [
    { label: "Rows scored", value: formatCount(scored) },
    { label: "Attacks flagged", value: formatCount(attacks), threat: true },
    { label: "Normal", value: formatCount(normal) },
    { label: "Flag rate", value: `${flagRate.toFixed(1)}%` },
    { label: "Mean confidence", value: `${confidence.toFixed(1)}%` },
  ]

  return (
    <section aria-label="Analysis summary" className="grid grid-cols-2 border-y border-border sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item, index) => (
        <div
          className={`px-3 py-3 sm:px-4 ${index > 0 ? "border-l border-border" : ""} ${index >= 2 ? "border-t border-border sm:border-t-0" : ""}`}
          key={item.label}
        >
          <p className="text-[13px] text-muted">{item.label}</p>
          <p className={`mt-1 font-mono text-xl font-semibold tabular-nums ${item.threat ? "text-threat" : ""}`}>
            {item.value}
          </p>
        </div>
      ))}
    </section>
  )
}

function MetricsPanel({ response }: { response: BatchResponse }) {
  const metrics = response.metrics
  if (!metrics) {
    return (
      <section className="border-[1.5px] border-border bg-surface p-4" role="note">
        <h3 className="text-lg">Evaluation</h3>
        <p className="mt-1 text-[13px] text-muted">
          No labels in this file, so accuracy can&apos;t be computed.
        </p>
      </section>
    )
  }

  const metricItems = [
    ["Accuracy", metrics.accuracy],
    ["Precision", metrics.precision],
    ["Recall", metrics.recall],
    ["F1", metrics.f1],
  ] as const
  return (
    <section className="border-[1.5px] border-border bg-surface p-4">
      <h3 className="text-lg">Evaluation</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metricItems.map(([label, value]) => (
          <div className="border-t border-border pt-2" key={label}>
            <p className="text-[13px] text-muted">{label}</p>
            <p className="mt-1 font-mono text-lg tabular-nums">{formatPercent(value)}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[260px] table-fixed border-collapse text-center text-[13px]">
          <caption className="mb-2 text-left text-[13px] text-muted">Confusion matrix · actual rows, predicted columns</caption>
          <thead>
            <tr>
              <th className="border-b border-border p-2 text-left font-normal">Actual</th>
              <th className="border-b border-border p-2 font-normal" colSpan={2}>Predicted</th>
            </tr>
            <tr>
              <th />
              <th className="p-2 font-normal">Normal</th>
              <th className="p-2 font-normal">Attack</th>
            </tr>
          </thead>
          <tbody>
            {metrics.confusion_matrix.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className="border border-border p-2 text-left font-normal">
                  {rowIndex === 0 ? "Normal" : "Attack"}
                </th>
                {row.map((count, columnIndex) => {
                  const correct = rowIndex === columnIndex
                  return (
                    <td
                      className={`border border-border p-2 font-mono tabular-nums ${correct ? "bg-primary text-on-primary" : "bg-threat text-on-threat"}`}
                      key={columnIndex}
                    >
                      {formatCount(count)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CategoryBreakdown({ response }: { response: BatchResponse }) {
  const categories = Object.entries(response.category_counts).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...categories.map(([, count]) => count))
  const hasLabels = response.metrics !== null

  return (
    <section className="border-[1.5px] border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg">Category breakdown</h3>
        <span className="text-[13px] text-muted">{hasLabels ? "Dataset labels" : "Predicted class"}</span>
      </div>
      {categories.length ? (
        <ul className="mt-3 space-y-3">
          {categories.map(([name, count]) => {
            const isNormal = name === "Normal"
            return (
              <li key={name}>
                <div className="mb-1 flex justify-between gap-3 text-[13px]">
                  <span>{name}</span>
                  <span className="font-mono tabular-nums">{formatCount(count)}</span>
                </div>
                <div aria-hidden="true" className="h-2 w-full bg-stone">
                  <span
                    className={`bar-grow block h-full ${isNormal ? "bg-stone" : "bg-threat"}`}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted">No category counts are available.</p>
      )}
    </section>
  )
}

function ResultsTable({
  response,
  onSelect,
}: {
  response: BatchResponse
  onSelect: (row: BatchResult) => void
}) {
  const [filter, setFilter] = useState<ResultFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("row")
  const [descending, setDescending] = useState(false)
  const [page, setPage] = useState(0)
  const hasLabels = response.metrics !== null

  const filtered = useMemo(() => {
    if (filter === "attacks") return response.results.filter((row) => row.prediction === "Attack")
    if (filter === "normal") return response.results.filter((row) => row.prediction === "Normal")
    if (filter === "false_positives") return response.results.filter((row) => row.is_false_positive)
    return response.results
  }, [filter, response.results])

  const sorted = useMemo(() => {
    const value = (row: BatchResult) => row[sortKey] ?? ""
    return [...filtered].sort((a, b) => {
      const first = value(a)
      const second = value(b)
      const order =
        typeof first === "number" && typeof second === "number"
          ? first - second
          : String(first).localeCompare(String(second))
      return descending ? -order : order
    })
  }, [descending, filtered, sortKey])
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visibleRows = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const selectSort = (key: SortKey) => {
    if (sortKey === key) setDescending((value) => !value)
    else {
      setSortKey(key)
      setDescending(false)
    }
    setPage(0)
  }

  const headings: { key: SortKey; label: string; className?: string }[] = [
    { key: "row", label: "Row" },
    { key: "prediction", label: "Prediction" },
    { key: "category", label: "Category" },
    { key: "protocol", label: "Protocol / service" },
    { key: "src_bytes", label: "Src bytes", className: "text-right" },
    { key: "dst_bytes", label: "Dst bytes", className: "text-right" },
    { key: "confidence", label: "Confidence", className: "text-right" },
  ]

  return (
    <section aria-labelledby="results-heading" className="border-[1.5px] border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-lg" id="results-heading">Scored flows</h3>
        <p className="text-[13px] text-muted">
          {formatCount(response.rows_scored)} scored
          {response.results_truncated ? " · preview limited to first 1,000 rows" : ""}
        </p>
      </div>

      <div aria-label="Filter results" className="flex flex-wrap gap-2 border-b border-border px-4 py-3" role="group">
        {([
          ["all", "All"],
          ["attacks", "Attacks"],
          ["normal", "Normal"],
          ...(hasLabels ? [["false_positives", "False positives"] as const] : []),
        ] as const).map(([key, label]) => (
          <button
            aria-pressed={filter === key}
            className={`border px-2.5 py-1 text-[13px] ${filter === key ? "border-primary bg-primary text-on-primary" : "border-border bg-bg text-text"}`}
            key={key}
            onClick={() => {
              setFilter(key)
              setPage(0)
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left">
              {headings.map((heading) => (
                <th className={`px-3 py-2 font-normal ${heading.className ?? ""}`} key={heading.key}>
                  <button
                    className="inline-flex items-center gap-1 text-left hover:text-primary"
                    onClick={() => selectSort(heading.key)}
                    type="button"
                  >
                    {heading.label}
                    {sortKey === heading.key && <ChevronDown aria-hidden="true" size={13} />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                aria-label={`Open row ${row.row}, ${row.prediction}${row.is_false_positive ? ", false positive" : ""}`}
                className="cursor-pointer border-b border-border hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                key={row.row}
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelect(row)
                  }
                }}
                tabIndex={0}
              >
                <td className="px-3 py-2.5 font-mono tabular-nums">{row.row}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={row.prediction === "Attack" ? "attack" : "neutral"}>
                    {row.prediction}
                  </Badge>
                  {row.is_false_positive && (
                    <span className="ml-1.5 text-[11px] text-threat">False positive</span>
                  )}
                </td>
                <td className="px-3 py-2.5">{row.category ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <span className="font-mono">{row.protocol}</span>
                  <span className="px-1 text-muted">/</span>
                  {row.service}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCount(row.src_bytes)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatCount(row.dst_bytes)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatPercent(row.confidence)}</td>
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td className="px-3 py-8 text-center text-muted" colSpan={7}>
                  No flows match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px]">
        <span className="text-muted">
          {sorted.length ? `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of ${formatCount(sorted.length)} preview rows` : "0 rows"}
        </span>
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous results page"
            className="border border-border p-1.5 disabled:opacity-40"
            disabled={safePage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={15} />
          </button>
          <span className="font-mono tabular-nums">{safePage + 1} / {pageCount}</span>
          <button
            aria-label="Next results page"
            className="border border-border p-1.5 disabled:opacity-40"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
      </div>
    </section>
  )
}

function ResultsDrawer({
  result,
  onClose,
}: {
  result: BatchResult | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (result && !dialog.open) dialog.showModal()
    if (!result && dialog.open) dialog.close()
  }, [result])

  const featureEntries = result ? Object.entries(result.features) : []
  const maxImportance = Math.max(0, ...(result?.top_features.map((item) => item.importance) ?? []))

  return (
    <dialog
      aria-labelledby="analyze-drawer-title"
      className="alert-drawer fixed inset-y-0 right-0 m-0 ml-auto h-full max-h-none w-full max-w-[500px] border-[1.5px] border-border bg-surface p-0 text-text"
      onClose={onClose}
      ref={dialogRef}
    >
      {result && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-border p-5">
            <div>
              <p className="text-[13px] text-muted">Scored flow</p>
              <h2 className="mt-1 font-mono text-xl tabular-nums" id="analyze-drawer-title">
                Row {result.row}
              </h2>
            </div>
            <button
              aria-label="Close flow details"
              className="border border-border p-2 hover:bg-bg"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </header>
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px]">Prediction</span>
              <Badge tone={result.prediction === "Attack" ? "attack" : "neutral"}>
                {result.prediction}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-[13px]">Confidence</span>
              <span className="font-mono tabular-nums">{formatPercent(result.confidence)}</span>
            </div>
            {result.category && (
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-[13px]">Dataset category</span>
                <span className="text-[13px]">{result.category}</span>
              </div>
            )}
            <section className="border-t border-border pt-4">
              <h3 className="text-lg">Global importance</h3>
              <p className="mt-1 text-[13px] text-muted">
                The model has no SHAP dependency; these are global feature importances, not per-flow explanations.
              </p>
              <ul className="mt-3 space-y-2">
                {result.top_features.slice(0, 10).map((feature: FeatureImportance) => (
                  <li key={feature.feature}>
                    <div className="mb-1 flex justify-between gap-3 text-[13px]">
                      <span className="truncate">{feature.feature}</span>
                      <span className="font-mono tabular-nums">{feature.importance.toFixed(4)}</span>
                    </div>
                    <div aria-hidden="true" className="h-1.5 bg-stone">
                      <span
                        className="block h-full bg-primary"
                        style={{ width: `${maxImportance ? (feature.importance / maxImportance) * 100 : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="border-t border-border pt-4">
              <h3 className="text-lg">Feature values</h3>
              <dl className="mt-2 divide-y divide-border">
                {featureEntries.map(([name, value]) => (
                  <div className="flex items-start justify-between gap-4 py-2" key={name}>
                    <dt className="break-all text-[13px] text-muted">{name}</dt>
                    <dd className="max-w-[55%] break-all text-right font-mono text-[13px] tabular-nums">
                      {value === null ? "—" : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>
      )}
    </dialog>
  )
}

function SingleFlowForm({
  defaults,
  result,
  onResult,
}: {
  defaults: FlowDefaults | null
  result: PredictResponse | null
  onResult: (value: PredictResponse) => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadedDefaults, setLoadedDefaults] = useState("")

  useEffect(() => {
    if (!defaults || loadedDefaults === defaults.defaults_source) return
    setValues(
      Object.fromEntries(
        Object.entries(defaults.defaults).map(([key, value]) => [key, String(value)]),
      ),
    )
    setLoadedDefaults(defaults.defaults_source)
  }, [defaults, loadedDefaults])

  const setField = (field: string, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
  }

  const applyPreset = (name: "normal" | "dos") => {
    const preset = defaults?.presets[name]
    if (!preset) return
    setValues(Object.fromEntries(Object.entries(preset).map(([key, value]) => [key, String(value)])))
    setError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!defaults) return
    const features: Record<string, string | number> = {}
    for (const column of defaults.feature_columns) {
      const value = values[column] ?? String(defaults.defaults[column] ?? "")
      if (defaults.categorical_columns.includes(column)) {
        if (!value.trim()) {
          setError(`Choose a value for ${column}.`)
          return
        }
        features[column] = value
      } else {
        const numeric = Number(value)
        const range = defaults.ranges[column]
        if (!value.trim() || !Number.isFinite(numeric)) {
          setError(`Enter a numeric value for ${column}.`)
          return
        }
        if (range && (numeric < range.min || numeric > range.max)) {
          setError(`${column} must be between ${range.min} and ${range.max}.`)
          return
        }
        features[column] = numeric
      }
    }
    setError(null)
    setSubmitting(true)
    try {
      onResult(await predictSingle(features))
    } catch (cause) {
      setError(friendlyError(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <details className="border-[1.5px] border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className="block text-lg">Analyze one flow</span>
          <span className="block text-[13px] text-muted">Enter a single NSL-KDD feature row.</span>
        </span>
        <ChevronDown aria-hidden="true" size={17} />
      </summary>
      <form className="border-t border-border p-4 sm:p-5" onSubmit={submit}>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button disabled={!defaults?.presets.normal} onClick={() => applyPreset("normal")} type="button">
            Use typical normal flow
          </Button>
          <Button disabled={!defaults?.presets.dos} onClick={() => applyPreset("dos")} type="button">
            Use typical DoS flow
          </Button>
          {defaults && (
            <span className="self-center text-[13px] text-muted">
              Defaults from {defaults.defaults_source}
            </span>
          )}
        </div>

        {!defaults ? (
          <p className="text-[13px] text-muted">
            Training defaults are loading or unavailable. File analysis is still available.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {CATEGORICAL_FIELDS.map((field) => (
                <label className="grid gap-1 text-[13px]" key={field}>
                  <span>{field}</span>
                  <select
                    className="min-h-10 border border-border bg-bg px-2 text-text"
                    onChange={(event) => setField(field, event.target.value)}
                    required
                    value={values[field] ?? ""}
                  >
                    <option disabled value="">Choose {field}</option>
                    {(defaults.options[field] ?? []).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {NUMERIC_FIELDS.map((field) => {
                const range = defaults.ranges[field]
                const usedByModel = defaults.feature_columns.includes(field)
                return (
                  <label className="grid gap-1 text-[13px]" key={field}>
                    <span>{field}</span>
                    <input
                      className="min-h-10 min-w-0 border border-border bg-bg px-2 font-mono text-text disabled:text-muted"
                      disabled={!usedByModel}
                      max={range?.max}
                      min={range?.min}
                      onChange={(event) => setField(field, event.target.value)}
                      placeholder={usedByModel ? "" : "Not used by this model"}
                      required={usedByModel}
                      step={field.endsWith("_rate") ? "any" : "1"}
                      type="number"
                      value={values[field] ?? ""}
                    />
                    {!usedByModel && <span className="text-[11px] text-muted">Not in the fitted model.</span>}
                  </label>
                )
              })}
            </div>
            {error && (
              <p className="mt-3 text-[13px] text-threat" role="alert">{error}</p>
            )}
            <Button className="mt-4" disabled={submitting}>
              {submitting ? "Scoring…" : "Run prediction"}
            </Button>
            {result && (
              <div aria-live="polite" className="mt-4 border-t border-border pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span>Prediction</span>
                  <Badge tone={result.label === "attack" ? "attack" : "neutral"}>
                    {result.label === "attack" ? "Attack" : "Normal"}
                  </Badge>
                  <span className="font-mono text-[13px] tabular-nums">
                    Confidence {formatPercent(result.confidence)}
                  </span>
                </div>
                <h3 className="mt-4 text-sm">Global importance</h3>
                <p className="mt-1 text-[13px] text-muted">
                  Global feature importance, not a per-flow explanation.
                </p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {result.top_features.slice(0, 6).map((feature) => (
                    <li className="flex justify-between gap-3 border-t border-border pt-2 text-[13px]" key={feature.feature}>
                      <span className="truncate">{feature.feature}</span>
                      <span className="font-mono tabular-nums">{feature.importance.toFixed(4)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </form>
    </details>
  )
}

export function AnalyzePage() {
  const [health, setHealth] = useState<ApiHealth | null>(null)
  const [defaults, setDefaults] = useState<FlowDefaults | null>(null)
  const [samples, setSamples] = useState<SampleFile[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UploadStatus>("idle")
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<BatchResponse | null>(null)
  const [selectedResult, setSelectedResult] = useState<BatchResult | null>(null)
  const [warningsDismissed, setWarningsDismissed] = useState(false)
  const [singleResult, setSingleResult] = useState<Awaited<ReturnType<typeof predictSingle>> | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const uploadController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getHealth(controller.signal).then(setHealth).catch(() => undefined)
    void getDefaults(controller.signal).then(setDefaults).catch(() => undefined)
    void getSamples(controller.signal).then((value) => setSamples(value.samples)).catch(() => undefined)
    return () => controller.abort()
  }, [])

  const beginUpload = async (nextFile: File) => {
    const extension = nextFile.name.split(".").pop()?.toLowerCase()
    if (!["csv", "txt", "tsv"].includes(extension ?? "")) {
      setFile(nextFile)
      setResponse(null)
      setError("Choose a .csv, .txt, or .tsv file.")
      setStatus("error")
      return
    }
    if (nextFile.size > MAX_FILE_BYTES) {
      setFile(nextFile)
      setResponse(null)
      setError("This file is larger than the 10 MB limit.")
      setStatus("error")
      return
    }
    if (nextFile.size === 0) {
      setFile(nextFile)
      setResponse(null)
      setError("The selected file is empty.")
      setStatus("error")
      return
    }

    const controller = new AbortController()
    uploadController.current = controller
    setFile(nextFile)
    setResponse(null)
    setError(null)
    setDownloadError(null)
    setWarningsDismissed(false)
    setPercent(0)
    setStatus("uploading")
    try {
      const result = await uploadBatch(
        nextFile,
        (loaded, total) => {
          const progress = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0
          setPercent(progress)
          if (progress >= 100) setStatus("scoring")
        },
        controller.signal,
      )
      setResponse(result)
      setStatus("success")
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === "cancelled") {
        setStatus("idle")
        setError(null)
      } else {
        setError(friendlyError(cause))
        setStatus("error")
      }
    } finally {
      uploadController.current = null
    }
  }

  const useSample = async (sample: SampleFile) => {
    setError(null)
    try {
      const blob = await getSample(sample.name)
      const sampleFile = new File([blob], sample.name, { type: "text/csv" })
      await beginUpload(sampleFile)
    } catch (cause) {
      setError(friendlyError(cause))
      setStatus("error")
    }
  }

  const reset = () => {
    uploadController.current?.abort()
    setFile(null)
    setResponse(null)
    setStatus("idle")
    setPercent(0)
    setError(null)
    setDownloadError(null)
    setWarningsDismissed(false)
    setSingleResult(null)
  }

  const retry = () => {
    if (file) void beginUpload(file)
    else if (samples.length) void useSample(samples[0])
  }

  const cancel = () => uploadController.current?.abort()

  const downloadCsv = async () => {
    if (!response) return
    setDownloadError(null)
    try {
      const blob = await downloadBatchCsv(response.download_id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "spiral_predictions.csv"
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setDownloadError(friendlyError(cause))
    }
  }

  const hasWarnings = Boolean(response?.warnings.length || response?.rows_skipped)

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <main className="mx-auto max-w-[1480px] space-y-5 px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-7" id="analyze">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl leading-tight">Analyze</h1>
            <p className="mt-1 text-[13px] text-muted">Upload a flow file or score a single connection.</p>
          </div>
          <div className="text-[13px] text-muted">
            {health
              ? `Scored by ${health.model_name} · ${health.model_file}`
              : "Model information unavailable"}
          </div>
        </header>

        <UploadPanel
          error={error}
          file={file}
          onCancel={cancel}
          onFile={(nextFile) => void beginUpload(nextFile)}
          onReset={reset}
          onRetry={retry}
          onSample={(sample) => void useSample(sample)}
          percent={percent}
          samples={samples}
          status={status}
        />

        {response && (
          <section aria-label="Prediction results" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[22px]">Analysis results</h2>
                <p className="text-[13px] text-muted">
                  Scored by {health?.model_name ?? "XGBoost"}
                  {health ? ` · ${health.model_file}` : ""}
                </p>
              </div>
              <Button onClick={() => void downloadCsv()}>
                <Download aria-hidden="true" size={15} />
                Download results CSV
              </Button>
            </div>

            {hasWarnings && !warningsDismissed && (
              <div className="border-[1.5px] border-border bg-bg p-3" role="status">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm">Review these warnings</h3>
                    <ul className="mt-1 list-disc pl-5 text-[13px] text-muted">
                      {response.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                      {response.rows_skipped > 0 && <li>{formatCount(response.rows_skipped)} rows were skipped.</li>}
                    </ul>
                  </div>
                  <button
                    aria-label="Dismiss warnings"
                    className="shrink-0 border border-border p-1.5"
                    onClick={() => setWarningsDismissed(true)}
                    type="button"
                  >
                    <X aria-hidden="true" size={15} />
                  </button>
                </div>
              </div>
            )}
            {downloadError && <p className="text-[13px] text-threat" role="alert">{downloadError}</p>}

            <SummaryStrip response={response} />
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <MetricsPanel response={response} />
              <CategoryBreakdown response={response} />
            </div>
            {response.results_truncated && (
              <p className="text-[13px] text-muted">
                The interactive table shows the first 1,000 scored rows; the download contains the full file.
              </p>
            )}
            <ResultsTable onSelect={setSelectedResult} response={response} />
          </section>
        )}

        {status === "idle" && !response && (
          <section className="border border-border bg-bg p-5">
            <h2 className="text-lg">Nothing analyzed yet</h2>
            <p className="mt-1 text-[13px] text-muted">
              Choose a flow file above or try the included labeled sample to see predictions and evaluation metrics.
            </p>
          </section>
        )}

        <SingleFlowForm
          defaults={defaults}
          onResult={setSingleResult}
          result={singleResult}
        />
      </main>
      <ResultsDrawer onClose={() => setSelectedResult(null)} result={selectedResult} />
    </div>
  )
}
