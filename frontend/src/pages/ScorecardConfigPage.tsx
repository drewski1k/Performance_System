import {
  Settings,
  Scale,
  Percent,
  Filter,
  Zap,
  DollarSign,
  Loader2,
  Save,
  CheckCircle2,
  RefreshCw,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import { usePeriod } from "@/hooks/usePeriod";

const tabs = [
  { key: "metrics", label: "Metrics", icon: Settings },
  { key: "grades", label: "Grade Scales", icon: Scale },
  { key: "weights", label: "Score Weights", icon: Percent },
  { key: "outliers", label: "Outlier Settings", icon: Filter },
  { key: "productivity", label: "Productivity States", icon: Zap },
  { key: "pfp", label: "PFP Rates", icon: DollarSign },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface MetricConfig {
  id: string;
  metric_id: string;
  metric_key: string;
  metric_name: string;
  metric_display_name: string | null;
  channel: string | null;
  direction: string;
  unit: string | null;
  weight: number;
  include_in_score: boolean;
  show_on_scorecard: boolean;
  min_threshold: number | null;
  threshold_basis: string | null;
  grade_mode: string | null;
  sort_order: number;
  manual_thresholds: Record<string, number> | null;
}

interface GradeScale {
  grade: string;
  min_score: number;
  max_score: number;
  dynamic: boolean;
}

interface PfpRate {
  grade: string;
  rate_per_hour: number;
}

interface ProductivityState {
  name: string;
  state_type: string;
  productive: boolean;
  category: string;
}

interface Template {
  id: string;
  name: string;
  channel_weight: number;
  non_channel_weight: number;
  outlier_method: string;
  iqr_multiplier: number;
  is_active: boolean;
  metrics: MetricConfig[];
  grade_scales: GradeScale[];
  pfp_rates: PfpRate[];
  productivity_states: ProductivityState[];
}

interface PfpConfig {
  grade_a_rate: number;
  grade_b_rate: number;
  grade_c_rate: number;
  grade_d_rate: number;
  grade_f_rate: number;
}

// ── Editable metric row type (what we track in local state) ──────────────────

interface EditableMetric extends MetricConfig {
  _weight: string; // string so input is uncontrolled-friendly
  _min_threshold: string;
}

function toEditable(m: MetricConfig): EditableMetric {
  return {
    ...m,
    _weight: String(m.weight),
    _min_threshold: m.min_threshold != null ? String(m.min_threshold) : "",
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SaveButton({
  isPending,
  onClick,
  label,
  disabled,
}: {
  isPending: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isPending || disabled}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
    >
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {label}
    </button>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg">
      <CheckCircle2 className="h-4 w-4" />
      {message}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ScorecardConfigPage() {
  const [activeTab, setActiveTab] = useState("metrics");
  const queryClient = useQueryClient();
  const { periodId } = usePeriod();

  // ── Template query ─────────────────────────────────────────────────────────
  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["scorecard-templates"],
    queryFn: async () => {
      const res = await api.get("/scorecards/templates");
      return res.data;
    },
  });

  const template = templates?.[0] ?? null;

  // ── Score Weights local state ──────────────────────────────────────────────
  const [channelWeight, setChannelWeight] = useState(0);
  const [nonChannelWeight, setNonChannelWeight] = useState(100);
  const [outlierMethod, setOutlierMethod] = useState("iqr");
  const [iqrMultiplier, setIqrMultiplier] = useState(1.5);
  const [weightsSaved, setWeightsSaved] = useState(false);
  const [outliersSaved, setOutliersSaved] = useState(false);

  useEffect(() => {
    if (template) {
      setChannelWeight(template.channel_weight ?? 0);
      setNonChannelWeight(template.non_channel_weight ?? 100);
      setOutlierMethod(template.outlier_method ?? "iqr");
      setIqrMultiplier(template.iqr_multiplier ?? 1.5);
    }
  }, [template]);

  // ── Metrics local state ────────────────────────────────────────────────────
  const [editableMetrics, setEditableMetrics] = useState<EditableMetric[]>([]);
  const [metricsSaved, setMetricsSaved] = useState(false);
  const [metricFilter, setMetricFilter] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // ── Custom metric form state ──────────────────────────────────────────────
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customFormula, setCustomFormula] = useState("");
  const [customChannel, setCustomChannel] = useState("non_channel");
  const [customDirection, setCustomDirection] = useState("higher_better");
  const [customUnit, setCustomUnit] = useState("percent");
  const [customError, setCustomError] = useState("");
  const [customValid, setCustomValid] = useState(false);
  const [metricSearch, setMetricSearch] = useState("");
  const formulaRef = useRef<HTMLTextAreaElement>(null);

  const { data: metricKeys } = useQuery<{key: string; name: string; channel: string}[]>({
    queryKey: ["metric-keys"],
    queryFn: async () => { const r = await api.get("/metrics/definitions/keys"); return r.data; },
    enabled: showCustomForm,
  });

  const filteredMetricKeys = metricKeys?.filter(
    (mk) =>
      mk.key.toLowerCase().includes(metricSearch.toLowerCase()) ||
      mk.name.toLowerCase().includes(metricSearch.toLowerCase())
  ) ?? [];

  // Live formula validation
  const validateMutation = useMutation({
    mutationFn: async (formula: string) => {
      const r = await api.post("/metrics/definitions/validate-formula", { formula });
      return r.data;
    },
    onSuccess: (data) => {
      if (data.valid) {
        setCustomError("");
        setCustomValid(true);
      } else {
        setCustomError(data.error || "Invalid formula");
        setCustomValid(false);
      }
    },
    onError: () => {
      setCustomValid(false);
    },
  });

  // Debounced formula validation
  const validateTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  function handleFormulaChange(val: string) {
    setCustomFormula(val);
    setCustomValid(false);
    if (validateTimeoutRef.current) clearTimeout(validateTimeoutRef.current);
    if (val.trim()) {
      validateTimeoutRef.current = setTimeout(() => validateMutation.mutate(val), 600);
    } else {
      setCustomError("");
    }
  }

  const customMetricMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/metrics/definitions/custom", {
        name: customName, key: customKey, formula: customFormula,
        channel: customChannel, direction: customDirection, unit: customUnit,
      });
      // Add to scorecard template
      if (template) {
        const newMetric = {
          metric_id: res.data.id,
          weight: 0, include_in_score: false, show_on_scorecard: true,
          min_threshold: 0, threshold_basis: "", grade_mode: "dynamic",
          sort_order: editableMetrics.length,
          manual_thresholds: null,
        };
        const existingMetrics = editableMetrics.map((m) => ({
          metric_id: m.metric_id, weight: parseFloat(m._weight) || 0,
          include_in_score: m.include_in_score, show_on_scorecard: m.show_on_scorecard,
          min_threshold: m._min_threshold === "" ? null : Number(m._min_threshold),
          threshold_basis: m.threshold_basis, grade_mode: m.grade_mode ?? "dynamic",
          sort_order: m.sort_order, manual_thresholds: m.manual_thresholds,
        }));
        await api.put(`/scorecards/templates/${template.id}`, { metrics: [...existingMetrics, newMetric] });
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scorecard-templates"] });
      queryClient.invalidateQueries({ queryKey: ["metric-keys"] });
      setShowCustomForm(false);
      setCustomName(""); setCustomKey(""); setCustomFormula("");
      setCustomError("");
    },
    onError: (err: any) => {
      setCustomError(err.response?.data?.detail || err.message || "Failed to create metric");
    },
  });

  function insertMetricKey(key: string) {
    if (!formulaRef.current) return;
    const ta = formulaRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = customFormula.substring(0, start) + key + customFormula.substring(end);
    setCustomFormula(newVal);
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + key.length; }, 0);
  }

  useEffect(() => {
    if (template?.metrics) {
      setEditableMetrics(template.metrics.map(toEditable));
    }
  }, [template]);

  // ── PFP local state ────────────────────────────────────────────────────────
  const [pfpRates, setPfpRates] = useState<PfpConfig>({
    grade_a_rate: 0,
    grade_b_rate: 0,
    grade_c_rate: 0,
    grade_d_rate: 0,
    grade_f_rate: 0,
  });
  const [pfpSaved, setPfpSaved] = useState(false);

  const { data: pfpData } = useQuery<PfpConfig>({
    queryKey: ["scorecard-pfp", template?.id],
    queryFn: async () => {
      const res = await api.get(`/scorecards/templates/${template!.id}/pfp`);
      return res.data;
    },
    enabled: !!template?.id,
  });

  useEffect(() => {
    if (pfpData) {
      setPfpRates(pfpData);
    }
  }, [pfpData]);

  // ── Re-Score state ─────────────────────────────────────────────────────────
  const [rescoreResult, setRescoreResult] = useState<string | null>(null);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Template>) => {
      if (!template) return;
      const res = await api.put(`/scorecards/templates/${template.id}`, payload);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["scorecard-templates"] });
      if ("channel_weight" in variables) {
        setWeightsSaved(true);
        setTimeout(() => setWeightsSaved(false), 2500);
      } else if ("outlier_method" in variables) {
        setOutliersSaved(true);
        setTimeout(() => setOutliersSaved(false), 2500);
      }
    },
  });

  const metricsMutation = useMutation({
    mutationFn: async (metrics: MetricConfig[]) => {
      if (!template) return;
      const res = await api.put(`/scorecards/templates/${template.id}`, { metrics });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scorecard-templates"] });
      setMetricsSaved(true);
      setTimeout(() => setMetricsSaved(false), 2500);
    },
  });

  const pfpMutation = useMutation({
    mutationFn: async (payload: PfpConfig) => {
      if (!template) return;
      const res = await api.put(`/scorecards/templates/${template.id}/pfp`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scorecard-pfp", template?.id] });
      setPfpSaved(true);
      setTimeout(() => setPfpSaved(false), 2500);
    },
  });

  const rescoreMutation = useMutation({
    mutationFn: async () => {
      if (!periodId || !template) throw new Error("Missing period or template");
      const res = await api.post(
        `/performance/calculate/${periodId}?template_id=${template.id}`
      );
      return res.data;
    },
    onSuccess: (data) => {
      const count =
        data?.agents_scored ?? data?.agent_count ?? data?.count ?? null;
      setRescoreResult(
        count != null
          ? `Re-scoring complete — ${count} agent${count !== 1 ? "s" : ""} scored`
          : "Re-scoring complete"
      );
      setTimeout(() => setRescoreResult(null), 5000);
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const totalWeight = channelWeight + nonChannelWeight;
  const weightValid = totalWeight === 100;

  function handleSaveWeights() {
    updateMutation.mutate({ channel_weight: channelWeight, non_channel_weight: nonChannelWeight });
  }

  function handleSaveOutliers() {
    updateMutation.mutate({ outlier_method: outlierMethod, iqr_multiplier: iqrMultiplier });
  }

  function handleSaveMetrics() {
    const metrics: MetricConfig[] = editableMetrics.map((m) => ({
      id: m.id,
      metric_id: m.metric_id,
      metric_key: m.metric_key,
      metric_name: m.metric_name,
      channel: m.channel,
      direction: m.direction,
      unit: m.unit,
      weight: parseFloat(m._weight) || 0,
      include_in_score: m.include_in_score,
      show_on_scorecard: m.show_on_scorecard,
      min_threshold: m._min_threshold !== "" ? parseFloat(m._min_threshold) : null,
      threshold_basis: m.threshold_basis,
      grade_mode: m.grade_mode,
      sort_order: m.sort_order,
      manual_thresholds: m.manual_thresholds,
    }));
    metricsMutation.mutate(metrics);
  }

  function handleSavePfp() {
    pfpMutation.mutate(pfpRates);
  }

  function updateMetricField<K extends keyof EditableMetric>(
    index: number,
    field: K,
    value: EditableMetric[K]
  ) {
    setEditableMetrics((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  const gradeScales = template?.grade_scales ?? [];
  const productivityStates = template?.productivity_states ?? [];

  // ── PFP grade display config ───────────────────────────────────────────────
  const pfpGrades: { label: string; key: keyof PfpConfig; color: string }[] = [
    { label: "A", key: "grade_a_rate", color: "border-l-emerald-500" },
    { label: "B", key: "grade_b_rate", color: "border-l-green-500" },
    { label: "C", key: "grade_c_rate", color: "border-l-yellow-500" },
    { label: "D", key: "grade_d_rate", color: "border-l-orange-500" },
    { label: "F", key: "grade_f_rate", color: "border-l-red-500" },
  ];

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scorecard Configuration</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure metrics, weights, grade scales, and scoring rules
            {template ? ` — ${template.name}` : ""}
          </p>
        </div>

        {/* Re-Score button */}
        {template && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => rescoreMutation.mutate()}
              disabled={rescoreMutation.isPending || !periodId}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors",
                "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              )}
              title={!periodId ? "Select a period first" : undefined}
            >
              {rescoreMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {rescoreMutation.isPending ? "Scoring…" : "Re-Score All Agents"}
            </button>
            {!periodId && (
              <span className="text-xs text-muted-foreground">Import data first to enable scoring</span>
            )}
          </div>
        )}
      </div>

      {/* Re-score success banner */}
      {rescoreResult && (
        <SuccessBanner message={rescoreResult} />
      )}

      {/* Re-score error banner */}
      {rescoreMutation.isError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">
          Re-scoring failed — {(rescoreMutation.error as Error)?.message ?? "unknown error"}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">

        {/* ── Metrics tab ─────────────────────────────────────────────────── */}
        {activeTab === "metrics" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold">Metric Configuration</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Edit weights, thresholds, and visibility for each metric.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCustomForm((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  {showCustomForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {showCustomForm ? "Cancel" : "Add Custom Metric"}
                </button>
                {template && (
                  <>
                    {metricsSaved && <SuccessBanner message="Metrics saved" />}
                    <SaveButton
                      isPending={metricsMutation.isPending}
                      onClick={handleSaveMetrics}
                      label="Save Metrics"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Custom Metric Creator Form */}
            {showCustomForm && (
              <div className="mb-6 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white overflow-hidden">
                {/* Form header */}
                <div className="px-5 py-3 bg-indigo-600 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    <span className="font-semibold text-sm">Create Custom Metric</span>
                  </div>
                  <button onClick={() => { setShowCustomForm(false); setCustomError(""); }} className="hover:bg-white/20 rounded p-1 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Step 1: Name */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-600 text-white text-xs font-bold">1</span>
                      <label className="text-sm font-semibold">Name your metric</label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => {
                          setCustomName(e.target.value);
                          setCustomKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
                        }}
                        placeholder="e.g. Total Availability Rate"
                        className="border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Key:</span>
                        <code className="text-xs font-mono bg-gray-100 px-2 py-1.5 rounded border border-input flex-1 overflow-hidden text-ellipsis">
                          {customKey || "auto_generated_key"}
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Formula Builder */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-600 text-white text-xs font-bold">2</span>
                      <label className="text-sm font-semibold">Build your formula</label>
                    </div>

                    {/* Operator buttons */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs text-muted-foreground mr-1">Operators:</span>
                      {["+", "-", "*", "/", "(", ")"].map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => insertMetricKey(op === "(" || op === ")" ? op : ` ${op} `)}
                          className="h-8 w-8 flex items-center justify-center rounded-md bg-white border border-gray-300 text-sm font-bold hover:bg-indigo-50 hover:border-indigo-300 transition-colors shadow-sm"
                        >
                          {op}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => insertMetricKey("100")}
                        className="h-8 px-2 flex items-center justify-center rounded-md bg-white border border-gray-300 text-xs font-mono hover:bg-indigo-50 hover:border-indigo-300 transition-colors shadow-sm"
                      >
                        100
                      </button>
                      <div className="ml-auto flex items-center gap-1.5">
                        {customFormula && validateMutation.isPending && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> Validating...
                          </span>
                        )}
                        {customFormula && customValid && !validateMutation.isPending && (
                          <span className="text-xs text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md">
                            <CheckCircle2 className="h-3 w-3" /> Valid formula
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Formula textarea */}
                      <div className="md:col-span-2">
                        <textarea
                          ref={formulaRef}
                          value={customFormula}
                          onChange={(e) => handleFormulaChange(e.target.value)}
                          placeholder="Click metrics and operators to build, or type directly...&#10;&#10;Example: (voice_avail_time + chat_avail_time) / total_logged_time * 100"
                          rows={4}
                          className={cn(
                            "w-full border rounded-lg px-3 py-2 text-sm bg-white font-mono focus:outline-none focus:ring-2 resize-none",
                            customError ? "border-red-300 focus:ring-red-200" :
                            customValid ? "border-emerald-300 focus:ring-emerald-200" :
                            "border-input focus:ring-indigo-200"
                          )}
                        />
                        {customError && (
                          <p className="mt-1 text-xs text-red-600">{customError}</p>
                        )}
                      </div>

                      {/* Metric picker */}
                      <div className="border border-input rounded-lg bg-white overflow-hidden flex flex-col">
                        <div className="px-2 py-1.5 border-b border-input bg-gray-50">
                          <input
                            type="text"
                            value={metricSearch}
                            onChange={(e) => setMetricSearch(e.target.value)}
                            placeholder="Search metrics..."
                            className="w-full text-xs bg-transparent focus:outline-none"
                          />
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-[120px] p-1">
                          {filteredMetricKeys.map((mk) => (
                            <button
                              key={mk.key}
                              type="button"
                              onClick={() => { insertMetricKey(mk.key); setMetricSearch(""); }}
                              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-indigo-50 transition-colors group"
                              title={mk.name}
                            >
                              <span className="font-mono text-indigo-700 group-hover:text-indigo-900">{mk.key}</span>
                              <span className="text-muted-foreground ml-1.5 hidden sm:inline">{mk.name}</span>
                            </button>
                          ))}
                          {filteredMetricKeys.length === 0 && (
                            <span className="text-xs text-muted-foreground px-2 py-2 block">
                              {metricKeys ? "No matches" : "Loading..."}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Settings */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-indigo-600 text-white text-xs font-bold">3</span>
                      <label className="text-sm font-semibold">Configure settings</label>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Channel</label>
                        <select
                          value={customChannel}
                          onChange={(e) => setCustomChannel(e.target.value)}
                          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        >
                          <option value="non_channel">Non-Channel</option>
                          <option value="channel">Channel</option>
                          <option value="voice">Voice</option>
                          <option value="chat">Chat</option>
                          <option value="email">Email</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Direction</label>
                        <select
                          value={customDirection}
                          onChange={(e) => setCustomDirection(e.target.value)}
                          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        >
                          <option value="higher_better">Higher is Better</option>
                          <option value="lower_better">Lower is Better</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Unit</label>
                        <select
                          value={customUnit}
                          onChange={(e) => setCustomUnit(e.target.value)}
                          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        >
                          <option value="percent">Percent (%)</option>
                          <option value="ratio">Ratio</option>
                          <option value="seconds">Seconds</option>
                          <option value="count">Count</option>
                          <option value="currency">Currency ($)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="flex items-center gap-3 pt-2 border-t border-indigo-100">
                    <button
                      onClick={() => customMetricMutation.mutate()}
                      disabled={!customName || !customKey || !customFormula || !customValid || customMetricMutation.isPending}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      {customMetricMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Create Metric
                    </button>
                    <button
                      onClick={() => { setShowCustomForm(false); setCustomError(""); setCustomValid(false); setMetricSearch(""); }}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    {!customValid && customFormula && !validateMutation.isPending && !customError && (
                      <span className="text-xs text-muted-foreground">Formula validation in progress...</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {editableMetrics.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Create a scorecard template to configure metrics
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search / filter bar */}
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search metrics..."
                    value={metricFilter}
                    onChange={(e) => setMetricFilter(e.target.value)}
                    className="flex-1 max-w-sm border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                  />
                  {metricFilter && (
                    <button onClick={() => setMetricFilter("")} className="text-xs text-muted-foreground hover:text-foreground">
                      Clear
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {editableMetrics.length} metrics total
                  </span>
                </div>

                {(() => {
                  const channelSections: { key: string; label: string; color: string; borderColor: string; bgColor: string; badgeColor: string }[] = [
                    { key: "voice", label: "Voice", color: "text-blue-800", borderColor: "border-blue-200", bgColor: "bg-blue-50", badgeColor: "bg-blue-100 text-blue-700" },
                    { key: "chat", label: "Chat", color: "text-purple-800", borderColor: "border-purple-200", bgColor: "bg-purple-50", badgeColor: "bg-purple-100 text-purple-700" },
                    { key: "email", label: "Email", color: "text-amber-800", borderColor: "border-amber-200", bgColor: "bg-amber-50", badgeColor: "bg-amber-100 text-amber-700" },
                    { key: "non_channel", label: "Non-Channel", color: "text-slate-800", borderColor: "border-slate-200", bgColor: "bg-slate-50", badgeColor: "bg-slate-100 text-slate-700" },
                    { key: "channel", label: "Channel (General)", color: "text-teal-800", borderColor: "border-teal-200", bgColor: "bg-teal-50", badgeColor: "bg-teal-100 text-teal-700" },
                    { key: "__undefined__", label: "Undefined — Needs Configuration", color: "text-red-800", borderColor: "border-red-300", bgColor: "bg-red-50", badgeColor: "bg-red-100 text-red-700" },
                  ];

                  // Filter metrics by search term
                  const filterLower = metricFilter.toLowerCase();
                  const filtered = editableMetrics.map((m, i) => ({ metric: m, originalIndex: i }))
                    .filter(({ metric: m }) =>
                      !metricFilter ||
                      m.metric_name.toLowerCase().includes(filterLower) ||
                      (m.metric_display_name || "").toLowerCase().includes(filterLower) ||
                      m.metric_key.toLowerCase().includes(filterLower)
                    );

                  // Group by channel, sort alphabetically within each group
                  const grouped = new Map<string, { metric: EditableMetric; originalIndex: number }[]>();
                  filtered.forEach(({ metric: m, originalIndex: i }) => {
                    const ch = (!m.channel || m.channel === "") ? "__undefined__" : m.channel;
                    if (!grouped.has(ch)) grouped.set(ch, []);
                    grouped.get(ch)!.push({ metric: m, originalIndex: i });
                  });
                  // Sort each group alphabetically by display name (fallback to metric name)
                  grouped.forEach((items) => {
                    items.sort((a, b) => {
                      const nameA = (a.metric.metric_display_name || a.metric.metric_name).toLowerCase();
                      const nameB = (b.metric.metric_display_name || b.metric.metric_name).toLowerCase();
                      return nameA.localeCompare(nameB);
                    });
                  });

                  // Collect any channels not in predefined list
                  const extraChannels = [...grouped.keys()].filter((k) => !channelSections.some((s) => s.key === k));
                  const allSections = [
                    ...channelSections,
                    ...extraChannels.map((k) => ({
                      key: k, label: k.charAt(0).toUpperCase() + k.slice(1),
                      color: "text-gray-800", borderColor: "border-gray-200", bgColor: "bg-gray-50", badgeColor: "bg-gray-100 text-gray-700",
                    })),
                  ];

                  return allSections
                    .filter((section) => grouped.has(section.key) && grouped.get(section.key)!.length > 0)
                    .map((section) => {
                      const sectionMetrics = grouped.get(section.key)!;
                      return (
                        <div key={section.key} className={cn("rounded-lg border-2 overflow-hidden", section.borderColor)}>
                          {/* Section header (click to collapse/expand) */}
                          <button
                            type="button"
                            onClick={() => setCollapsedSections((prev) => {
                              const next = new Set(prev);
                              next.has(section.key) ? next.delete(section.key) : next.add(section.key);
                              return next;
                            })}
                            className={cn("w-full px-4 py-2.5 flex items-center justify-between cursor-pointer hover:brightness-95 transition-all", section.bgColor)}
                          >
                            <div className="flex items-center gap-2">
                              <span className={cn("text-xs transition-transform", collapsedSections.has(section.key) ? "" : "rotate-90")}>&#9654;</span>
                              <h4 className={cn("text-sm font-semibold", section.color)}>{section.label}</h4>
                              <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", section.badgeColor)}>
                                {sectionMetrics.length} metric{sectionMetrics.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </button>

                          {/* Section table (collapsible) */}
                          {!collapsedSections.has(section.key) && <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border text-left">
                                  <th className="px-4 py-2 font-medium text-muted-foreground">Metric</th>
                                  <th className="px-4 py-2 font-medium text-muted-foreground">Display Name</th>
                                  <th className="px-4 py-2 font-medium text-muted-foreground">Channel</th>
                                  <th className="px-4 py-2 font-medium text-muted-foreground">Weight %</th>
                                  <th className="px-4 py-2 font-medium text-muted-foreground">Direction</th>
                                  <th className="px-4 py-2 font-medium text-muted-foreground">Score / Grade</th>
                                  <th className="px-4 py-2 font-medium text-muted-foreground">Show</th>
                                  <th className="px-4 py-2 font-medium text-muted-foreground">Min Threshold</th>
                                  <th className="px-4 py-2 font-medium text-muted-foreground">Grade Mode</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {sectionMetrics.map(({ metric: m, originalIndex: i }) => (
                                  <tr key={m.id ?? i} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-2.5 font-medium text-muted-foreground text-xs" title={m.metric_key}>{m.metric_name}</td>

                                    {/* Display Name (editable) */}
                                    <td className="px-4 py-2.5">
                                      <input
                                        type="text"
                                        value={m.metric_display_name ?? ""}
                                        placeholder={m.metric_name}
                                        onChange={(e) => updateMetricField(i, "metric_display_name", e.target.value || null as any)}
                                        onBlur={(e) => {
                                          api.patch(`/metrics/definitions/${m.metric_id}`, {
                                            display_name: e.target.value || null,
                                          }).then(() => {
                                            queryClient.invalidateQueries({ queryKey: ["scorecard-templates"] });
                                          });
                                        }}
                                        className="w-40 border border-input rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                      />
                                    </td>

                                    {/* Channel (editable — change moves metric to different section) */}
                                    <td className="px-4 py-2.5">
                                      <select
                                        value={m.channel || ""}
                                        onChange={(e) => {
                                          const val = e.target.value || null;
                                          updateMetricField(i, "channel", val as any);
                                          api.patch(`/metrics/definitions/${m.metric_id}`, {
                                            channel: val,
                                          }).then(() => {
                                            queryClient.invalidateQueries({ queryKey: ["scorecard-templates"] });
                                          });
                                        }}
                                        className={cn(
                                          "text-xs px-2 py-1 rounded border border-input bg-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring",
                                          !m.channel && "text-red-600 border-red-300"
                                        )}
                                      >
                                        <option value="">-- Undefined --</option>
                                        <option value="voice">Voice</option>
                                        <option value="chat">Chat</option>
                                        <option value="email">Email</option>
                                        <option value="non_channel">Non-Channel</option>
                                        <option value="channel">Channel</option>
                                      </select>
                                    </td>

                                    {/* Weight */}
                                    <td className="px-4 py-2.5">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        value={m._weight}
                                        onChange={(e) => updateMetricField(i, "_weight", e.target.value)}
                                        className="w-20 border border-input rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                      />
                                    </td>

                                    {/* Direction */}
                                    <td className="px-4 py-2.5">
                                      <select
                                        value={m.direction}
                                        onChange={(e) => {
                                          updateMetricField(i, "direction", e.target.value);
                                          api.patch(`/metrics/definitions/${m.metric_id}`, {
                                            direction: e.target.value,
                                          }).then(() => {
                                            queryClient.invalidateQueries({ queryKey: ["scorecard-templates"] });
                                          });
                                        }}
                                        className={cn(
                                          "text-xs px-2 py-1 rounded border border-input bg-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring",
                                          m.direction === "higher_better" ? "text-emerald-700" :
                                          m.direction === "lower_better" ? "text-amber-700" :
                                          "text-red-500"
                                        )}
                                      >
                                        {(m.direction === "undefined" || !m.direction) && (
                                          <option value="undefined">-- Select --</option>
                                        )}
                                        <option value="higher_better">Higher ▲</option>
                                        <option value="lower_better">Lower ▼</option>
                                      </select>
                                    </td>

                                    {/* Include in Score */}
                                    <td className="px-4 py-2.5">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={m.include_in_score}
                                          onChange={(e) => updateMetricField(i, "include_in_score", e.target.checked)}
                                          className="h-4 w-4 rounded border-input accent-primary"
                                        />
                                        <span className={cn("text-xs px-2 py-0.5 rounded select-none", m.include_in_score ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500")}>
                                          {m.include_in_score ? "Yes" : "No"}
                                        </span>
                                      </label>
                                    </td>

                                    {/* Show on Scorecard */}
                                    <td className="px-4 py-2.5">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={m.show_on_scorecard}
                                          onChange={(e) => updateMetricField(i, "show_on_scorecard", e.target.checked)}
                                          className="h-4 w-4 rounded border-input accent-primary"
                                        />
                                        <span className={cn("text-xs px-2 py-0.5 rounded select-none", m.show_on_scorecard ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500")}>
                                          {m.show_on_scorecard ? "Yes" : "No"}
                                        </span>
                                      </label>
                                    </td>

                                    {/* Min Threshold */}
                                    <td className="px-4 py-2.5">
                                      <input
                                        type="number"
                                        step="any"
                                        value={m._min_threshold}
                                        placeholder="—"
                                        onChange={(e) => updateMetricField(i, "_min_threshold", e.target.value)}
                                        className="w-24 border border-input rounded px-2 py-1 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                      />
                                    </td>

                                    {/* Grade Mode */}
                                    <td className="px-4 py-2.5">
                                      <select
                                        value={m.grade_mode ?? "dynamic"}
                                        onChange={(e) => updateMetricField(i, "grade_mode", e.target.value)}
                                        className={cn(
                                          "text-xs px-2 py-1 rounded border border-input bg-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring",
                                          (m.grade_mode ?? "dynamic") === "dynamic" ? "text-blue-700" : "text-purple-700"
                                        )}
                                      >
                                        <option value="dynamic">Dynamic</option>
                                        <option value="manual">Manual</option>
                                      </select>
                                      {(m.grade_mode === "manual") && (
                                        <div className="flex gap-1 mt-1.5">
                                          {(["grade_a", "grade_b", "grade_c", "grade_d"] as const).map((g) => (
                                            <div key={g} className="flex flex-col items-center">
                                              <span className="text-[10px] text-muted-foreground font-medium">
                                                {g.replace("grade_", "").toUpperCase()}
                                              </span>
                                              <input
                                                type="number"
                                                step="any"
                                                value={m.manual_thresholds?.[g] ?? ""}
                                                placeholder="—"
                                                onChange={(e) => {
                                                  const val = e.target.value === "" ? null : Number(e.target.value);
                                                  const updated = { ...m.manual_thresholds, [g]: val };
                                                  updateMetricField(i, "manual_thresholds", updated as Record<string, number>);
                                                }}
                                                className="w-16 border border-input rounded px-1 py-0.5 text-xs bg-background text-center focus:outline-none focus:ring-1 focus:ring-ring"
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>}
                        </div>
                      );
                    });
                })()}
              </div>
            )}

            {/* Bottom save button */}
            {editableMetrics.length > 0 && template && (
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
                {metricsSaved && <SuccessBanner message="Metrics saved" />}
                <SaveButton
                  isPending={metricsMutation.isPending}
                  onClick={handleSaveMetrics}
                  label="Save Metrics"
                />
              </div>
            )}
          </div>
        )}

        {/* ── Grade Scales tab (read-only) ─────────────────────────────────── */}
        {activeTab === "grades" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Grade Scale Configuration</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Toggle between Dynamic (auto-calculated from group stats) and Manual (fixed thresholds) grade scales per metric.
            </p>
            {gradeScales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No grade scales configured yet.</p>
            ) : (
              <div className="max-w-md space-y-2">
                {gradeScales.map((gs, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 rounded-lg border border-border"
                  >
                    <span className="text-lg font-bold w-8">{gs.grade}</span>
                    <span className="text-sm text-muted-foreground">
                      {gs.min_score} – {gs.max_score}
                    </span>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        gs.dynamic ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {gs.dynamic ? "Dynamic" : "Manual"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Score Weights tab ────────────────────────────────────────────── */}
        {activeTab === "weights" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Final Score Weights</h3>
            <div className="max-w-md space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium">Channel Weight</label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={channelWeight}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setChannelWeight(v);
                      setNonChannelWeight(100 - v);
                    }}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono w-12 text-right">{channelWeight}%</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Non-Channel Weight</label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={nonChannelWeight}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setNonChannelWeight(v);
                      setChannelWeight(100 - v);
                    }}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono w-12 text-right">{nonChannelWeight}%</span>
                </div>
              </div>
              <div
                className={cn(
                  "flex items-center gap-2 text-sm px-3 py-2 rounded-lg",
                  weightValid ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"
                )}
              >
                Total: {totalWeight}% &mdash; {weightValid ? "Valid" : "Must equal 100%"}
              </div>
              {weightsSaved && <SuccessBanner message="Weights saved successfully" />}
              {template && (
                <SaveButton
                  isPending={updateMutation.isPending}
                  onClick={handleSaveWeights}
                  label="Save Weights"
                  disabled={!weightValid}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Outlier Settings tab ─────────────────────────────────────────── */}
        {activeTab === "outliers" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Outlier Settings</h3>
            <div className="max-w-md space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium">Outlier Removal Method</label>
                <select
                  value={outlierMethod}
                  onChange={(e) => setOutlierMethod(e.target.value)}
                  className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="iqr">IQR (Recommended)</option>
                  <option value="none">None</option>
                  <option value="2_std_dev">2 Std Dev</option>
                  <option value="3_std_dev">3 Std Dev</option>
                  <option value="percentile_5">Percentile Trim (5%)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">IQR Multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  value={iqrMultiplier}
                  onChange={(e) => setIqrMultiplier(Number(e.target.value))}
                  className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Standard: 1.5 | Strict: 1.0 | Lenient: 2.0
                </p>
              </div>
              {outliersSaved && <SuccessBanner message="Outlier settings saved" />}
              {template && (
                <SaveButton
                  isPending={updateMutation.isPending}
                  onClick={handleSaveOutliers}
                  label="Save Outlier Settings"
                />
              )}
            </div>
          </div>
        )}

        {/* ── Productivity States tab (read-only) ──────────────────────────── */}
        {activeTab === "productivity" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Productivity State Configuration</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Define which activity states count as productive time.
            </p>
            {productivityStates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No productivity states configured. They will be loaded from the scorecard template.
              </p>
            ) : (
              <div className="space-y-2">
                {productivityStates.map((state) => (
                  <div
                    key={state.name}
                    className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{state.name}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {state.category}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded",
                        state.productive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      )}
                    >
                      {state.productive ? "Productive" : "Non-Productive"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PFP Rates tab ────────────────────────────────────────────────── */}
        {activeTab === "pfp" && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-semibold">Pay for Performance Rates</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Set the dollar amount per logged-in hour for each grade level.
                </p>
              </div>
              {template && (
                <div className="flex items-center gap-3">
                  {pfpSaved && <SuccessBanner message="PFP rates saved" />}
                  <SaveButton
                    isPending={pfpMutation.isPending}
                    onClick={handleSavePfp}
                    label="Save PFP Rates"
                  />
                </div>
              )}
            </div>

            <div className="max-w-sm space-y-3">
              {pfpGrades.map(({ label, key, color }) => (
                <div
                  key={key}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3 rounded-lg border border-border border-l-4",
                    color
                  )}
                >
                  <span className="text-lg font-bold w-8">{label}</span>
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-muted-foreground text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pfpRates[key]}
                      onChange={(e) =>
                        setPfpRates((prev) => ({
                          ...prev,
                          [key]: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-28 border border-input rounded px-2 py-1 text-sm bg-background font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">/ logged hour</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
