import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../api/client";

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

  // Fetch periods on mount and auto-select the most recent
  const { data } = useQuery<Period[]>({
    queryKey: ["scoring-periods"],
    queryFn: async () => {
      const res = await api.get("/performance/periods");
      return res.data;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data && data.length > 0) {
      setPeriods(data);
      // Auto-select most recent if nothing selected
      if (!periodId) {
        setPeriodId(data[0].id);
      }
    }
  }, [data]);

  return (
    <Ctx.Provider value={{ periodId, setPeriodId, periods, setPeriods }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePeriod() {
  return useContext(Ctx);
}
