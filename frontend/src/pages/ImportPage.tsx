import { Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload CSV or Excel files with agent performance data
        </p>
      </div>

      {/* Upload Zone */}
      <div className="bg-card rounded-xl border-2 border-dashed border-border p-12 text-center shadow-sm hover:border-primary/50 transition-colors cursor-pointer">
        <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <p className="text-sm font-medium mb-1">
          Drag and drop your file here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground">
          Supports CSV and Excel (.xlsx) files
        </p>
      </div>

      {/* Expected Format */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="text-sm font-semibold mb-3">Expected Data Sources</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: "Agent Summary Glance Report", desc: "Primary metrics: time, contacts, rates by channel" },
            { name: "Agent Durations Report", desc: "Activity states and durations for productivity calculation" },
            { name: "QA Data", desc: "Quality assurance evaluation counts and scores" },
          ].map((src) => (
            <div key={src.name} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">{src.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{src.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Import History */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="text-sm font-semibold mb-3">Import History</h3>
        <p className="text-sm text-muted-foreground">No imports yet.</p>
      </div>
    </div>
  );
}
