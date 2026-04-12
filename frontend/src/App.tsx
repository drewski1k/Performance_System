import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PeriodProvider } from "@/hooks/usePeriod";
import AppShell from "@/components/layout/AppShell";
import DashboardPage from "@/pages/DashboardPage";
import HierarchyPage from "@/pages/HierarchyPage";
import ScorecardConfigPage from "@/pages/ScorecardConfigPage";
import ImportPage from "@/pages/ImportPage";
import PfpPage from "@/pages/PfpPage";
import AgentsPage from "@/pages/AgentsPage";
import AgentDetailPage from "@/pages/AgentDetailPage";

// Report pages
import ReportsHub from "@/pages/reports/ReportsHub";
import ExecutiveDashboard from "@/pages/reports/ExecutiveDashboard";
import TeamPerformance from "@/pages/reports/TeamPerformance";
import Rankings from "@/pages/reports/Rankings";
import MetricExplorer from "@/pages/reports/MetricExplorer";
import OutliersAlerts from "@/pages/reports/OutliersAlerts";
import BusinessImpact from "@/pages/reports/BusinessImpact";
import CoachingPlan from "@/pages/reports/CoachingPlan";

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
              <Route path="reports" element={<ReportsHub />} />
              <Route path="reports/dashboard" element={<ExecutiveDashboard />} />
              <Route path="reports/teams" element={<TeamPerformance />} />
              <Route path="reports/rankings" element={<Rankings />} />
              <Route path="reports/metrics" element={<MetricExplorer />} />
              <Route path="reports/outliers" element={<OutliersAlerts />} />
              <Route path="reports/impact" element={<BusinessImpact />} />
              <Route path="reports/coaching" element={<CoachingPlan />} />
              <Route path="pfp" element={<PfpPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="agents/:agentId" element={<AgentDetailPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </PeriodProvider>
    </QueryClientProvider>
  );
}
