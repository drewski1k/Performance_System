import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Info,
  Trash2,
  ArrowRight,
  Save,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../api/client";

type ImportStep = "select" | "mapping" | "importing" | "done";

// ── Types ────────────────────────────────────────────────────────────────────

interface ColumnMapping {
  index: number;
  original: string;
  suggested_mapping: string;
  suggested_label: string;
  confidence: number;
  mapping_type: "roster" | "metric" | "exclude";
  mapped_to?: string;  // for roster: "agent_name", "email", etc.
}

interface RosterField {
  key: string;
  label: string;
  required: boolean;
}

interface MatchingProfile {
  id: string;
  name: string;
  similarity: number;
  mappings: ColumnMapping[];
}

interface DetectResult {
  columns: ColumnMapping[];
  roster_fields: RosterField[];
  unmapped_required: string[];
  total_rows: number;
  sample_data: Record<string, string>[];
  matching_profiles: MatchingProfile[];
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

// ── Main Component ───────────────────────────────────────────────────────────

export default function ImportPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<ImportStep>("select");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveProfileName, setSaveProfileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear all data
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const resetState = useCallback(() => {
    setStep("select");
    setDetectResult(null);
    setColumnMappings([]);
    setImportResult(null);
    setError(null);
    setSelectedFile(null);
    setSaveProfileName("");
  }, []);

  const handleClearAllData = useCallback(async () => {
    setClearing(true);
    try {
      await api.delete("/performance/reset");
      queryClient.removeQueries();
      resetState();
      setShowClearConfirm(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to clear data");
    } finally {
      setClearing(false);
    }
  }, [queryClient, resetState]);

  // ── Step 1: Detect columns ───────────────────────────────────────────────

  const handleDetectColumns = useCallback(async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const resp = await api.post("/performance/import/detect-columns", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data: DetectResult = resp.data;
      setDetectResult(data);

      // If there's a matching profile, apply it; otherwise use suggestions
      if (data.matching_profiles.length > 0) {
        const profile = data.matching_profiles[0];
        // Map profile mappings to current columns
        const profileMap = new Map(
          profile.mappings.map((m: any) => [m.original, m])
        );
        const mappings = data.columns.map((col) => {
          const saved = profileMap.get(col.original);
          if (saved) {
            return {
              ...col,
              mapping_type: saved.mapping_type,
              mapped_to: saved.mapped_to,
            };
          }
          return col;
        });
        setColumnMappings(mappings);
      } else {
        // Use auto-detected suggestions
        setColumnMappings(data.columns.map((col) => ({
          ...col,
          mapped_to: col.mapping_type === "roster" ? col.suggested_mapping : undefined,
        })));
      }

      setStep("mapping");
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Failed to analyze file");
    } finally {
      setLoading(false);
    }
  }, [selectedFile]);

  // ── Step 2: Execute mapped import ────────────────────────────────────────

