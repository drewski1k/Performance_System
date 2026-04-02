import { CalendarDays } from "lucide-react";
import { usePeriod } from "@/hooks/usePeriod";

export default function Header() {
  const { periods, periodId } = usePeriod();
  const current = periods.find((p) => p.id === periodId);

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        {current ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{current.label}</span>
            <span className="text-xs text-muted-foreground">
              {current.start_date} — {current.end_date}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No scoring periods yet</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Admin</span>
      </div>
    </header>
  );
}
