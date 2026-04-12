import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import api from "@/api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { cn, gradeColorSolid, formatNumber } from "@/lib/utils";

interface RankingRow {
  agent_id: string;
  rank: number;
  name: string;
  supervisor: string;
  site: string;
  score: number | null;
  grade: string | null;
  delta: number | null;
  voice_score: number | null;
  chat_score: number | null;
  email_score: number | null;
  non_ch_score: number | null;
}

interface MoverEntry {
  agent_id: string;
  name: string;
  delta: number;
}

interface MoversData {
  improved: MoverEntry[];
  declined: MoverEntry[];
}

type Tab = "rankings" | "movers";

export default function Rankings() {
  const { periodId } = usePeriod();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("rankings");

  const { data: rankings, isLoading: loadingRankings } = useQuery<RankingRow[]>({
    queryKey: ["reports-rankings", periodId],
    queryFn: async () => {
      const res = await api.get("/reports/rankings", { params: { period_id: periodId } });
      return res.data;
    },
    enabled: !!periodId,
  });

  const { data: movers, isLoading: loadingMovers } = useQuery<MoversData>({
    queryKey: ["reports-movers", periodId],
    queryFn: async () => {
      const res = await api.get("/reports/movers", { params: { period_id: periodId } });
      return res.data;
    },
    enabled: !!periodId,
  });

  const totalRanked = rankings?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Rankings</h1>
        <p className="text-muted-foreground text-sm mt-1">Leaderboard and biggest movers</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        <button
          onClick={() => setTab("rankings")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            tab === "rankings"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Overall Rankings
        </button>
        <button
          onClick={() => setTab("movers")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
            tab === "movers"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Biggest Movers
        </button>
      </div>

      {/* Tab: Overall Rankings */}
      {tab === "rankings" && (
        <>
          {loadingRankings ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !rankings || rankings.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">No data available</p>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground w-14">Rank</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Supervisor</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Site</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Score</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">Grade</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Delta</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Voice</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Chat</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Non-Ch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rankings.map((row) => {
                      const isTop10 = row.rank <= 10;
                      const isBottom10 = row.rank > totalRanked - 10;
                      return (
                        <tr
                          key={row.agent_id}
                          className={cn(
                            "hover:bg-muted/50 cursor-pointer transition-colors",
                            isTop10 && "bg-emerald-50/50 dark:bg-emerald-950/20",
                            isBottom10 && "bg-red-50/50 dark:bg-red-950/20",
                          )}
                          onClick={() => navigate(`/agents/${row.agent_id}`)}
                        >
                          <td className="px-4 py-2.5 text-muted-foreground">{row.rank}</td>
                          <td className="px-4 py-2.5 font-medium">{row.name}</td>
                          <td className="px-4 py-2.5">{row.supervisor}</td>
                          <td className="px-4 py-2.5">{row.site}</td>
                          <td className="px-4 py-2.5 text-right">{formatNumber(row.score)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-xs font-semibold",
                                gradeColorSolid(row.grade),
                              )}
                            >
                              {row.grade ?? "-"}
                            </span>
                          </td>
                          <td
                            className={cn(
                              "px-4 py-2.5 text-right",
                              row.delta != null && row.delta > 0 && "text-emerald-600",
                              row.delta != null && row.delta < 0 && "text-red-600",
                            )}
                          >
                            {row.delta != null
                              ? `${row.delta > 0 ? "+" : ""}${formatNumber(row.delta)}`
                              : "-"}
                          </td>
                          <td className="px-4 py-2.5 text-right">{formatNumber(row.voice_score)}</td>
                          <td className="px-4 py-2.5 text-right">{formatNumber(row.chat_score)}</td>
                          <td className="px-4 py-2.5 text-right">{formatNumber(row.email_score)}</td>
                          <td className="px-4 py-2.5 text-right">{formatNumber(row.non_ch_score)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab: Biggest Movers */}
      {tab === "movers" && (
        <>
          {loadingMovers ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !movers ? (
            <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">No data available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Most Improved */}
              <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <h3 className="text-sm font-semibold mb-4 text-emerald-600">Most Improved</h3>
                {movers.improved.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(movers.improved.length * 40, 200)}>
                    <BarChart data={movers.improved} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                      <Tooltip />
                      <Bar dataKey="delta" radius={[0, 4, 4, 0]}>
                        {movers.improved.map((_, i) => (
                          <Cell key={i} fill="#10b981" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No data available</p>
                )}
              </div>

              {/* Biggest Declines */}
              <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
                <h3 className="text-sm font-semibold mb-4 text-red-600">Biggest Declines</h3>
                {movers.declined.length > 0 ? (
                  <ResponsiveContainer width="100%" height={Math.max(movers.declined.length * 40, 200)}>
                    <BarChart data={movers.declined} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                      <Tooltip />
                      <Bar dataKey="delta" radius={[4, 0, 0, 4]}>
                        {movers.declined.map((_, i) => (
                          <Cell key={i} fill="#ef4444" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No data available</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
