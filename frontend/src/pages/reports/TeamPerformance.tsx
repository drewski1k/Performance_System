import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, Building2 } from "lucide-react";
import api from "@/api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { cn, gradeColorSolid, formatNumber } from "@/lib/utils";

const GRADE_ORDER = ["A", "B", "C", "D", "F"];

const GRADE_BAR_COLORS: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-green-500",
  C: "bg-yellow-500",
  D: "bg-orange-500",
  F: "bg-red-500",
};

interface TeamRow {
  group_name: string;
  headcount: number;
  avg_score: number | null;
  grade_distribution: Record<string, number>;
}

type GroupBy = "supervisor" | "site";

export default function TeamPerformance() {
  const { periodId } = usePeriod();
  const [groupBy, setGroupBy] = useState<GroupBy>("supervisor");

  const { data: teams, isLoading } = useQuery<TeamRow[]>({
    queryKey: ["reports-teams", periodId, groupBy],
    queryFn: async () => {
      const res = await api.get("/reports/teams", {
        params: { period_id: periodId, group_by: groupBy },
      });
      return res.data;
    },
    enabled: !!periodId,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Team Performance</h1>
        <p className="text-muted-foreground text-sm mt-1">Compare groups by site or supervisor</p>
      </div>

      {/* Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setGroupBy("supervisor")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
            groupBy === "supervisor"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border hover:bg-muted",
          )}
        >
          <Users className="h-4 w-4" />
          By Supervisor
        </button>
        <button
          onClick={() => setGroupBy("site")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
            groupBy === "site"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border hover:bg-muted",
          )}
        >
          <Building2 className="h-4 w-4" />
          By Site
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !teams || teams.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    {groupBy === "supervisor" ? "Supervisor" : "Site"}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Headcount</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Avg Score</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[200px]">
                    Grade Distribution
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teams.map((team) => {
                  const total = GRADE_ORDER.reduce(
                    (s, g) => s + (team.grade_distribution[g] ?? 0),
                    0,
                  );
                  return (
                    <tr key={team.group_name} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{team.group_name}</td>
                      <td className="px-4 py-3 text-right">{team.headcount}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(team.avg_score)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 flex-1 rounded-full overflow-hidden">
                            {GRADE_ORDER.map((g) => {
                              const count = team.grade_distribution[g] ?? 0;
                              if (count === 0) return null;
                              const pct = (count / Math.max(total, 1)) * 100;
                              return (
                                <div
                                  key={g}
                                  className={cn("h-full", GRADE_BAR_COLORS[g])}
                                  style={{ width: `${pct}%` }}
                                  title={`${g}: ${count}`}
                                />
                              );
                            })}
                          </div>
                          <div className="flex gap-1">
                            {GRADE_ORDER.map((g) => {
                              const count = team.grade_distribution[g] ?? 0;
                              if (count === 0) return null;
                              return (
                                <span
                                  key={g}
                                  className={cn(
                                    "px-2 py-0.5 rounded-full text-xs font-semibold",
                                    gradeColorSolid(g),
                                  )}
                                >
                                  {g}:{count}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
