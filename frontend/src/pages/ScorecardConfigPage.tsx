import { Settings, Scale, Percent, Filter, Zap, DollarSign, Loader2, Save, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

const tabs = [
  { key: "metrics", label: "Metrics", icon: Settings },
  { key: "grades", label: "Grade Scales", icon: Scale },
  { key: "weights", label: "Score Weights", icon: Percent },
  { key: "outliers", label: "Outlier Settings", icon: Filter },
  { key: "productivity", label: "Productivity States", icon: Zap },
  { key: "pfp", label: "PFP Rates", icon: DollarSign },
];

interface MetricConfig {
  metric_name: string;
  channel: string | null;
  weight: number;
  direction: string;
  include_in_score: boolean;
  show_on_scorecard: boolean;
  min_threshold: number | null;
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
  metrics: MetricConfig[];
  grade_scales: GradeScale[];
  pfp_rates: PfpRate[];
  productivity_states: ProductivityState[];
}

export default function ScorecardConfigPage() {
  const [activeTab, setActiveTab] = useState("metrics");
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["scorecard-templates"],
    queryFn: async () => {
      const res = await api.get("/scorecards/templates");
      return res.data;
    },
  });

  const template = templates?.[0] ?? null;

  // Local editable state
  const [channelWeight, setChannelWeight] = useState(0);
  const [nonChannelWeight, setNonChannelWeight] = useState(100);
  const [outlierMethod, setOutlierMethod] = useState("iqr");
  const [iqrMultiplier, setIqrMultiplier] = useState(1.5);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (template) {
      setChannelWeight(template.channel_weight ?? 0);
      setNonChannelWeight(template.non_channel_weight ?? 100);
      setOutlierMethod(template.outlier_method ?? "iqr");
      setIqrMultiplier(template.iqr_multiplier ?? 1.5);
    }
  }, [template]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Template>) => {
      if (!template) return;
      const res = await api.put(`/scorecards/templates/${template.id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scorecard-templates"] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
  });

  function handleSaveWeights() {
    updateMutation.mutate({
      channel_weight: channelWeight,
      non_channel_weight: nonChannelWeight,
    });
  }

  function handleSaveOutliers() {
    updateMutation.mutate({
      outlier_method: outlierMethod,
      iqr_multiplier: iqrMultiplier,
    });
  }

  const totalWeight = channelWeight + nonChannelWeight;
  const weightValid = totalWeight === 100;

  const metrics = template?.metrics ?? [];
  const gradeScales = template?.grade_scales ?? [];
  const pfpRates = template?.pfp_rates ?? [];
  const productivityStates = template?.productivity_states ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scorecard Configuration</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure metrics, weights, grade scales, and scoring rules
          {template ? ` - ${template.name}` : ""}
        </p>
      </div>

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

      {/* Save success banner */}
      {saveSuccess && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-4 py-2 rounded-lg">
          <CheckCircle2 className="h-4 w-4" />
          Changes saved successfully
        </div>
      )}

      {/* Tab Content */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        {activeTab === "metrics" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Metric Configuration</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Configure which metrics are included in scoring, shown on the scorecard, and their weights per channel.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-muted-foreground">Metric</th>
                    <th className="pb-3 font-medium text-muted-foreground">Channel</th>
                    <th className="pb-3 font-medium text-muted-foreground">Weight %</th>
                    <th className="pb-3 font-medium text-muted-foreground">Direction</th>
                    <th className="pb-3 font-medium text-muted-foreground">Include in Score</th>
                    <th className="pb-3 font-medium text-muted-foreground">Show on Scorecard</th>
                    <th className="pb-3 font-medium text-muted-foreground">Min Threshold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {metrics.length === 0 ? (
                    <tr className="text-muted-foreground">
                      <td colSpan={7} className="py-8 text-center">
                        Create a scorecard template to configure metrics
                      </td>
                    </tr>
                  ) : (
                    metrics.map((m, i) => (
                      <tr key={i}>
                        <td className="py-2.5 font-medium">{m.metric_name}</td>
                        <td className="py-2.5 text-muted-foreground">{m.channel ?? "All"}</td>
                        <td className="py-2.5">{m.weight}%</td>
                        <td className="py-2.5">
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded",
                              m.direction === "higher_is_better"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            )}
                          >
                            {m.direction === "higher_is_better" ? "Higher" : "Lower"}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded",
                              m.include_in_score
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-gray-100 text-gray-500"
                            )}
                          >
                            {m.include_in_score ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded",
                              m.show_on_scorecard
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-gray-100 text-gray-500"
                            )}
                          >
                            {m.show_on_scorecard ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {m.min_threshold != null ? m.min_threshold : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                      {gs.min_score} - {gs.max_score}
                    </span>
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        gs.dynamic
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
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
                  weightValid
                    ? "text-emerald-600 bg-emerald-50"
                    : "text-red-600 bg-red-50"
                )}
              >
                Total: {totalWeight}% &mdash; {weightValid ? "Valid" : "Must equal 100%"}
              </div>
              {template && (
                <button
                  onClick={handleSaveWeights}
                  disabled={!weightValid || updateMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Weights
                </button>
              )}
            </div>
          </div>
        )}

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
              {template && (
                <button
                  onClick={handleSaveOutliers}
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Outlier Settings
                </button>
              )}
            </div>
          </div>
        )}

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
                    <div className="flex items-center gap-2">
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "pfp" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Pay for Performance Rates</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Set the dollar amount per logged-in hour for each grade level.
            </p>
            {pfpRates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No PFP rates configured. They will be loaded from the scorecard template.
              </p>
            ) : (
              <div className="max-w-sm space-y-3">
                {pfpRates.map((g) => {
                  const colorMap: Record<string, string> = {
                    A: "border-l-emerald-500",
                    B: "border-l-green-500",
                    C: "border-l-yellow-500",
                    D: "border-l-orange-500",
                    F: "border-l-red-500",
                  };
                  return (
                    <div
                      key={g.grade}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3 rounded-lg border border-border border-l-4",
                        colorMap[g.grade] ?? "border-l-gray-400"
                      )}
                    >
                      <span className="text-lg font-bold w-8">{g.grade}</span>
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-muted-foreground">$</span>
                        <span className="text-sm font-mono">
                          {g.rate_per_hour.toFixed(2)}
                        </span>
                        <span className="text-sm text-muted-foreground">/ logged hour</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
