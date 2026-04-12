import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Lightbulb } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import api from "@/api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { formatNumber } from "@/lib/utils";

interface ImpactAgent {
  agent_id: string;
  name: string;
  impact: number;
}

interface ImpactData {
  total_positive_impact: number;
  total_negative_impact: number;
  net_impact: number;
  what_if_gain: number;
  what_if_agent_count: number;
  top_positive: ImpactAgent[];
  top_negative: ImpactAgent[];
}

export default function BusinessImpact() {
  const { periodId } = usePeriod();

  const { data, isLoading } = useQuery<ImpactData>({
    queryKey: ["reports-impact", periodId],
    queryFn: async () => {
      const res = await api.get("/reports/impact", { params: { period_id: periodId } });
      return res.data;
    },
    enabled: !!periodId,
  });

  // Merge top positive and top negative for a combined chart
  const chartData = data
    ? [
        ...data.top_positive.map((a) => ({ name: a.name, impact: a.impact })),
        ...data.top_negative.map((a) => ({ name: a.name, impact: a.impact })),
      ].sort((a, b) => b.impact - a.impact)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Business Impact</h1>
        <p className="text-muted-foreground text-sm mt-1">Score impact analysis and what-if scenarios</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Total Positive Impact</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-emerald-600">
                +{formatNumber(data.total_positive_impact)}
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Total Negative Impact</span>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-600">
                {formatNumber(data.total_negative_impact)}
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Net Impact</span>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className={`text-2xl font-bold ${data.net_impact >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {data.net_impact >= 0 ? "+" : ""}{formatNumber(data.net_impact)}
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">What-If Gain</span>
                <Lightbulb className="h-4 w-4 text-yellow-500" />
              </div>
              <p className="text-2xl font-bold text-yellow-600">
                +{formatNumber(data.what_if_gain)}
              </p>
            </div>
          </div>

          {/* Impact Bar Chart */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <h3 className="text-sm font-semibold mb-4">Top Positive & Negative Impact Agents</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={130} />
                  <Tooltip />
                  <ReferenceLine x={0} className="stroke-border" />
                  <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.impact >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No data available</p>
            )}
          </div>

          {/* What-If Section */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              <h3 className="text-sm font-semibold">What-If Scenario</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              If all D/F agents moved to C grade, the organization would gain{" "}
              <span className="font-semibold text-foreground">
                {formatNumber(data.what_if_gain)}
              </span>{" "}
              total score points across{" "}
              <span className="font-semibold text-foreground">
                {data.what_if_agent_count}
              </span>{" "}
              agents.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
