export interface TrafficPoint {
  bucket: number
  flows: number
  attacks: number
}

export interface CategoryCount {
  name: "DoS" | "Probe" | "R2L" | "U2R" | "Normal"
  value: number
}

export interface CategoryDetection {
  name: "DoS" | "Probe" | "R2L" | "U2R"
  caught: number
  missed: number
  total: number
}

export interface ConfusionMatrix {
  labels: ["Normal", "Attack"]
  values: [[number, number], [number, number]]
}

export interface ClassMetric {
  name: "Normal" | "Attack"
  precision: number | null
  recall: number | null
  f1: number | null
}

export interface DashboardStats {
  status: "available" | "unavailable"
  source: string
  dataset_file?: string
  total_flows: number | null
  attacks_detected: number | null
  detection_rate: number | null
  false_positive_rate: number | null
  traffic: TrafficPoint[]
  categories: CategoryCount[]
  detection_by_category: CategoryDetection[]
  confusion_matrix: ConfusionMatrix | null
  class_metrics: ClassMetric[]
}

export interface Alert {
  row: number
  protocol: string
  service: string
  src_bytes: number
  dst_bytes: number
  label: "attack" | "normal"
  confidence: number
  attack_probability: number
  true_label: string
  category: string
}

export interface AlertsResponse {
  status: "available" | "unavailable"
  source: string
  alerts: Alert[]
}

export interface ModelMetric {
  model: string
  accuracy: number
  attack_precision: number
  attack_recall: number
  missed_attacks: number
  false_alarms: number
}

export interface MetricsResponse {
  status: "available"
  source: string
  threshold: number
  models: ModelMetric[]
}

export interface FeatureImportance {
  feature: string
  importance: number
}

export interface PredictResponse {
  label: "attack" | "normal"
  confidence: number
  attack_probability: number
  top_features: FeatureImportance[]
  explanation_type: "global"
  warnings: string[]
}

export interface BatchSummary {
  attacks_flagged: number
  normal: number
  flag_rate: number
  mean_confidence: number
}

export interface BatchMetrics {
  accuracy: number
  precision: number
  recall: number
  f1: number
  confusion_matrix: [[number, number], [number, number]]
}

export interface BatchResult {
  row: number
  prediction: "Attack" | "Normal"
  category: string | null
  true_label: string | null
  is_false_positive: boolean | null
  confidence: number
  protocol: string
  service: string
  src_bytes: number
  dst_bytes: number
  features: Record<string, string | number | boolean | null>
  top_features: FeatureImportance[]
  explanation_type: "global"
}

export interface BatchResponse {
  filename: string
  rows_received: number
  rows_scored: number
  rows_skipped: number
  warnings: string[]
  summary: BatchSummary
  metrics: BatchMetrics | null
  category_counts: Record<string, number>
  results: BatchResult[]
  results_truncated: boolean
  download_id: string
}

export interface ApiHealth {
  model_name: string
  model_file: string
  number_of_features: number
  kddtest_plus_available: boolean
}

export interface FlowDefaults {
  model_name: string
  model_file: string
  feature_columns: string[]
  numeric_columns: string[]
  categorical_columns: string[]
  defaults: Record<string, string | number>
  ranges: Record<string, { min: number; max: number } | null>
  options: Record<string, string[]>
  presets: Record<string, Record<string, string | number>>
  defaults_source: string
}

export interface SampleFile {
  name: string
  size_bytes: number
}

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number | null

  constructor(message: string, code: string, status: number | null = null) {
    super(message)
    this.name = "ApiClientError"
    this.code = code
    this.status = status
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "")
const REQUEST_TIMEOUT_MS = 30_000
const UPLOAD_TIMEOUT_MS = 120_000

interface RequestOptions extends RequestInit {
  timeoutMs?: number
  responseType?: "json" | "blob"
}

