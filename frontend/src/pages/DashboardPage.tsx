import { useQuery } from "@tanstack/react-query";
import { BarChart3, Users, TrendingUp, DollarSign, Loader2 } from "lucide-react";
import api from "../api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { gradeColor, formatNumber, formatCurrency } from "@/lib/utils";

interface DashboardSummary {
  period: { id: string; label: string; start_date: string; end_date: string };
  kpi: {
    avg_score: number | null;
    agents_graded: number;
    a_grade_rate: number;
    total_pfp_payout: number;
    total_money_left: number;
  };
  grade_distribution: Record<string, number>;
  top_agents: {
    agent_id: string;
    name: string;
    score: number | null;
    grade: string | null;
    rank: number;
  }[];
  recent_periods: { id: string; label: string; start_date: string; end_date: string }[];
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
  const { periodId, setPeriodId, setPeriods } = usePeriod();

  const { data, isLoading, isError } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", periodId],
    queryFn: async () => {
      const params = periodId ? { period_id: periodId } : {};
      const res = await api.get("/dashboard/summary", { params });
      // Update period context with data from API
      const d = res.data as DashboardSummary;
      if (d.recent_periods?.length) {
        setPeriods(d.recent_periods);
        if (!periodId) setPeriodId(d.period.id);
      }
      return d;
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Performance overview across all agents
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            No scoring data yet. Import HC Data and Combined Data from the Import page, then scores will appear here.
          </p>
        </div>
      </div>
    );
  }

  const { kpi, top_agents, grade_distribution, period } = data;
  const hasData = kpi.agents_graded > 0;

  // Convert grade_distribution object to sorted array
  const gradeOrder = ["A", "B", "C", "D", "F"];
  const totalGraded = Object.values(grade_distribution).reduce((a, b) => a + b, 0);
  const gradeDist = gradeOrder.map((grade) => ({
    grade,
    count: grade_distribution[grade] ?? 0,
    pct: totalGraded > 0 ? ((grade_distribution[grade] ?? 0) / totalGraded) * 100 : 0,
  }));

  const aCount = grade_distribution["A"] ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Performance overview across all agents
          {period ? ` — ${period.label}` : ""}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Avg Final Score"
          value={hasData && kpi.avg_score != null ? formatNumber(kpi.avg_score) : "-"}
          subtitle={hasData ? `${kpi.agents_graded} agents scored` : "No scores yet"}
          icon={BarChart3}
          color="bg-blue-50 text-blue-600"
        />
        <KpiCard
          title="Agents Graded"
          value={String(kpi.agents_graded)}
          subtitle={hasData ? "across all sites" : "Import data to begin"}
          icon={Users}
          color="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="A Grade Rate"
          value={hasData ? `${kpi.a_grade_rate}%` : "-"}
          subtitle={hasData ? `${aCount} agents at A level` : "No grades yet"}
          icon={TrendingUp}
          color="bg-green-50 text-green-600"
        />
        <KpiCard
          title="Total PFP Payout"
          value={hasData ? formatCurrency(kpi.total_pfp_payout) : "$0.00"}
          subtitle={hasData ? `${formatCurrency(kpi.total_money_left)} left on table` : "No payouts yet"}
          icon={DollarSign}
          color="bg-yellow-50 text-yellow-600"
        />
      </div>

      {/* Rankings + Grade Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-6 shadow-sm min-h-[300px]">
          <h3 className="text-sm font-semibold mb-4">Top Agents</h3>
          {top_agents.length === 0 ? (
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {top_agents.map((agent, idx) => (
                    <tr key={agent.agent_id}>
                      <td className="py-2.5 text-muted-foreground">{agent.rank ?? idx + 1}</td>
                      <td className="py-2.5 font-medium">{agent.name}</td>
                      <td className="py-2.5">{agent.score != null ? formatNumber(agent.score) : "-"}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${gradeColor(agent.grade)}`}
                        >
                          {agent.grade ?? "-"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">Grade Distribution</h3>
          {!hasData ? (
            <p className="text-sm text-muted-foreground">No grade data available.</p>
          ) : (
            <div className="space-y-3">
              {gradeDist.map((g) => (
                <div key={g.grade} className="flex items-center gap-3">
                  <span className="text-sm font-semibold w-6">{g.grade}</span>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${GRADE_COLORS[g.grade] ?? "bg-gray-400"} rounded-full transition-all`}
                      style={{ width: `${Math.max(g.pct, 1)}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    {g.count} ({formatNumber(g.pct)}%)
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
