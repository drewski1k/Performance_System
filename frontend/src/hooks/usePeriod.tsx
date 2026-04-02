import { createContext, useContext, useState, type ReactNode } from "react";

export interface Period {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
}

interface PeriodCtx {
  periodId: string | null;
  setPeriodId: (id: string) => void;
  periods: Period[];
  setPeriods: (p: Period[]) => void;
}

const Ctx = createContext<PeriodCtx>({
  periodId: null,
  setPeriodId: () => {},
  periods: [],
  setPeriods: () => {},
});

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  return (
    <Ctx.Provider value={{ periodId, setPeriodId, periods, setPeriods }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePeriod() {
  return useContext(Ctx);
}
