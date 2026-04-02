import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Settings,
  Upload,
  FileBarChart,
  Users,
  DollarSign,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/hierarchy", icon: Building2, label: "Organization" },
  { to: "/scorecard-config", icon: Settings, label: "Scorecard Config" },
  { to: "/import", icon: Upload, label: "Import Data" },
  { to: "/reports", icon: FileBarChart, label: "Reports" },
  { to: "/pfp", icon: DollarSign, label: "Pay for Performance" },
  { to: "/agents", icon: Users, label: "Agents" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col min-h-screen shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <h1 className="text-lg font-semibold tracking-tight text-white">
          Performance System
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Call Center Analytics</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-white"
                  : "text-slate-400 hover:text-white hover:bg-sidebar-accent/50"
              )
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/10">
        <p className="text-xs text-slate-500">v1.0.0</p>
      </div>
    </aside>
  );
}
