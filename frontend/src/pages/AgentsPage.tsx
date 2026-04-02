import { Users } from "lucide-react";

export default function AgentsPage() {
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
        </div>
        <p className="text-sm text-muted-foreground">
          Add agents through the Organization page or import via CSV.
        </p>
      </div>
    </div>
  );
}
