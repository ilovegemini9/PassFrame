import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FlipHorizontal2,
  Grid2X2,
  ScanFace,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  formatPhysicalDimensions,
  searchCountrySpecs,
  type CountryPhotoSpec,
} from '../data/countrySpecs';
import type { BiometricReport, CheckStatus, SheetPreset } from '../utils/biometric';
import type { ImageTransformState } from '../utils/canvasExport';

interface ComplianceRailProps {
  specs: CountryPhotoSpec[];
  selectedSpec: CountryPhotoSpec;
  onSelectSpecId: (id: string) => void;
  report: BiometricReport;
  transform: ImageTransformState;
  onChangeTransform: (updater: (prev: ImageTransformState) => ImageTransformState) => void;
  exportFormat: 'image/jpeg' | 'image/png';
  onChangeExportFormat: (fmt: 'image/jpeg' | 'image/png') => void;
  jpegQuality: number;
  onChangeJpegQuality: (q: number) => void;
  autoFitMaxKb: boolean;
  onToggleAutoFitMaxKb: (val: boolean) => void;
  estimatedSizeKb: number | null;
  sheetPreset: SheetPreset;
  sheetPhotoCount: number;
  onDownloadSingle: () => void;
  onDownloadSheet: () => void;
  onAutoFit: () => void;
  isDetectingFace: boolean;
  faceDetectionWarning: string | null;
  onRedetectFace: () => void;
  isExporting: boolean;
  lastExportMessage: string | null;
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'pass') {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />;
  }
  if (status === 'warn') {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />;
  }
  return <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />;
}

function statusWord(status: CheckStatus): string {
  if (status === 'pass') return 'Pass';
  if (status === 'warn') return 'Adjust';
  return 'Fix';
}

