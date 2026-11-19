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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
)

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`API request failed (${response.status}): ${body || response.statusText}`)
  }
  return (await response.json()) as T
}

export const getStats = () => getJson<DashboardStats>("/api/stats")
export const getAlerts = (limit = 10) =>
  getJson<AlertsResponse>(`/api/alerts?limit=${encodeURIComponent(limit)}`)
export const getMetrics = () => getJson<MetricsResponse>("/api/metrics")
