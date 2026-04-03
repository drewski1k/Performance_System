import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, User } from "lucide-react";
import api from "../api/client";
import { usePeriod } from "@/hooks/usePeriod";
import { gradeColor, formatNumber } from "@/lib/utils";

interface MetricDetail {
  metric_key: string;
  metric_name: string;
  channel: string;
  direction: string;
  unit: string;
  actual_value: number;
  grade: string | null;
  points: number | null;
  include_in_score: boolean;
  show_on_scorecard: boolean;
  weight: number;
}

interface AgentSummary {
  rank: number | null;
  final_score: number | null;
  final_grade: string | null;
  voice_score: number | null;
  chat_score: number | null;
  email_score: number | null;
  non_channel_score: number | null;
  logged_hours: number | null;
  pfp_rate: number | null;
  pfp_payout: number | null;
  pfp_max_payout: number | null;
  pfp_money_left: number | null;
  strengths: any[];
  opportunities: any[];
}

interface AgentScorecard {
  agent: {
    id: string;
    name: string;
    employee_id: string;
    supervisor: string;
  };
  summary: AgentSummary | null;
  metrics: MetricDetail[];
}

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const { periodId } = usePeriod();

  const { data, isLoading } = useQuery<AgentScorecard>({
    queryKey: ["agent-scorecard", agentId, periodId],
    queryFn: async () => {
      const res = await api.get(`/dashboard/agent/${agentId}/scorecard`, {
        params: { period_id: periodId },
      });
      return res.data;
    },
    enabled: !!agentId && !!periodId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Link to="/agents" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Agents
        </Link>
        <p className="text-muted-foreground">No scorecard data found. Make sure data is imported and scoring has been run.</p>
      </div>
    );
  }

  const { agent, summary, metrics } = data;
  const scoredMetrics = metrics.filter((m) => m.include_in_score);
  const contextMetrics = metrics.filter((m) => !m.include_in_score && m.show_on_scorecard);

  const channelOrder = ["voice", "chat", "email", "non_channel"];
  const channelLabel: Record<string, string> = { voice: "Voice", chat: "Chat", email: "Email", non_channel: "Non-Channel" };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/agents" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </Link>

      {/* Agent header */}
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <User className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">
            {agent.supervisor && `Supervisor: ${agent.supervisor}`}
            {agent.employee_id && ` · ${agent.employee_id}`}
          </p>
        </div>
        {summary && (
          <div className="ml-auto flex items-center gap-4">
            {summary.rank && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Rank</p>
                <p className="text-lg font-bold">#{summary.rank}</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Score</p>
              <p className="text-lg font-bold">{formatNumber(summary.final_score)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Grade</p>
              <span className={`inline-block px-3 py-1 rounded text-lg font-bold ${gradeColor(summary.final_grade)}`}>
                {summary.final_grade ?? "-"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Score breakdown */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Voice", value: summary.voice_score },
            { label: "Chat", value: summary.chat_score },
            { label: "Email", value: summary.email_score },
            { label: "Non-Channel", value: summary.non_channel_score },
          ].map((item) => (
            <div key={item.label} className="bg-card rounded-xl border border-border p-4 shadow-sm text-center">
              <p className="text-xs text-muted-foreground mb-1">{item.label} Score</p>
              <p className="text-xl font-bold">{item.value != null ? formatNumber(item.value) : "-"}</p>
            </div>
          ))}
        </div>
      )}

      {/* Scored Metrics */}
      {scoredMetrics.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">Scored Metrics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Metric</th>
                  <th className="pb-2 font-medium text-muted-foreground">Channel</th>
                  <th className="pb-2 font-medium text-muted-foreground">Value</th>
                  <th className="pb-2 font-medium text-muted-foreground">Grade</th>
                  <th className="pb-2 font-medium text-muted-foreground">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {channelOrder.map((ch) => {
                  const chMetrics = scoredMetrics.filter((m) => m.channel === ch);
                  if (chMetrics.length === 0) return null;
                  return chMetrics.map((m) => (
                    <tr key={m.metric_key} className="hover:bg-muted/30">
                      <td className="py-2 font-medium">{m.metric_name}</td>
                      <td className="py-2 text-muted-foreground">{channelLabel[m.channel] ?? m.channel}</td>
                      <td className="py-2">{formatNumber(m.actual_value)}</td>
                      <td className="py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${gradeColor(m.grade)}`}>
                          {m.grade ?? "-"}
                        </span>
                      </td>
                      <td className="py-2 text-muted-foreground">{m.weight}%</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Context Metrics */}
      {contextMetrics.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">Context Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {contextMetrics.map((m) => (
              <div key={m.metric_key} className="border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{m.metric_name}</p>
                <p className="text-lg font-semibold">{formatNumber(m.actual_value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PFP */}
      {summary && (summary.pfp_payout != null || summary.pfp_rate != null) && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-3">Pay for Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Rate/Hr</p>
              <p className="text-lg font-bold">${formatNumber(summary.pfp_rate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hours</p>
              <p className="text-lg font-bold">{formatNumber(summary.logged_hours)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Payout</p>
              <p className="text-lg font-bold text-emerald-600">${formatNumber(summary.pfp_payout)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Left on Table</p>
              <p className="text-lg font-bold text-amber-600">${formatNumber(summary.pfp_money_left)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
