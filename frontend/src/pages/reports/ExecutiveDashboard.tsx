import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowUpRight, ArrowDownRight, Users, BarChart3, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from "recharts";
import api from "@/api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { cn, gradeColorSolid, formatNumber } from "@/lib/utils";

const GRADE_COLORS: Record<string, string> = {
  A: "#10b981",
  B: "#22c55e",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
};

const GRADE_ORDER = ["A", "B", "C", "D", "F"];

interface SummaryData {
  total_agents: number;
  avg_score: number | null;
  grade_distribution: Record<string, number>;
  below_c_count: number;
  prev_avg_score?: number | null;
  prev_total_agents?: number | null;
  prev_below_c_count?: number | null;
}

interface TrendPeriod {
  period_label: string;
  A: number;
  B: number;
  C: number;
  D: number;
  F: number;
  avg_score: number | null;
}

interface ScoreBin {
  bin: string;
  count: number;
}

interface AgentEntry {
  agent_id: string;
  name: string;
  score: number | null;
  grade: string | null;
  rank: number;
}

interface TopBottomData {
  top: AgentEntry[];
  bottom: AgentEntry[];
}

export default function ExecutiveDashboard() {
  const { periodId } = usePeriod();
  const navigate = useNavigate();

  const { data: summary, isLoading: loadingSummary } = useQuery<SummaryData>({
    queryKey: ["reports-summary", periodId],
    queryFn: async () => {
      const res = await api.get("/reports/summary", { params: { period_id: periodId } });
      return res.data;
    },
    enabled: !!periodId,
  });

  const { data: trends } = useQuery<TrendPeriod[]>({
    queryKey: ["reports-trends"],
    queryFn: async () => {
      const res = await api.get("/reports/trends");
      return res.data;
    },
  });

  const { data: distribution } = useQuery<ScoreBin[]>({
    queryKey: ["reports-score-distribution", periodId],
    queryFn: async () => {
      const res = await api.get("/reports/score-distribution", { params: { period_id: periodId } });
      return res.data;
    },
    enabled: !!periodId,
  });

  const { data: topBottom } = useQuery<TopBottomData>({
    queryKey: ["reports-top-bottom", periodId],
    queryFn: async () => {
      const res = await api.get("/reports/top-bottom", { params: { period_id: periodId } });
      return res.data;
    },
    enabled: !!periodId,
  });

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const gradeDist = summary
    ? GRADE_ORDER.map((g) => ({
        grade: g,
        count: summary.grade_distribution[g] ?? 0,
      }))
    : [];

  const totalGraded = gradeDist.reduce((s, g) => s + g.count, 0);

  function DeltaBadge({ current, previous }: { current: number | null; previous?: number | null }) {
    if (current == null || previous == null) return null;
    const delta = current - previous;
    if (delta === 0) return null;
    const positive = delta > 0;
    return (
      <span className={cn("flex items-center gap-0.5 text-xs font-medium", positive ? "text-emerald-600" : "text-red-600")}>
        {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {positive ? "+" : ""}{formatNumber(delta)}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Executive Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">KPIs, grade distribution, and trends</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Total Agents</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{summary?.total_agents ?? "-"}</p>
          <DeltaBadge current={summary?.total_agents ?? null} previous={summary?.prev_total_agents} />
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Avg Score</span>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{formatNumber(summary?.avg_score ?? null)}</p>
          <DeltaBadge current={summary?.avg_score ?? null} previous={summary?.prev_avg_score} />
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Grade Distribution</span>
          </div>
          <div className="flex h-6 rounded-full overflow-hidden mt-1">
            {gradeDist.map((g) =>
              g.count > 0 ? (
                <div
                  key={g.grade}
                  className="h-full transition-all"
                  style={{
                    width: `${(g.count / Math.max(totalGraded, 1)) * 100}%`,
                    backgroundColor: GRADE_COLORS[g.grade],
                  }}
                  title={`${g.grade}: ${g.count}`}
                />
              ) : null,
            )}
          </div>
          <div className="flex gap-2 mt-2">
            {gradeDist.map((g) => (
              <span key={g.grade} className="text-xs text-muted-foreground">
                {g.grade}:{g.count}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Below C Grade</span>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </div>
          <p className="text-2xl font-bold">{summary?.below_c_count ?? "-"}</p>
          <DeltaBadge current={summary?.below_c_count ?? null} previous={summary?.prev_below_c_count} />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grade Distribution by Period */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">Grade Distribution by Period</h3>
          {trends && trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period_label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {GRADE_ORDER.map((grade) => (
                  <Bar key={grade} dataKey={grade} stackId="grades" fill={GRADE_COLORS[grade]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No data available</p>
          )}
        </div>

        {/* Score Distribution Histogram */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">Score Distribution</h3>
          {distribution && distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="bin" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {distribution.map((_, index) => (
                    <Cell key={index} fill="#6366f1" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No data available</p>
          )}
        </div>
      </div>

      {/* Top / Bottom Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4 text-emerald-600">Top 10 Performers</h3>
          {topBottom?.top && topBottom.top.length > 0 ? (
            <div className="space-y-1">
              {topBottom.top.map((agent) => (
                <div
                  key={agent.agent_id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/agents/${agent.agent_id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 text-right">{agent.rank}</span>
                    <span className="text-sm font-medium">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{formatNumber(agent.score)}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", gradeColorSolid(agent.grade))}>
                      {agent.grade}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data available</p>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4 text-red-600">Bottom 10 Performers</h3>
          {topBottom?.bottom && topBottom.bottom.length > 0 ? (
            <div className="space-y-1">
              {topBottom.bottom.map((agent) => (
                <div
                  key={agent.agent_id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/agents/${agent.agent_id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 text-right">{agent.rank}</span>
                    <span className="text-sm font-medium">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{formatNumber(agent.score)}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", gradeColorSolid(agent.grade))}>
                      {agent.grade}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
