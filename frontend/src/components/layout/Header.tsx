import { CalendarDays } from "lucide-react";

export default function Header() {
  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <select className="text-sm border border-input rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
          <option>Cycle 3: Mar 8 - Mar 21, 2026</option>
          <option>Cycle 2: Feb 22 - Mar 7, 2026</option>
          <option>Cycle 1: Feb 8 - Feb 21, 2026</option>
        </select>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Admin</span>
      </div>
    </header>
  );
}
