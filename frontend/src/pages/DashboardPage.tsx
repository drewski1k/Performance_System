import { BarChart3, Users, TrendingUp, DollarSign } from "lucide-react";

function KpiCard({ title, value, subtitle, icon: Icon, color }: {
  title: string; value: string; subtitle: string; icon: React.ElementType; color: string;
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

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Performance overview across all agents
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Avg Final Score"
          value="82.4"
          subtitle="+2.1 from last cycle"
          icon={BarChart3}
          color="bg-blue-50 text-blue-600"
        />
        <KpiCard
          title="Agents Graded"
          value="156"
          subtitle="of 168 total agents"
          icon={Users}
          color="bg-emerald-50 text-emerald-600"
        />
        <KpiCard
          title="A Grade Rate"
          value="34%"
          subtitle="53 agents at A level"
          icon={TrendingUp}
          color="bg-green-50 text-green-600"
        />
        <KpiCard
          title="Total PFP Payout"
          value="$12,480"
          subtitle="$3,200 left on table"
          icon={DollarSign}
          color="bg-yellow-50 text-yellow-600"
        />
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-6 shadow-sm min-h-[300px]">
          <h3 className="text-sm font-semibold mb-4">Agent Rankings</h3>
          <p className="text-sm text-muted-foreground">
            Import data and configure your scorecard to see rankings here.
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">Grade Distribution</h3>
          <div className="space-y-3">
            {[
              { grade: "A", pct: 34, color: "bg-emerald-500" },
              { grade: "B", pct: 28, color: "bg-green-500" },
              { grade: "C", pct: 22, color: "bg-yellow-500" },
              { grade: "D", pct: 10, color: "bg-orange-500" },
              { grade: "F", pct: 6, color: "bg-red-500" },
            ].map((g) => (
              <div key={g.grade} className="flex items-center gap-3">
                <span className="text-sm font-semibold w-6">{g.grade}</span>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${g.color} rounded-full transition-all`}
                    style={{ width: `${g.pct}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-10 text-right">{g.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strengths / Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-emerald-700 mb-3">Top Strengths</h3>
          <div className="space-y-2">
            {["QA Score % (+8.2%)", "Productivity % (+5.1%)", "Chat CPH (+3.4)"].map((s) => (
              <div key={s} className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                <TrendingUp className="h-4 w-4" />
                {s}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-700 mb-3">Top Opportunities</h3>
          <div className="space-y-2">
            {["Voice AHT (-12.3s)", "Email CPH (-1.8)", "Schedule Adherence (-4.2%)"].map((s) => (
              <div key={s} className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                <TrendingUp className="h-4 w-4 rotate-180" />
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