  const handleMappedImport = useCallback(async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setStep("importing");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("mappings", JSON.stringify(columnMappings));
      if (saveProfileName) {
        formData.append("profile_name", saveProfileName);
      }

      const resp = await api.post("/performance/import/mapped", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setImportResult(resp.data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["scoring-periods"] });
      queryClient.invalidateQueries({ queryKey: ["scorecard-templates"] });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Import failed");
      setStep("mapping");
    } finally {
      setLoading(false);
    }
  }, [selectedFile, columnMappings, saveProfileName, queryClient]);

  // ── Mapping helpers ──────────────────────────────────────────────────────

  const updateMapping = (index: number, updates: Partial<ColumnMapping>) => {
    setColumnMappings((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const rosterMappings = columnMappings.filter((m) => m.mapping_type === "roster");
  const metricMappings = columnMappings.filter((m) => m.mapping_type === "metric");
  const excludedMappings = columnMappings.filter((m) => m.mapping_type === "exclude");
  const hasAgentName = rosterMappings.some((m) => m.mapped_to === "agent_name");

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload any spreadsheet — we'll help you map the columns
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Clear All Data
          </button>
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

      {/* Clear All Data Confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Clear All Data</h3>
                <p className="text-xs text-muted-foreground">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              This will delete all imported data including agents, metrics, scores, templates, and configurations. You'll need to re-import everything.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllData}
                disabled={clearing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {clearing ? "Clearing..." : "Clear Everything"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step: Select file */}
      {step === "select" && (
        <>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setSelectedFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            className={`bg-card rounded-xl border-2 border-dashed p-12 text-center shadow-sm cursor-pointer transition-colors ${
              selectedFile ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }}
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
                  Excel (.xlsx) or CSV — any column layout
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
                onClick={handleDetectColumns}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Analyze Columns
              </button>
            </div>
          )}

          {/* How it works */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">How It Works</h3>
            </div>
            <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
              <li><span className="font-medium text-foreground">Upload any file</span> — we'll auto-detect your columns</li>
              <li><span className="font-medium text-foreground">Map your columns</span> — tell us which column is the agent name, site, etc.</li>
              <li><span className="font-medium text-foreground">Everything else becomes a metric</span> — configure them on the Scorecard Config tab</li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">
              Save your mapping as a profile so next time it's applied automatically.
            </p>
          </div>
        </>
      )}

      {/* Step: Column Mapping */}
      {step === "mapping" && detectResult && (
        <MappingPanel
          detectResult={detectResult}
          mappings={columnMappings}
          onUpdateMapping={updateMapping}
          rosterFields={detectResult.roster_fields}
          hasAgentName={hasAgentName}
          rosterCount={rosterMappings.length}
          metricCount={metricMappings.length}
          excludedCount={excludedMappings.length}
          loading={loading}
          error={error}
          saveProfileName={saveProfileName}
          onSaveProfileNameChange={setSaveProfileName}
          onImport={handleMappedImport}
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
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Mapping Panel
// ─────────────────────────────────────────────────────────────────────────────

function MappingPanel({
  detectResult,
  mappings,
  onUpdateMapping,
  rosterFields,
  hasAgentName,
  rosterCount,
  metricCount,
  excludedCount,
  loading,
  error,
  saveProfileName,
  onSaveProfileNameChange,
  onImport,
  onBack,
}: {
  detectResult: DetectResult;
  mappings: ColumnMapping[];
  onUpdateMapping: (index: number, updates: Partial<ColumnMapping>) => void;
  rosterFields: RosterField[];
  hasAgentName: boolean;
  rosterCount: number;
  metricCount: number;
  excludedCount: number;
  loading: boolean;
  error: string | null;
  saveProfileName: string;
  onSaveProfileNameChange: (v: string) => void;
  onImport: () => void;
  onBack: () => void;
}) {
  // Collect which roster keys are already assigned
  const usedRosterKeys = new Set(
    mappings
      .filter((m) => m.mapping_type === "roster" && m.mapped_to)
      .map((m) => m.mapped_to!)
  );

  return (
    <div className="space-y-4">
      {/* Matched profile banner */}
      {detectResult.matching_profiles.length > 0 && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <p className="text-sm text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Saved profile <strong>"{detectResult.matching_profiles[0].name}"</strong> auto-applied
            ({Math.round(detectResult.matching_profiles[0].similarity * 100)}% column match).
            Review below and adjust if needed.
          </p>
        </div>
      )}

      {/* Summary bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold">{detectResult.total_rows}</span>
          <span className="text-muted-foreground">rows detected</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
            {rosterCount} roster
          </span>
          <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
            {metricCount} metrics
          </span>
          {excludedCount > 0 && (
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">
              {excludedCount} excluded
            </span>
          )}
        </div>
        {!hasAgentName && (
          <span className="text-xs text-red-600 font-medium flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Agent Name must be mapped
          </span>
        )}
      </div>

      {/* Column mapping table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h4 className="text-sm font-medium">Column Mapping</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Map each column to a roster field, keep as metric, or exclude it
          </p>
        </div>

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border grid grid-cols-[2fr_1fr_2fr_4fr] gap-0 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Your Column</span>
          <span>Type</span>
          <span>Maps To</span>
          <span>Sample Data</span>
        </div>

        <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
          {mappings.map((col, idx) => {
            const isRoster = col.mapping_type === "roster";
            const isExcluded = col.mapping_type === "exclude";
            const confidence = col.confidence;

            return (
              <div
                key={idx}
                className={`grid grid-cols-[2fr_1fr_2fr_4fr] gap-0 px-4 py-2.5 items-center text-sm transition-colors ${
                  isExcluded ? "bg-gray-50 opacity-60" : isRoster ? "bg-blue-50/30" : ""
                }`}
              >
                {/* Column name + confidence */}
                <div className="flex items-center gap-2">
                  <span className="font-medium text-xs truncate" title={col.original}>
                    {col.original}
                  </span>
                  {confidence >= 0.8 && isRoster && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  )}
                </div>

                {/* Type selector */}
                <div>
                  <select
                    value={col.mapping_type}
                    onChange={(e) => {
                      const newType = e.target.value as "roster" | "metric" | "exclude";
                      onUpdateMapping(idx, {
                        mapping_type: newType,
                        mapped_to: newType === "roster" ? "" : undefined,
                      });
                    }}
                    className={`text-xs px-2 py-1 rounded border border-input bg-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring ${
                      isRoster ? "text-blue-700" : isExcluded ? "text-gray-400" : "text-purple-700"
                    }`}
                  >
                    <option value="roster">Roster</option>
                    <option value="metric">Metric</option>
                    <option value="exclude">Exclude</option>
                  </select>
                </div>

                {/* Maps to */}
                <div>
                  {isRoster ? (
                    col.mapped_to?.startsWith("custom:") ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={col.mapped_to.slice(7)}
                          onChange={(e) => onUpdateMapping(idx, { mapped_to: `custom:${e.target.value}` })}
                          placeholder="Field name..."
                          className="w-24 text-xs px-2 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          autoFocus
                        />
                        <button
                          onClick={() => onUpdateMapping(idx, { mapped_to: "" })}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <select
                        value={col.mapped_to || ""}
                        onChange={(e) => onUpdateMapping(idx, { mapped_to: e.target.value === "__custom__" ? "custom:" : e.target.value })}
                        className={`text-xs px-2 py-1 rounded border border-input bg-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring w-full ${
                          !col.mapped_to ? "text-red-500 border-red-300" : "text-blue-700"
                        }`}
                      >
                        <option value="">-- Select Field --</option>
                        {rosterFields.map((f) => (
                          <option
                            key={f.key}
                            value={f.key}
                            disabled={usedRosterKeys.has(f.key) && col.mapped_to !== f.key}
                          >
                            {f.label}{f.required ? " *" : ""}
                            {usedRosterKeys.has(f.key) && col.mapped_to !== f.key ? " (used)" : ""}
                          </option>
                        ))}
                        <option value="__custom__">+ Custom Field...</option>
                      </select>
                    )
                  ) : isExcluded ? (
                    <span className="text-xs text-gray-400 italic">skipped</span>
                  ) : (
                    <span className="text-xs text-purple-600 truncate" title={col.original}>
                      auto-metric
                    </span>
                  )}
                </div>

                {/* Sample data */}
                <div className="flex gap-2 overflow-hidden">
                  {detectResult.sample_data.slice(0, 3).map((row, i) => (
                    <span
                      key={i}
                      className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded truncate max-w-[120px]"
                      title={row[col.original]}
                    >
                      {row[col.original] || "—"}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Save profile + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Save className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={saveProfileName}
              onChange={(e) => onSaveProfileNameChange(e.target.value)}
              placeholder="Save mapping as profile..."
              className="w-52 border border-input rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={onImport}
            disabled={loading || !hasAgentName}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import {detectResult.total_rows} Rows
          </button>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Import Result Panel
// ─────────────────────────────────────────────────────────────────────────────

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
          <StatBadge label="New Metrics" value={result.metrics_created} />
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
            {result.metrics_created} new metric{result.metrics_created !== 1 ? "s were" : " was"} detected.
            Go to <span className="font-medium">Scorecard Config &rarr; Metrics</span> to configure them.
          </p>
        </div>
      )}

      {result.note && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 max-w-lg mx-auto">
          <p className="text-xs text-amber-700 flex items-center justify-center gap-1">
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


// ─────────────────────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────────────────────

function StatBadge({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 ${warn ? "bg-yellow-500/10" : "bg-muted/50"}`}>
      <p className={`text-xl font-bold ${warn ? "text-yellow-600" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
