import { Link } from "react-router-dom";
import { BarChart3, Users, Trophy, AlertTriangle, DollarSign, ClipboardCheck, Target, TrendingUp } from "lucide-react";

const reportCards = [
  { to: "/reports/dashboard", icon: BarChart3, title: "Executive Dashboard", desc: "KPIs, grade distribution, trends" },
  { to: "/reports/teams", icon: Users, title: "Team Performance", desc: "Compare groups by site or supervisor" },
  { to: "/reports/rankings", icon: Trophy, title: "Rankings", desc: "Leaderboard and biggest movers" },
  { to: "/reports/metrics", icon: Target, title: "Metric Explorer", desc: "Deep-dive into any metric" },
  { to: "/reports/outliers", icon: AlertTriangle, title: "Outliers & Alerts", desc: "Exception detection and flags" },
  { to: "/reports/impact", icon: DollarSign, title: "Business Impact", desc: "Score impact analysis and what-if" },
  { to: "/reports/coaching", icon: ClipboardCheck, title: "Coaching Plan", desc: "Priority coaching queue" },
];

export default function ReportsHub() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Performance analytics and insights</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportCards.map(c => (
          <Link key={c.to} to={c.to} className="bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group">
            <c.icon className="h-8 w-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold">{c.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
