import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, ArrowUpDown, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { gradeColor, formatNumber } from "@/lib/utils";

interface AgentScore {
  agent_id: string;
  agent_name: string;
  supervisor_name: string | null;
  final_score: number | null;
  grade: string | null;
  rank: number | null;
}

type SortKey = "rank" | "agent_name" | "grade" | "final_score" | "supervisor_name";

export default function AgentsPage() {
  const { periodId } = usePeriod();
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  const { data: agents = [], isLoading } = useQuery<AgentScore[]>({
    queryKey: ["agent-scores", periodId],
    queryFn: async () => {
      const params = periodId ? { period_id: periodId } : {};
      const res = await api.get("/dashboard/agent-scores", { params });
      return res.data;
    },
    enabled: !!periodId,
  });

  const sorted = useMemo(() => {
    const copy = [...agents];
    copy.sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;
      if (sortKey === "rank") {
        aVal = a.rank ?? 9999;
        bVal = b.rank ?? 9999;
      } else if (sortKey === "final_score") {
        aVal = a.final_score ?? -1;
        bVal = b.final_score ?? -1;
      } else {
        aVal = (a[sortKey] ?? "").toString().toLowerCase();
        bVal = (b[sortKey] ?? "").toString().toLowerCase();
      }
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
    return copy;
  }, [agents, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function SortHeader({ label, sKey }: { label: string; sKey: SortKey }) {
    return (
      <th
        className="pb-3 font-medium text-muted-foreground cursor-pointer select-none"
        onClick={() => toggleSort(sKey)}
      >
        <div className="flex items-center gap-1">
          {label}
          <ArrowUpDown className="h-3 w-3" />
        </div>
      </th>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agents</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View and manage agent details and individual scorecards
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Agent List</h3>
          {agents.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">{agents.length} agents</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !periodId ? (
          <p className="text-sm text-muted-foreground">No scoring data yet. Import data from the Import page to get started.</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No agent scores found for this period. Import data and run scoring first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <SortHeader label="Rank" sKey="rank" />
                  <SortHeader label="Agent" sKey="agent_name" />
                  <SortHeader label="Grade" sKey="grade" />
                  <SortHeader label="Score" sKey="final_score" />
                  <SortHeader label="Supervisor" sKey="supervisor_name" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((agent) => (
                  <tr key={agent.agent_id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-2.5 text-muted-foreground">{agent.rank ?? "-"}</td>
                    <td className="py-2.5">
                      <Link
                        to={`/agents/${agent.agent_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {agent.agent_name}
                      </Link>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${gradeColor(agent.grade)}`}
                      >
                        {agent.grade ?? "-"}
                      </span>
                    </td>
                    <td className="py-2.5">{formatNumber(agent.final_score)}</td>
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
