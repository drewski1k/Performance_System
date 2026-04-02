import { Settings, Scale, Percent, Filter, Zap, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const tabs = [
  { key: "metrics", label: "Metrics", icon: Settings },
  { key: "grades", label: "Grade Scales", icon: Scale },
  { key: "weights", label: "Score Weights", icon: Percent },
  { key: "outliers", label: "Outlier Settings", icon: Filter },
  { key: "productivity", label: "Productivity States", icon: Zap },
  { key: "pfp", label: "PFP Rates", icon: DollarSign },
];

export default function ScorecardConfigPage() {
  const [activeTab, setActiveTab] = useState("metrics");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scorecard Configuration</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure metrics, weights, grade scales, and scoring rules
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        {activeTab === "metrics" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Metric Configuration</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Configure which metrics are included in scoring, shown on the scorecard, and their weights per channel.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 font-medium text-muted-foreground">Metric</th>
                    <th className="pb-3 font-medium text-muted-foreground">Channel</th>
                    <th className="pb-3 font-medium text-muted-foreground">Weight %</th>
                    <th className="pb-3 font-medium text-muted-foreground">Direction</th>
                    <th className="pb-3 font-medium text-muted-foreground">Include in Score</th>
                    <th className="pb-3 font-medium text-muted-foreground">Show on Scorecard</th>
                    <th className="pb-3 font-medium text-muted-foreground">Min Threshold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="text-muted-foreground">
                    <td colSpan={7} className="py-8 text-center">
                      Create a scorecard template to configure metrics
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "grades" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Grade Scale Configuration</h3>
            <p className="text-sm text-muted-foreground">
              Toggle between Dynamic (auto-calculated from group stats) and Manual (fixed thresholds) grade scales per metric.
            </p>
          </div>
        )}

        {activeTab === "weights" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Final Score Weights</h3>
            <div className="max-w-md space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium">Channel Weight</label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="range" min="0" max="100" defaultValue="0" className="flex-1" />
                  <span className="text-sm font-mono w-12 text-right">0%</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Non-Channel Weight</label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="range" min="0" max="100" defaultValue="100" className="flex-1" />
                  <span className="text-sm font-mono w-12 text-right">100%</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
                Total: 100% &mdash; Valid
              </div>
            </div>
          </div>
        )}

        {activeTab === "outliers" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Outlier Settings</h3>
            <div className="max-w-md space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium">Outlier Removal Method</label>
                <select className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
                  <option>IQR (Recommended)</option>
                  <option>None</option>
                  <option>2 Std Dev</option>
                  <option>3 Std Dev</option>
                  <option>Percentile Trim (5%)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">IQR Multiplier</label>
                <input type="number" step="0.1" defaultValue="1.5" className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background" />
                <p className="text-xs text-muted-foreground mt-1">Standard: 1.5 | Strict: 1.0 | Lenient: 2.0</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "productivity" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Productivity State Configuration</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Define which activity states count as productive time.
            </p>
            <div className="space-y-2">
              {[
                { name: "Floor Support", type: "AWAY", productive: true, category: "Support" },
                { name: "Coaching", type: "AWAY", productive: true, category: "Development" },
                { name: "Training", type: "AWAY", productive: true, category: "Development" },
                { name: "Team Meeting", type: "AWAY", productive: true, category: "Meetings" },
                { name: "Gladly Project", type: "AWAY", productive: true, category: "Projects" },
                { name: "Email", type: "AWAY", productive: true, category: "Core Work" },
                { name: "HR Meeting", type: "AWAY", productive: false, category: "Meetings" },
                { name: "Break", type: "AWAY", productive: false, category: "Personal" },
                { name: "Lunch", type: "AWAY", productive: false, category: "Personal" },
                { name: "IDLE", type: "AWAY", productive: false, category: "Unproductive" },
                { name: "Tech Issue", type: "AWAY", productive: false, category: "Unproductive" },
              ].map((state) => (
                <div key={state.name} className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{state.name}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{state.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded", state.productive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
                      {state.productive ? "Productive" : "Non-Productive"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "pfp" && (
          <div>
            <h3 className="text-sm font-semibold mb-4">Pay for Performance Rates</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Set the dollar amount per logged-in hour for each grade level.
            </p>
            <div className="max-w-sm space-y-3">
              {[
                { grade: "A", rate: "3.00", color: "border-l-emerald-500" },
                { grade: "B", rate: "2.00", color: "border-l-green-500" },
                { grade: "C", rate: "0.00", color: "border-l-yellow-500" },
                { grade: "D", rate: "0.00", color: "border-l-orange-500" },
                { grade: "F", rate: "0.00", color: "border-l-red-500" },
              ].map((g) => (
                <div key={g.grade} className={cn("flex items-center gap-4 px-4 py-3 rounded-lg border border-border border-l-4", g.color)}>
                  <span className="text-lg font-bold w-8">{g.grade}</span>
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-muted-foreground">$</span>
                    <input type="number" step="0.25" defaultValue={g.rate} className="w-20 border border-input rounded px-2 py-1 text-sm bg-background" />
                    <span className="text-sm text-muted-foreground">/ logged hour</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
