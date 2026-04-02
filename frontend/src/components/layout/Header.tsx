import { CalendarDays } from "lucide-react";
import { usePeriod } from "@/hooks/usePeriod";

export default function Header() {
  const { periodId, setPeriodId, periods } = usePeriod();

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        {periods.length > 0 ? (
          <select
            value={periodId ?? ""}
            onChange={(e) => setPeriodId(e.target.value)}
            className="text-sm border border-input rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground">No scoring periods</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Admin</span>
      </div>
    </header>
  );
}
