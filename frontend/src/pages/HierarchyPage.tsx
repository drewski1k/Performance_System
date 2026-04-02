import { Building2, MapPin, UserCheck, Users } from "lucide-react";

export default function HierarchyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organization</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your company hierarchy: Company &rarr; Site &rarr; Supervisor &rarr; Agent
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Building2, label: "Companies", count: 0, color: "text-blue-600 bg-blue-50" },
          { icon: MapPin, label: "Sites", count: 0, color: "text-purple-600 bg-purple-50" },
          { icon: UserCheck, label: "Supervisors", count: 0, color: "text-indigo-600 bg-indigo-50" },
          { icon: Users, label: "Agents", count: 0, color: "text-emerald-600 bg-emerald-50" },
        ].map((item) => (
          <div key={item.label} className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.color}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{item.count}</p>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Create your first company to get started with the hierarchy. You can also import agents via CSV on the Import Data page.
        </p>
      </div>
    </div>
  );
}