function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function errorFromPayload(payload: unknown, status: number): ApiClientError {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null
  ) {
    const apiError = payload.error as { code?: unknown; message?: unknown }
    if (typeof apiError.code === "string" && typeof apiError.message === "string") {
      return new ApiClientError(apiError.message, apiError.code, status)
    }
  }

  const fallback =
    status === 413
      ? "The upload is larger than the allowed limit."
      : status === 415
        ? "Choose a CSV, TXT, or TSV file."
        : status >= 500
          ? "The server could not complete the request."
          : "The request could not be completed."
  return new ApiClientError(fallback, `http_${status}`, status)
}

async function responseError(response: Response): Promise<ApiClientError> {
  try {
    return errorFromPayload(await response.json(), response.status)
  } catch (error) {
    if (error instanceof ApiClientError) return error
    return errorFromPayload(null, response.status)
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, responseType = "json", signal, ...init } = options
  const controller = new AbortController()
  let timedOut = false
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener("abort", forwardAbort, { once: true })
  if (signal?.aborted) controller.abort()

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
    })
    if (!response.ok) throw await responseError(response)
    return (responseType === "blob" ? await response.blob() : await response.json()) as T
  } catch (error) {
    if (error instanceof ApiClientError) throw error
    if (controller.signal.aborted) {
      throw new ApiClientError(
        timedOut ? "The request timed out. Try again." : "The request was cancelled.",
        timedOut ? "timeout" : "cancelled",
      )
    }
    if (error instanceof TypeError) {
      throw new ApiClientError(
        "The API server could not be reached. Check the server and try again.",
        "network_error",
      )
    }
    throw new ApiClientError("The server returned an unreadable response.", "invalid_response")
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener("abort", forwardAbort)
  }
}

export function getStats(signal?: AbortSignal) {
  return request<DashboardStats>("/api/stats", { signal })
}

export function getAlerts(limit = 10, signal?: AbortSignal) {
  return request<AlertsResponse>(`/api/alerts?limit=${encodeURIComponent(limit)}`, { signal })
}

export function getMetrics(signal?: AbortSignal) {
  return request<MetricsResponse>("/api/metrics", { signal })
}

export function getHealth(signal?: AbortSignal) {
  return request<ApiHealth>("/api/health", { signal })
}

export function getDefaults(signal?: AbortSignal) {
  return request<FlowDefaults>("/api/defaults", { signal })
}

export function getSamples(signal?: AbortSignal) {
  return request<{ samples: SampleFile[] }>("/api/samples", { signal })
}

export function getSample(name: string, signal?: AbortSignal) {
  return request<Blob>(`/api/samples/${encodeURIComponent(name)}`, {
    responseType: "blob",
    signal,
  })
}

export function predictSingle(features: Record<string, string | number>, signal?: AbortSignal) {
  return request<PredictResponse>("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features }),
    signal,
  })
}

export function uploadBatch(
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<BatchResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", apiUrl("/api/predict/batch"))
    xhr.timeout = UPLOAD_TIMEOUT_MS

    const cleanUp = () => signal?.removeEventListener("abort", abortRequest)
    const abortRequest = () => xhr.abort()
    signal?.addEventListener("abort", abortRequest, { once: true })
    if (signal?.aborted) {
      xhr.abort()
      reject(new ApiClientError("The request was cancelled.", "cancelled"))
      return
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total)
    }
    xhr.onload = () => {
      cleanUp()
      let payload: unknown
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        reject(new ApiClientError("The server returned an unreadable response.", "invalid_response"))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(errorFromPayload(payload, xhr.status))
        return
      }
      resolve(payload as BatchResponse)
    }
    xhr.onerror = () => {
      cleanUp()
      reject(
        new ApiClientError(
          "The API server could not be reached. Check the server and try again.",
          "network_error",
        ),
      )
    }
    xhr.ontimeout = () => {
      cleanUp()
      reject(new ApiClientError("The upload timed out. Try again.", "timeout"))
    }
    xhr.onabort = () => {
      cleanUp()
      reject(new ApiClientError("The request was cancelled.", "cancelled"))
    }
    const body = new FormData()
    body.append("file", file)
    xhr.send(body)
  })
}

export function downloadBatchCsv(downloadId: string, signal?: AbortSignal) {
  return request<Blob>(`/api/predict/batch/${encodeURIComponent(downloadId)}/csv`, {
    responseType: "blob",
    signal,
  })
}
