import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Info,
  Download,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

type ImportStep = "select" | "preview" | "importing" | "done";

interface PreviewRow {
  [key: string]: string | number;
}

interface PreviewResult {
  data_type: string;
  valid_rows: number;
  total_rows?: number;
  columns_found?: string[];
  metrics_found?: string[];
  total_metrics?: number;
  errors: string[];
  warnings?: string[];
  preview: PreviewRow[];
  bpos?: string[];
  sites?: string[];
  supervisors?: string[];
  error?: string;
}

interface ImportResult {
  data_type: string;
  status: string;
  records_created?: number;
  records_updated?: number;
  agents_created?: number;
  agents_updated?: number;
  sites_created?: number;
  supervisors_created?: number;
  agents_not_found?: number;
  agents_scored?: number;
  metrics_created?: number;
  metrics_not_found?: string[];
  note?: string;
}

export default function ImportPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ImportStep>("select");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setStep("select");
    setPreview(null);
    setImportResult(null);
    setError(null);
    setSelectedFile(null);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const resp = await api.post("/performance/import/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setPreview(resp.data);
      setStep("preview");
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [selectedFile]);

  const handleImport = useCallback(async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setStep("importing");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const resp = await api.post("/performance/import/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setImportResult(resp.data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["scoring-periods"] });
      queryClient.invalidateQueries({ queryKey: ["scorecard-templates"] });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Import failed");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }, [selectedFile, queryClient]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload your performance data — roster and metrics in one file
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`${api.defaults.baseURL}/performance/template/download`}
            download
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            Download Template
          </a>
          {step !== "select" && (
            <button
              onClick={resetState}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" /> Start Over
            </button>
          )}
        </div>
      </div>

      {/* Step: Upload */}
      {step === "select" && (
        <>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`bg-card rounded-xl border-2 border-dashed p-12 text-center shadow-sm cursor-pointer transition-colors ${
              selectedFile
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:border-primary/40"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-primary" />
                <div className="text-left">
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB &middot; Click to change
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium mb-1">
                  Drag and drop your file here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Excel (.xlsx) or CSV file using the template format
                </p>
              </>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {selectedFile && (
            <div className="flex justify-end">
              <button
                onClick={handlePreview}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Preview Data
              </button>
            </div>
          )}
        </>
      )}

      {/* Step: Preview */}
      {step === "preview" && preview && (
        <PreviewPanel
          preview={preview}
          loading={loading}
          error={error}
          onImport={handleImport}
          onBack={resetState}
        />
      )}

      {/* Step: Importing */}
      {step === "importing" && (
        <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
          <Loader2 className="h-8 w-8 text-primary mx-auto mb-3 animate-spin" />
          <p className="text-sm font-medium">Importing data...</p>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && importResult && (
        <ImportResultPanel result={importResult} onReset={resetState} />
      )}

      {/* How to Import */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">How to Import</h3>
        </div>
        <div className="p-3 mb-3 rounded-lg bg-primary/5 border border-primary/20">
          <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
            <li><span className="font-medium text-foreground">Download the template</span> — click the button above to get the Excel template</li>
            <li><span className="font-medium text-foreground">Fill it out</span> — one row per agent with roster info + metric values</li>
            <li><span className="font-medium text-foreground">Upload it</span> — the system handles everything: roster, metrics, and scoring</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-2">
            New metrics are auto-detected from column headers. Configure them (channel, weight, direction) on the Scorecard Config tab after upload.
          </p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <div className="flex items-start gap-2.5">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Template Structure</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Columns A-E (required): Agent Name, Email, BPO, Site, Supervisor
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Columns F+ (your metrics): Add any number of metric columns
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 font-mono">
                Agent Name | Email | BPO | Site | Supervisor | Voice AHT | Chat CPH | QA Score | ...
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Preview Panel
// ---------------------------------------------------------------------------

function PreviewPanel({
  preview,
  loading,
  error,
  onImport,
  onBack,
}: {
  preview: PreviewResult;
  loading: boolean;
  error: string | null;
  onImport: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Agents" value={preview.valid_rows} />
        {preview.total_metrics != null && (
          <SummaryCard label="Metrics Found" value={preview.total_metrics} />
        )}
        {preview.bpos && <SummaryCard label="BPOs" value={preview.bpos.length} />}
        {preview.sites && <SummaryCard label="Sites" value={preview.sites.length} />}
        {preview.supervisors && <SummaryCard label="Supervisors" value={preview.supervisors.length} />}
      </div>

      {/* Warnings */}
      {preview.warnings && preview.warnings.length > 0 && (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          {preview.warnings.map((w, i) => (
            <p key={i} className="text-sm text-yellow-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Errors */}
      {preview.errors.length > 0 && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-1">
          {preview.errors.slice(0, 5).map((e, i) => (
            <p key={i} className="text-sm text-red-600">{e}</p>
          ))}
          {preview.errors.length > 5 && (
            <p className="text-xs text-red-500">...and {preview.errors.length - 5} more</p>
          )}
        </div>
      )}

      {/* Metrics found */}
      {preview.metrics_found && preview.metrics_found.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <h4 className="text-sm font-medium mb-2">Metrics Detected</h4>
          <div className="flex flex-wrap gap-1.5">
            {preview.metrics_found.map((m) => (
              <span
                key={m}
                className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Data preview table */}
      {preview.preview.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h4 className="text-sm font-medium">
              Preview ({Math.min(preview.preview.length, 20)} of {preview.valid_rows} rows)
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20">
                  {Object.keys(preview.preview[0]).map((col) => (
                    <th key={col} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row, i) => (
                  <tr key={i} className="border-t border-border/50 hover:bg-muted/10">
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-3 py-2 whitespace-nowrap text-xs">
                        {String(val ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unknown type error */}
      {preview.error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-600">{preview.error}</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back
        </button>
        <button
          onClick={onImport}
          disabled={loading || preview.valid_rows === 0 || !!preview.error}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Import {preview.valid_rows} Rows
        </button>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Import Result Panel
// ---------------------------------------------------------------------------

function ImportResultPanel({
  result,
  onReset,
}: {
  result: ImportResult;
  onReset: () => void;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-8 shadow-sm text-center space-y-4">
      <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
      <div>
        <h2 className="text-lg font-semibold">Import Complete</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Performance data imported successfully
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-lg mx-auto">
        <StatBadge label="Agents Created" value={result.agents_created || 0} />
        <StatBadge label="Agents Updated" value={result.agents_updated || 0} />
        <StatBadge label="Records Created" value={result.records_created || 0} />
        <StatBadge label="Records Updated" value={result.records_updated || 0} />
        {result.metrics_created ? (
          <StatBadge label="New Metrics Detected" value={result.metrics_created} />
        ) : null}
        {result.agents_scored ? (
          <StatBadge label="Agents Scored" value={result.agents_scored} />
        ) : null}
      </div>

      {result.metrics_not_found && result.metrics_not_found.length > 0 && (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 max-w-lg mx-auto">
          <p className="text-xs text-yellow-700 mb-1 font-medium">Unmatched metrics:</p>
          <p className="text-xs text-yellow-600">
            {result.metrics_not_found.join(", ")}
          </p>
        </div>
      )}

      {(result.metrics_created ?? 0) > 0 && (
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 max-w-lg mx-auto">
          <p className="text-xs text-blue-700">
            {result.metrics_created} new metric{result.metrics_created !== 1 ? "s were" : " was"} detected and added to the system.
            Go to <span className="font-medium">Scorecard Config &rarr; Metrics</span> to set the channel, weight, and direction for each.
          </p>
        </div>
      )}

      {result.note && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 max-w-lg mx-auto">
          <p className="text-xs text-amber-700 flex items-center gap-1">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            {result.note}
          </p>
        </div>
      )}

      <button
        onClick={onReset}
        className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Import More Data
      </button>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-lg border border-border p-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-0.5">{value}</p>
    </div>
  );
}

function StatBadge({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 ${warn ? "bg-yellow-500/10" : "bg-muted/50"}`}>
      <p className={`text-xl font-bold ${warn ? "text-yellow-600" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
