import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight } from "lucide-react";
import api from "@/api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { cn, formatNumber } from "@/lib/utils";

type Severity = "critical" | "warning" | "info";

interface OutlierAgent {
  agent_id: string;
  name: string;
  supervisor: string;
  site: string;
  value: number | null;
  detail: string;
}

interface OutlierCategory {
  category: string;
  severity: Severity;
  description: string;
  count: number;
  agents: OutlierAgent[];
}

interface OutliersData {
  summary: Record<Severity, number>;
  categories: OutlierCategory[];
}

const SEVERITY_CONFIG: Record<Severity, { color: string; bgColor: string; borderColor: string; icon: React.ElementType }> = {
  critical: { color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200", icon: AlertTriangle },
  warning: { color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200", icon: AlertCircle },
  info: { color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", icon: Info },
};

export default function OutliersAlerts() {
  const { periodId } = usePeriod();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<OutliersData>({
    queryKey: ["reports-outliers", periodId],
    queryFn: async () => {
      const res = await api.get("/reports/outliers", { params: { period_id: periodId } });
      return res.data;
    },
    enabled: !!periodId,
  });

  function toggleCategory(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Reports
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">Outliers & Alerts</h1>
        <p className="text-muted-foreground text-sm mt-1">Exception detection and flags</p>
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
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-red-50 rounded-xl border border-red-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium text-red-600">Critical</span>
              </div>
              <p className="text-3xl font-bold text-red-700">{data.summary.critical ?? 0}</p>
            </div>
            <div className="bg-orange-50 rounded-xl border border-orange-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                <span className="text-sm font-medium text-orange-600">Warning</span>
              </div>
              <p className="text-3xl font-bold text-orange-700">{data.summary.warning ?? 0}</p>
            </div>
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Info className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-600">Info</span>
              </div>
              <p className="text-3xl font-bold text-blue-700">{data.summary.info ?? 0}</p>
            </div>
          </div>

          {/* Category Cards */}
          <div className="space-y-3">
            {data.categories.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
                <p className="text-sm text-muted-foreground">No outliers detected</p>
              </div>
            ) : (
              data.categories.map((cat) => {
                const config = SEVERITY_CONFIG[cat.severity];
                const isExpanded = expanded.has(cat.category);
                const SeverityIcon = config.icon;

                return (
                  <div
                    key={cat.category}
                    className={cn(
                      "rounded-xl border shadow-sm overflow-hidden",
                      config.borderColor,
                    )}
                  >
                    <button
                      onClick={() => toggleCategory(cat.category)}
                      className={cn(
                        "w-full flex items-center justify-between px-6 py-4 text-left transition-colors hover:opacity-90",
                        config.bgColor,
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <SeverityIcon className={cn("h-5 w-5", config.color)} />
                        <div>
                          <h3 className={cn("font-semibold", config.color)}>{cat.category}</h3>
                          <p className="text-sm text-muted-foreground">{cat.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn("text-sm font-semibold", config.color)}>
                          {cat.count} agent{cat.count !== 1 ? "s" : ""}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {isExpanded && cat.agents.length > 0 && (
                      <div className="bg-card">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/30">
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Supervisor</th>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Site</th>
                                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Value</th>
                                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Detail</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {cat.agents.map((agent) => (
                                <tr key={agent.agent_id} className="hover:bg-muted/30 transition-colors">
                                  <td className="px-4 py-2 font-medium">{agent.name}</td>
                                  <td className="px-4 py-2">{agent.supervisor}</td>
                                  <td className="px-4 py-2">{agent.site}</td>
                                  <td className="px-4 py-2 text-right">{formatNumber(agent.value)}</td>
                                  <td className="px-4 py-2 text-muted-foreground">{agent.detail}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
