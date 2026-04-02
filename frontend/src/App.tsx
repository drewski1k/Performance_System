import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PeriodProvider } from "@/hooks/usePeriod";
import AppShell from "@/components/layout/AppShell";
import DashboardPage from "@/pages/DashboardPage";
import HierarchyPage from "@/pages/HierarchyPage";
import ScorecardConfigPage from "@/pages/ScorecardConfigPage";
import ImportPage from "@/pages/ImportPage";
import ReportsPage from "@/pages/ReportsPage";
import PfpPage from "@/pages/PfpPage";
import AgentsPage from "@/pages/AgentsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PeriodProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="hierarchy" element={<HierarchyPage />} />
              <Route path="scorecard-config" element={<ScorecardConfigPage />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="pfp" element={<PfpPage />} />
              <Route path="agents" element={<AgentsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PeriodProvider>
    </QueryClientProvider>
  );
}