export const ComplianceRail: React.FC<ComplianceRailProps> = ({
  specs,
  selectedSpec,
  onSelectSpecId,
  report,
  transform,
  onChangeTransform,
  exportFormat,
  onChangeExportFormat,
  jpegQuality,
  onChangeJpegQuality,
  autoFitMaxKb,
  onToggleAutoFitMaxKb,
  estimatedSizeKb,
  sheetPreset,
  sheetPhotoCount,
  onDownloadSingle,
  onDownloadSheet,
  onAutoFit,
  isDetectingFace,
  faceDetectionWarning,
  onRedetectFace,
  isExporting,
  lastExportMessage,
}) => {
  const [specQuery, setSpecQuery] = useState('');

  const filteredSpecs = useMemo(() => {
    const matches = searchCountrySpecs(specs, specQuery);
    if (matches.length === 0) return specs;
    if (matches.some((s) => s.id === selectedSpec.id)) return matches;
    return [selectedSpec, ...matches];
  }, [specs, specQuery, selectedSpec]);

  const matchCount = useMemo(
    () => (specQuery.trim() ? searchCountrySpecs(specs, specQuery).length : specs.length),
    [specs, specQuery]
  );

  const bannerStyles =
    report.overallStatus === 'pass'
      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
      : report.overallStatus === 'warn'
        ? 'border-amber-200 bg-amber-50/70 text-amber-950'
        : 'border-red-200 bg-red-50/70 text-red-950';

  const bannerHeadline =
    report.overallStatus === 'pass'
      ? 'Compliant with official spec'
      : report.overallStatus === 'warn'
        ? 'Borderline — minor tweak advised'
        : 'Out of spec — adjust framing';

  return (
    <aside aria-label="Compliance inspection and export controls" className="flex flex-col gap-5">
      {/* 1. Country / Document Preset Selector */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="country-spec-select"
            className="block text-xs font-semibold text-slate-700"
          >
            Official Country & Document Spec
          </label>
          <span className="font-mono-tabular text-[11px] text-slate-400">
            {specQuery.trim() ? `${matchCount} found` : `${specs.length} specs`}
          </span>
        </div>

        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <label htmlFor="studio-spec-search" className="sr-only">
            Filter country or visa specification
          </label>
          <input
            id="studio-spec-search"
            type="search"
            value={specQuery}
            onChange={(e) => setSpecQuery(e.target.value)}
            placeholder="Quick filter: DV Lottery, Schengen, Morocco..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/20"
          />
        </div>

        <select
          id="country-spec-select"
          value={selectedSpec.id}
          onChange={(e) => onSelectSpecId(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
        >
          {filteredSpecs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.country} — {s.document}
            </option>
          ))}
        </select>

        {specQuery.trim() && matchCount === 0 && (
          <p className="mt-1.5 text-[11px] text-amber-700">
            No preset matched "{specQuery}". Showing all {specs.length} specs.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
          <span className="font-mono-tabular">
            {selectedSpec.unit === 'px'
              ? `${selectedSpec.widthPx}×${selectedSpec.heightPx} px`
              : formatPhysicalDimensions(selectedSpec)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {selectedSpec.unit === 'px'
              ? `${selectedSpec.dpi} DPI`
              : `${selectedSpec.widthPx}×${selectedSpec.heightPx} px`}
          </span>
          <span aria-hidden="true">·</span>
          <span>Glasses: {selectedSpec.glassesAllowed}</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {selectedSpec.retouchWarning}
        </p>
      </div>

      {/* 2. Real-Time Biometric Compliance Report */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 ${bannerStyles}`}>
          <div className="flex items-start gap-2.5">
            <StatusIcon status={report.overallStatus} />
            <div>
              <p className="text-sm font-semibold">{bannerHeadline}</p>
              <p className="mt-0.5 text-xs opacity-85 font-mono-tabular">
                {isDetectingFace
                  ? 'Detecting face landmarks...'
                  : `${report.passCount}/${report.totalChecks} checks passing`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={report.overallStatus !== 'pass' ? onAutoFit : onRedetectFace}
              disabled={isDetectingFace}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 shadow-2xs hover:bg-slate-50 disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <ScanFace className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
              <span>{report.overallStatus !== 'pass' ? 'Auto-Fit' : 'Detect Face'}</span>
            </button>
          </div>
        </div>

        {faceDetectionWarning && !isDetectingFace && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {faceDetectionWarning}
          </p>
        )}

        <ul className="mt-4 divide-y divide-slate-100" aria-label="Biometric compliance checklist">
          {report.checks.map((item) => (
            <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusIcon status={item.status} />
                  <span className="text-xs font-semibold text-slate-900">{item.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-right">
                  <span className="font-mono-tabular text-xs font-medium text-slate-800">
                    {item.measured}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      item.status === 'pass'
                        ? 'text-emerald-700'
                        : item.status === 'warn'
                          ? 'text-amber-700'
                          : 'text-red-700'
                    }`}
                  >
                    {statusWord(item.status)}
                  </span>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 pl-6 text-[11px] text-slate-500">
                <span>{item.detail}</span>
                <span className="font-mono-tabular shrink-0 text-slate-400">
                  Target: {item.target}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 3. Precision Framing & Natural Light Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-slate-700">Framing & Natural Exposure</h2>
          <button
            type="button"
            onClick={() =>
              onChangeTransform((prev) => ({ ...prev, flipH: !prev.flipH }))
            }
            aria-pressed={transform.flipH}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <FlipHorizontal2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Flip</span>
          </button>
        </div>

        <div className="mt-3.5 space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="zoom-slider" className="font-medium text-slate-700">
                Zoom
              </label>
              <span className="font-mono-tabular text-slate-600">{transform.zoom.toFixed(2)}×</span>
            </div>
            <input
              id="zoom-slider"
              type="range"
              min={0.45}
              max={2.6}
              step={0.01}
              value={transform.zoom}
              onChange={(e) =>
                onChangeTransform((prev) => ({ ...prev, zoom: parseFloat(e.target.value) }))
              }
              className="studio-slider mt-1.5 w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="rotation-slider" className="font-medium text-slate-700">
                Head Tilt / Level
              </label>
              <span className="font-mono-tabular text-slate-600">
                {transform.rotationDeg > 0 ? `+${transform.rotationDeg.toFixed(1)}` : transform.rotationDeg.toFixed(1)}°
              </span>
            </div>
            <input
              id="rotation-slider"
              type="range"
              min={-12}
              max={12}
              step={0.2}
              value={transform.rotationDeg}
              onChange={(e) =>
                onChangeTransform((prev) => ({
                  ...prev,
                  rotationDeg: parseFloat(e.target.value),
                }))
              }
              className="studio-slider mt-1.5 w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="brightness-slider" className="font-medium text-slate-700">
                  Exposure
                </label>
                <span className="font-mono-tabular text-slate-600">{transform.brightness}%</span>
              </div>
              <input
                id="brightness-slider"
                type="range"
                min={75}
                max={130}
                step={1}
                value={transform.brightness}
                onChange={(e) =>
                  onChangeTransform((prev) => ({
                    ...prev,
                    brightness: parseInt(e.target.value, 10),
                  }))
                }
                className="studio-slider mt-1.5 w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="contrast-slider" className="font-medium text-slate-700">
                  Contrast
                </label>
                <span className="font-mono-tabular text-slate-600">{transform.contrast}%</span>
              </div>
              <input
                id="contrast-slider"
                type="range"
                min={80}
                max={125}
                step={1}
                value={transform.contrast}
                onChange={(e) =>
                  onChangeTransform((prev) => ({
                    ...prev,
                    contrast: parseInt(e.target.value, 10),
                  }))
                }
                className="studio-slider mt-1.5 w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Zero-Watermark Export Panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-slate-700">Export Files (No Watermark)</h2>
          <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => onChangeExportFormat('image/jpeg')}
              className={`rounded px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                exportFormat === 'image/jpeg'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              JPG
            </button>
            <button
              type="button"
              onClick={() => onChangeExportFormat('image/png')}
              className={`rounded px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                exportFormat === 'image/png'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              PNG
            </button>
          </div>
        </div>

        {exportFormat === 'image/jpeg' && (
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="quality-slider" className="font-medium text-slate-700">
                JPEG Quality
              </label>
              <span className="font-mono-tabular text-slate-600">
                {Math.round(jpegQuality * 100)}%
                {estimatedSizeKb !== null ? ` · ~${estimatedSizeKb} KB` : ''}
              </span>
            </div>
            <input
              id="quality-slider"
              type="range"
              min={0.5}
              max={0.98}
              step={0.02}
              value={jpegQuality}
              onChange={(e) => onChangeJpegQuality(parseFloat(e.target.value))}
              className="studio-slider w-full"
            />
            {selectedSpec.maxFileKb && (
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFitMaxKb}
                  onChange={(e) => onToggleAutoFitMaxKb(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
                />
                <span>
                  Auto-compress under{' '}
                  <span className="font-mono-tabular font-semibold text-slate-800">
                    {selectedSpec.maxFileKb} KB
                  </span>{' '}
                  portal limit
                </span>
              </label>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onDownloadSingle}
            disabled={isExporting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Download Digital Photo ({selectedSpec.widthPx}×{selectedSpec.heightPx})
            </span>
          </button>

          <button
            type="button"
            onClick={onDownloadSheet}
            disabled={isExporting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <Grid2X2 className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
            <span>
              Download {sheetPreset === '4x6' ? '4×6"' : 'A4'} Print Sheet ({sheetPhotoCount}×)
            </span>
          </button>
        </div>

        {lastExportMessage && (
          <p className="mt-2.5 text-xs font-medium text-emerald-700" role="status">
            {lastExportMessage}
          </p>
        )}

        <div className="mt-3.5 flex items-start gap-2 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <span>
            100% browser-local processing. Your photo never leaves your device and includes zero AI skin/face alteration.
          </span>
        </div>
      </div>
    </aside>
  );
};
