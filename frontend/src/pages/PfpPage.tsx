import { DollarSign, TrendingUp, AlertCircle } from "lucide-react";

export default function PfpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay for Performance</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track PFP payouts and money left on the table
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-muted-foreground">Total Payout</span>
          </div>
          <p className="text-2xl font-bold">$0.00</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-muted-foreground">Money Left on Table</span>
          </div>
          <p className="text-2xl font-bold">$0.00</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-muted-foreground">Avg Rate / Hour</span>
          </div>
          <p className="text-2xl font-bold">$0.00</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="text-sm font-semibold mb-3">Agent PFP Breakdown</h3>
        <p className="text-sm text-muted-foreground">
          Import data and run scoring to see per-agent PFP calculations.
        </p>
      </div>
    </div>
  );
}
