import { useQuery } from "@tanstack/react-query";
import { BarChart3, Users, TrendingUp, DollarSign, Loader2 } from "lucide-react";
import api from "../api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { gradeColor, formatNumber, formatCurrency } from "@/lib/utils";

interface KpiData {
  avg_final_score: number | null;
  agents_graded: number | null;
  total_agents: number | null;
  a_grade_count: number | null;
  a_grade_pct: number | null;
  total_pfp_payout: number | null;
  pfp_money_left: number | null;
}

interface GradeDistItem {
  grade: string;
  count: number;
  pct: number;
}

interface TopAgent {
  agent_name: string;
  final_score: number | null;
  grade: string | null;
  supervisor_name: string | null;
}

interface DashboardSummary {
  period: { id: string; label: string } | null;
  kpi: KpiData | null;
  grade_distribution: GradeDistItem[];
  top_agents: TopAgent[];
  recent_periods: { id: string; label: string }[];
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-green-500",
  C: "bg-yellow-500",
  D: "bg-orange-500",
  F: "bg-red-500",
};

export default function DashboardPage() {
  const { periodId } = usePeriod();

  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", periodId],
    queryFn: async () => {
      const params = periodId ? { period_id: periodId } : {};
      const res = await api.get("/dashboard/summary", { params });
      return res.data;
    },
  });

  const kpi = data?.kpi;
  const gradeDist = data?.grade_distribution ?? [];
  const topAgents = data?.top_agents ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasData = kpi && kpi.agents_graded != null && kpi.agents_graded > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Performance overview across all agents
          {data?.period ? ` - ${data.period.label}` : ""}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Avg Final Score"
          value={hasData ? formatNumber(kpi.avg_final_score) : "-"}
          subtitle={hasData ? `${kpi.agents_graded} agents scored` : "No scores yet"}
          icon={BarChart3}
          color="bg-blue-50 text-blue-600"
        />
        <KpiCard
          title="Agents Graded"
          value={hasData ? String(kpi.agents_graded) : "0"}
          subtitle={hasData ? `of ${kpi.total_agents ?? "?"} total agents` : "Import data to begin"}
          icon={Users}
          color="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="A Grade Rate"
          value={hasData && kpi.a_grade_pct != null ? `${formatNumber(kpi.a_grade_pct)}%` : "-"}
          subtitle={hasData ? `${kpi.a_grade_count ?? 0} agents at A level` : "No grades yet"}
          icon={TrendingUp}
          color="bg-green-50 text-green-600"
        />
        <KpiCard
          title="Total PFP Payout"
          value={hasData ? formatCurrency(kpi.total_pfp_payout) : "$0.00"}
          subtitle={hasData ? `${formatCurrency(kpi.pfp_money_left)} left on table` : "No payouts yet"}
          icon={DollarSign}
          color="bg-yellow-50 text-yellow-600"
        />
      </div>

      {/* Rankings + Grade Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-6 shadow-sm min-h-[300px]">
          <h3 className="text-sm font-semibold mb-4">Top Agents</h3>
          {topAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Import data and configure your scorecard to see rankings here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-muted-foreground w-10">#</th>
                    <th className="pb-3 font-medium text-muted-foreground">Agent</th>
                    <th className="pb-3 font-medium text-muted-foreground">Score</th>
                    <th className="pb-3 font-medium text-muted-foreground">Grade</th>
                    <th className="pb-3 font-medium text-muted-foreground">Supervisor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topAgents.map((agent, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 text-muted-foreground">{idx + 1}</td>
                      <td className="py-2.5 font-medium">{agent.agent_name}</td>
                      <td className="py-2.5">{formatNumber(agent.final_score)}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${gradeColor(agent.grade)}`}
                        >
                          {agent.grade ?? "-"}
                        </span>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{agent.supervisor_name ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">Grade Distribution</h3>
          {gradeDist.length === 0 ? (
            <p className="text-sm text-muted-foreground">No grade data available.</p>
          ) : (
            <div className="space-y-3">
              {gradeDist.map((g) => (
                <div key={g.grade} className="flex items-center gap-3">
                  <span className="text-sm font-semibold w-6">{g.grade}</span>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${GRADE_COLORS[g.grade] ?? "bg-gray-400"} rounded-full transition-all`}
                      style={{ width: `${g.pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-10 text-right">
                    {formatNumber(g.pct)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
