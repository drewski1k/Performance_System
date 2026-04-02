import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileBarChart, Download, TrendingUp, Loader2 } from "lucide-react";
import api from "../api/client";
import { usePeriod } from "@/hooks/usePeriod";

interface AgentScore {
  agent_id: string;
  agent_name: string;
  strengths: string[];
  opportunities: string[];
}

interface AggItem {
  label: string;
  count: number;
}

export default function ReportsPage() {
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

  const { strengths, opportunities } = useMemo(() => {
    const sCounts: Record<string, number> = {};
    const oCounts: Record<string, number> = {};
    for (const a of agents) {
      for (const s of a.strengths ?? []) {
        sCounts[s] = (sCounts[s] || 0) + 1;
      }
      for (const o of a.opportunities ?? []) {
        oCounts[o] = (oCounts[o] || 0) + 1;
      }
    }
    const toSorted = (map: Record<string, number>): AggItem[] =>
      Object.entries(map)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    return { strengths: toSorted(sCounts), opportunities: toSorted(oCounts) };
  }, [agents]);

  const hasData = agents.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Strength/opportunity analysis, trends, and comparisons
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
            <Download className="h-4 w-4" />
            Export PDF
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
            <Download className="h-4 w-4" />
            Export Excel
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-semibold">Strengths</h3>
                {strengths.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {strengths.length} metrics
                  </span>
                )}
              </div>
              {!hasData || strengths.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Import data and run scoring to see strength analysis.
                </p>
              ) : (
                <div className="space-y-2">
                  {strengths.slice(0, 10).map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        {s.label}
                      </div>
                      <span className="text-xs text-emerald-500">{s.count} agents</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-amber-600 rotate-180" />
                <h3 className="text-sm font-semibold">Opportunities</h3>
                {opportunities.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {opportunities.length} metrics
                  </span>
                )}
              </div>
              {!hasData || opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Import data and run scoring to see opportunity analysis.
                </p>
              ) : (
                <div className="space-y-2">
                  {opportunities.slice(0, 10).map((o) => (
                    <div
                      key={o.label}
                      className="flex items-center justify-between text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 rotate-180" />
                        {o.label}
                      </div>
                      <span className="text-xs text-amber-500">{o.count} agents</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <FileBarChart className="h-5 w-5 text-blue-600" />
              <h3 className="text-sm font-semibold">Trend Analysis</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Score trends across periods will appear here after multiple cycles of data are imported.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
