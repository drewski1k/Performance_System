import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  ClipboardPaste,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  X,
  Info,
} from "lucide-react";
import api from "../api/client";

type DataType = "auto" | "combined" | "glance_report" | "qa_data" | "hc_data";
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
  metrics_not_found?: string[];
}

const DATA_TYPES: { value: DataType; label: string; desc: string }[] = [
  { value: "auto", label: "Auto-Detect", desc: "Automatically detect the data format from column headers" },
  { value: "combined", label: "Combined Data", desc: "All-in-one: metrics, QA, durations per agent per cycle" },
  { value: "glance_report", label: "Agent Summary Glance Report", desc: "Raw Gladly export with time, contacts, handle times" },
  { value: "qa_data", label: "QA Data", desc: "Quality evaluation scores and counts" },
  { value: "hc_data", label: "HC Data (Hierarchy)", desc: "Agent roster: name, supervisor, site, BPO" },
];

export default function ImportPage() {
  const [step, setStep] = useState<ImportStep>("select");
  const [inputMode, setInputMode] = useState<"upload" | "paste">("upload");
  const [dataType, setDataType] = useState<DataType>("auto");
  const [cycle, setCycle] = useState<string>("");
  const [pasteText, setPasteText] = useState("");
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
    setPasteText("");
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
    setLoading(true);
    setError(null);

    try {
      let result: PreviewResult;

      if (inputMode === "upload" && selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const params = new URLSearchParams();
        if (dataType !== "auto") params.set("data_type", dataType);
        if (cycle) params.set("cycle", cycle);

        const resp = await api.post(
          `/performance/import/preview?${params.toString()}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        result = resp.data;
      } else {
        const resp = await api.post("/performance/import/paste/preview", {
          text: pasteText,
          data_type: dataType === "auto" ? null : dataType,
          cycle: cycle ? parseInt(cycle) : null,
        });
        result = resp.data;
      }

      setPreview(result);
      setStep("preview");
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [inputMode, selectedFile, pasteText, dataType, cycle]);

  const handleImport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStep("importing");

    try {
      let result: ImportResult;

      if (inputMode === "upload" && selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const params = new URLSearchParams();
        if (dataType !== "auto" && preview?.data_type)
          params.set("data_type", preview.data_type);
        if (cycle) params.set("cycle", cycle);
        // TODO: template_id and period_id from context/selection

        const resp = await api.post(
          `/performance/import/upload?${params.toString()}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        result = resp.data;
      } else {
        const resp = await api.post("/performance/import/paste", {
          text: pasteText,
          data_type: preview?.data_type || (dataType === "auto" ? null : dataType),
          cycle: cycle ? parseInt(cycle) : null,
          // TODO: template_id and period_id from context/selection
        });
        result = resp.data;
      }

      setImportResult(result);
      setStep("done");
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Import failed");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }, [inputMode, selectedFile, pasteText, dataType, cycle, preview]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload files or paste data from your reports
          </p>
        </div>
        {step !== "select" && (
          <button
            onClick={resetState}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" /> Start Over
          </button>
        )}
      </div>

      {/* Step: Select Data Source */}
      {step === "select" && (
        <>
          {/* Input Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setInputMode("upload")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                inputMode === "upload"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <Upload className="h-4 w-4" />
              Upload File
            </button>
            <button
              onClick={() => setInputMode("paste")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                inputMode === "paste"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              <ClipboardPaste className="h-4 w-4" />
              Paste Data
            </button>
          </div>

          {/* Data Type Selector */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <label className="text-sm font-medium mb-2 block">Data Source Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {DATA_TYPES.map((dt) => (
                <button
                  key={dt.value}
                  onClick={() => setDataType(dt.value)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    dataType === dt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30 bg-muted/30"
                  }`}
                >
                  <p className="text-sm font-medium">{dt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{dt.desc}</p>
                </button>
              ))}
            </div>

            {/* Cycle filter (for combined data) */}
            {(dataType === "auto" || dataType === "combined") && (
              <div className="mt-4 flex items-center gap-3">
                <label className="text-sm text-muted-foreground">Cycle Filter (optional):</label>
                <input
                  type="number"
                  value={cycle}
                  onChange={(e) => setCycle(e.target.value)}
                  placeholder="e.g. 3"
                  className="w-24 px-3 py-1.5 text-sm border border-border rounded-lg bg-background"
                />
              </div>
            )}
          </div>

          {/* Upload Zone */}
          {inputMode === "upload" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`bg-card rounded-xl border-2 border-dashed p-10 text-center shadow-sm cursor-pointer transition-colors ${
                selectedFile
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.tsv"
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
                    Supports CSV, TSV, and Excel (.xlsx) files
                  </p>
                </>
              )}
            </div>
          )}

          {/* Paste Zone */}
          {inputMode === "paste" && (
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                <ClipboardPaste className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Paste tab-separated or CSV data below</span>
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`Paste your data here. Include the header row.\n\nExample (tab-separated):\nPerson Name\tCycle\tLogged in Time (hrs)\tPhone Calls Accepted\tAvg Quality Score %\nJohn Smith\t3\t80.5\t245\t0.92`}
                className="w-full h-64 p-4 text-sm font-mono bg-background resize-y focus:outline-none"
              />
              <div className="px-4 py-2 border-t border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  {pasteText
                    ? `${pasteText.split("\n").length - 1} data rows detected`
                    : "Tip: Copy rows from Excel and paste here (Ctrl+V)"}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Preview Button */}
          <div className="flex justify-end">
            <button
              onClick={handlePreview}
              disabled={loading || (inputMode === "upload" ? !selectedFile : !pasteText.trim())}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Preview Data
            </button>
          </div>
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

      {/* Help Section */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Supported Data Sources</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            {
              name: "Combined Data",
              desc: "All-in-one sheet with metrics, QA, and durations per agent per cycle",
              cols: "Person Name, Cycle, Logged in Time, Phone Calls, QA Score, ...",
            },
            {
              name: "Agent Summary Glance Report",
              desc: "Raw export from Gladly with channel-level available times",
              cols: "Name or Email, Logged in Time in seconds, Contact Accepted - Phone Call, ...",
            },
            {
              name: "QA Data",
              desc: "Quality evaluation scores imported separately",
              cols: "Associate Name, Total Evaluations, Average Quality Score %",
            },
            {
              name: "HC Data (Hierarchy)",
              desc: "Sets up the org structure: agents, supervisors, sites",
              cols: "Associate Name, Job Title, BPO, Site, Supervisor",
            },
          ].map((src) => (
            <div key={src.name} className="p-3 rounded-lg bg-muted/40">
              <div className="flex items-start gap-2.5">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{src.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{src.desc}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 font-mono">{src.cols}</p>
                </div>
              </div>
            </div>
          ))}
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
  const isHC = preview.data_type === "hc_data";

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Data Type"
          value={preview.data_type?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Unknown"}
        />
        <SummaryCard label="Valid Rows" value={preview.valid_rows} />
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
              Data Preview ({Math.min(preview.preview.length, 20)} of {preview.valid_rows} rows)
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
  const isHC = result.data_type === "hc_data";

  return (
    <div className="bg-card rounded-xl border border-border p-8 shadow-sm text-center space-y-4">
      <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
      <div>
        <h2 className="text-lg font-semibold">Import Complete</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {result.data_type?.replace(/_/g, " ")} data imported successfully
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-lg mx-auto">
        {isHC ? (
          <>
            <StatBadge label="Sites Created" value={result.sites_created || 0} />
            <StatBadge label="Supervisors Created" value={result.supervisors_created || 0} />
            <StatBadge label="Agents Created" value={result.agents_created || 0} />
            <StatBadge label="Agents Updated" value={result.agents_updated || 0} />
          </>
        ) : (
          <>
            <StatBadge label="Records Created" value={result.records_created || 0} />
            <StatBadge label="Records Updated" value={result.records_updated || 0} />
            {result.agents_not_found ? (
              <StatBadge label="Agents Not Found" value={result.agents_not_found} warn />
            ) : null}
          </>
        )}
      </div>

      {result.metrics_not_found && result.metrics_not_found.length > 0 && (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 max-w-lg mx-auto">
          <p className="text-xs text-yellow-700 mb-1 font-medium">Unmatched metrics (not in scorecard template):</p>
          <p className="text-xs text-yellow-600">
            {result.metrics_not_found.join(", ")}
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
