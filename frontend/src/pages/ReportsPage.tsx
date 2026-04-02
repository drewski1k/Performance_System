import { FileBarChart, Download, TrendingUp } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Strength/opportunity analysis, trends, and comparisons
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
            <Download className="h-4 w-4" />
            Export PDF
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
            <Download className="h-4 w-4" />
            Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <h3 className="text-sm font-semibold">Strengths</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Import data and run scoring to see strength analysis.
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-amber-600 rotate-180" />
            <h3 className="text-sm font-semibold">Opportunities</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Import data and run scoring to see opportunity analysis.
          </p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <FileBarChart className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold">Trend Analysis</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Score trends across periods will appear here after multiple cycles of data are imported.
        </p>
      </div>
    </div>
  );
}
