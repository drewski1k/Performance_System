import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Target } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import api from "@/api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { cn, formatNumber } from "@/lib/utils";

interface MetricOption {
  key: string;
  label: string;
}

interface DistBin {
  bin: string;
  count: number;
}

interface AgentMetricEntry {
  agent_id: string;
  name: string;
  value: number | null;
}

interface GroupComparison {
  group_name: string;
  avg_value: number | null;
}

interface MetricAnalysis {
  metric_key: string;
  metric_label: string;
  mean: number | null;
  std_dev: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  count: number;
  distribution: DistBin[];
  top_10: AgentMetricEntry[];
  bottom_10: AgentMetricEntry[];
  by_group: GroupComparison[];
}

export default function MetricExplorer() {
  const { periodId } = usePeriod();
  const [selectedMetric, setSelectedMetric] = useState<string>("");

  const { data: metrics } = useQuery<MetricOption[]>({
    queryKey: ["reports-metric-options"],
    queryFn: async () => {
      const res = await api.get("/reports/metrics");
      return res.data;
    },
  });

  // Auto-select first metric when available
  const effectiveMetric = selectedMetric || metrics?.[0]?.key || "";

  const { data: analysis, isLoading } = useQuery<MetricAnalysis>({
    queryKey: ["reports-metric-analysis", effectiveMetric, periodId],
    queryFn: async () => {
      const res = await api.get(`/reports/metrics/${effectiveMetric}/analysis`, {
        params: { period_id: periodId },
      });
      return res.data;
    },
    enabled: !!periodId && !!effectiveMetric,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Metric Explorer</h1>
        <p className="text-muted-foreground text-sm mt-1">Deep-dive into any metric</p>
      </div>

      {/* Metric Selector */}
      <div className="flex items-center gap-3">
        <Target className="h-5 w-5 text-muted-foreground" />
        <select
          value={effectiveMetric}
          onChange={(e) => setSelectedMetric(e.target.value)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium bg-card hover:bg-muted transition-colors"
        >
          {metrics?.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          )) ?? (
            <option value="">Loading metrics...</option>
          )}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !analysis ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: "Mean", value: formatNumber(analysis.mean) },
              { label: "Std Dev", value: formatNumber(analysis.std_dev) },
              { label: "Median", value: formatNumber(analysis.median) },
              { label: "Min", value: formatNumber(analysis.min) },
              { label: "Max", value: formatNumber(analysis.max) },
              { label: "Count", value: String(analysis.count) },
            ].map((stat) => (
              <div key={stat.label} className="bg-card rounded-xl border border-border p-4 shadow-sm text-center">
                <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                <p className="text-lg font-bold">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Distribution Histogram */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <h3 className="text-sm font-semibold mb-4">Distribution</h3>
            {analysis.distribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analysis.distribution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bin" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {analysis.distribution.map((_, i) => (
                      <Cell key={i} fill="#8b5cf6" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No data available</p>
            )}
          </div>

          {/* Top / Bottom 10 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <h3 className="text-sm font-semibold mb-4 text-emerald-600">Top 10</h3>
              {analysis.top_10.length > 0 ? (
                <div className="space-y-1">
                  {analysis.top_10.map((agent, idx) => (
                    <div
                      key={agent.agent_id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}</span>
                        <span className="text-sm font-medium">{agent.name}</span>
                      </div>
                      <span className="text-sm font-semibold">{formatNumber(agent.value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data available</p>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <h3 className="text-sm font-semibold mb-4 text-red-600">Bottom 10</h3>
              {analysis.bottom_10.length > 0 ? (
                <div className="space-y-1">
                  {analysis.bottom_10.map((agent, idx) => (
                    <div
                      key={agent.agent_id}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}</span>
                        <span className="text-sm font-medium">{agent.name}</span>
                      </div>
                      <span className="text-sm font-semibold">{formatNumber(agent.value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data available</p>
              )}
            </div>
          </div>

          {/* By-Group Comparison */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <h3 className="text-sm font-semibold mb-4">By-Group Comparison</h3>
            {analysis.by_group.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={analysis.by_group}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="group_name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="avg_value" radius={[4, 4, 0, 0]}>
                    {analysis.by_group.map((_, i) => (
                      <Cell key={i} fill="#6366f1" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No data available</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
