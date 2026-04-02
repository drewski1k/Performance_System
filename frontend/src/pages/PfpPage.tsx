import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import api from "../api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { gradeColor, formatCurrency, formatNumber } from "@/lib/utils";

interface AgentScore {
  agent_id: string;
  agent_name: string;
  supervisor_name: string | null;
  grade: string | null;
  final_score: number | null;
  pfp_payout: number | null;
  pfp_money_left: number | null;
  logged_hours: number | null;
  pfp_rate: number | null;
}

export default function PfpPage() {
  const { periodId } = usePeriod();

  const { data: agents = [], isLoading } = useQuery<AgentScore[]>({
    queryKey: ["agent-scores", periodId],
    queryFn: async () => {
      const params = periodId ? { period_id: periodId } : {};
      const res = await api.get("/dashboard/agent-scores", { params });
      return res.data;
    },
    enabled: !!periodId,
  });

  const totals = useMemo(() => {
    let totalPayout = 0;
    let totalLeft = 0;
    let totalHours = 0;
    for (const a of agents) {
      totalPayout += a.pfp_payout ?? 0;
      totalLeft += a.pfp_money_left ?? 0;
      totalHours += a.logged_hours ?? 0;
    }
    const avgRate = totalHours > 0 ? totalPayout / totalHours : 0;
    return { totalPayout, totalLeft, avgRate };
  }, [agents]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay for Performance</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track PFP payouts and money left on the table
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-muted-foreground">Total Payout</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totals.totalPayout)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-muted-foreground">Money Left on Table</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totals.totalLeft)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-muted-foreground">Avg Rate / Hour</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(totals.avgRate)}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="text-sm font-semibold mb-3">Agent PFP Breakdown</h3>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !periodId ? (
          <p className="text-sm text-muted-foreground">
            No scoring data yet. Import data from the Import page to get started.
          </p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Import data and run scoring to see per-agent PFP calculations.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 font-medium text-muted-foreground">Agent</th>
                  <th className="pb-3 font-medium text-muted-foreground">Grade</th>
                  <th className="pb-3 font-medium text-muted-foreground">Score</th>
                  <th className="pb-3 font-medium text-muted-foreground">Rate/Hr</th>
                  <th className="pb-3 font-medium text-muted-foreground">Hours</th>
                  <th className="pb-3 font-medium text-muted-foreground">Payout</th>
                  <th className="pb-3 font-medium text-muted-foreground">Left on Table</th>
                  <th className="pb-3 font-medium text-muted-foreground">Supervisor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agents.map((agent) => (
                  <tr key={agent.agent_id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-2.5 font-medium">{agent.agent_name}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${gradeColor(agent.grade)}`}
                      >
                        {agent.grade ?? "-"}
                      </span>
                    </td>
                    <td className="py-2.5">{formatNumber(agent.final_score)}</td>
                    <td className="py-2.5">{formatCurrency(agent.pfp_rate)}</td>
                    <td className="py-2.5">{formatNumber(agent.logged_hours)}</td>
                    <td className="py-2.5 font-medium text-emerald-600">
                      {formatCurrency(agent.pfp_payout)}
                    </td>
                    <td className="py-2.5 text-amber-600">
                      {formatCurrency(agent.pfp_money_left)}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{agent.supervisor_name ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
