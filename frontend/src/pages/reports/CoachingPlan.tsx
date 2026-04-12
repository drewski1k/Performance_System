import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, Star, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
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

interface CoachingAgent {
  agent_id: string;
  name: string;
  score: number | null;
  grade: string | null;
  delta: number | null;
  focus_area: string;
  strengths: string[];
  opportunities: string[];
}

interface SupervisorOption {
  id: string;
  name: string;
}

interface CoachingData {
  headcount: number;
  avg_score: number | null;
  grade_distribution: Record<string, number>;
  needs_attention_count: number;
  rising_stars_count: number;
  supervisors: SupervisorOption[];
  agents: CoachingAgent[];
}

export default function CoachingPlan() {
  const { periodId } = usePeriod();
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>("");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<CoachingData>({
    queryKey: ["reports-coaching", periodId, selectedSupervisor],
    queryFn: async () => {
      const res = await api.get("/reports/coaching", {
        params: {
          period_id: periodId,
          supervisor_id: selectedSupervisor || undefined,
        },
      });
      return res.data;
    },
    enabled: !!periodId,
  });

  function toggleAgent(agentId: string) {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }

  const donutData = data
    ? GRADE_ORDER.map((g) => ({
        grade: g,
        count: data.grade_distribution[g] ?? 0,
      })).filter((g) => g.count > 0)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Coaching Plan</h1>
        <p className="text-muted-foreground text-sm mt-1">Priority coaching queue</p>
      </div>

      {/* Supervisor Filter */}
      <div className="flex items-center gap-3">
        <Users className="h-5 w-5 text-muted-foreground" />
        <select
          value={selectedSupervisor}
          onChange={(e) => setSelectedSupervisor(e.target.value)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium bg-card hover:bg-muted transition-colors"
        >
          <option value="">All Supervisors</option>
          {data?.supervisors?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
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
          {/* Team Snapshot */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Headcount</p>
              <p className="text-2xl font-bold">{data.headcount}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">Avg Score</p>
              <p className="text-2xl font-bold">{formatNumber(data.avg_score)}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm flex items-center gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Grade Mix</p>
                <div className="flex gap-1 mt-1">
                  {GRADE_ORDER.map((g) => {
                    const count = data.grade_distribution[g] ?? 0;
                    if (count === 0) return null;
                    return (
                      <span
                        key={g}
                        className={cn("px-1.5 py-0.5 rounded text-xs font-semibold", gradeColorSolid(g))}
                      >
                        {g}:{count}
                      </span>
                    );
                  })}
                </div>
              </div>
              {donutData.length > 0 && (
                <div className="w-16 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="count"
                        nameKey="grade"
                        innerRadius={15}
                        outerRadius={30}
                        paddingAngle={2}
                      >
                        {donutData.map((entry) => (
                          <Cell key={entry.grade} fill={GRADE_COLORS[entry.grade]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-1 mb-1">
                <AlertTriangle className="h-3 w-3 text-orange-500" />
                <p className="text-xs text-muted-foreground">Needs Attention</p>
              </div>
              <p className="text-2xl font-bold text-orange-600">{data.needs_attention_count}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-1 mb-1">
                <Star className="h-3 w-3 text-yellow-500" />
                <p className="text-xs text-muted-foreground">Rising Stars</p>
              </div>
              <p className="text-2xl font-bold text-yellow-600">{data.rising_stars_count}</p>
            </div>
          </div>

          {/* Priority Coaching Queue */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-sm font-semibold">Priority Coaching Queue</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Sorted by grade priority (worst first)</p>
            </div>

            {data.agents.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-muted-foreground">No agents in coaching queue</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.agents.map((agent) => {
                  const isExpanded = expandedAgents.has(agent.agent_id);

                  return (
                    <div key={agent.agent_id}>
                      <button
                        onClick={() => toggleAgent(agent.agent_id)}
                        className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-semibold",
                              gradeColorSolid(agent.grade),
                            )}
                          >
                            {agent.grade ?? "-"}
                          </span>
                          <span className="text-sm font-medium">{agent.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground">
                            Score: {formatNumber(agent.score)}
                          </span>
                          {agent.delta != null && (
                            <span
                              className={cn(
                                "text-xs font-medium",
                                agent.delta > 0 ? "text-emerald-600" : agent.delta < 0 ? "text-red-600" : "text-muted-foreground",
                              )}
                            >
                              {agent.delta > 0 ? "+" : ""}{formatNumber(agent.delta)}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground max-w-[200px] truncate">
                            Focus: {agent.focus_area}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-6 pb-4 pt-1">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-8">
                            <div>
                              <p className="text-xs font-medium text-emerald-600 mb-2">Strengths</p>
                              <div className="flex flex-wrap gap-1">
                                {agent.strengths.length > 0 ? (
                                  agent.strengths.map((s) => (
                                    <span
                                      key={s}
                                      className="px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    >
                                      {s}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-muted-foreground">None identified</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-red-600 mb-2">Opportunities</p>
                              <div className="flex flex-wrap gap-1">
                                {agent.opportunities.length > 0 ? (
                                  agent.opportunities.map((o) => (
                                    <span
                                      key={o}
                                      className="px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700 border border-red-200"
                                    >
                                      {o}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-muted-foreground">None identified</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
