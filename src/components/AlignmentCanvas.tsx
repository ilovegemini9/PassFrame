import React, { useEffect, useRef, useState } from 'react';
import { Camera, Eye, EyeOff, Grid2X2, Image as ImageIcon, RotateCcw, Upload } from 'lucide-react';
import type { CountryPhotoSpec } from '../data/countrySpecs';
import { formatPhysicalDimensions } from '../data/countrySpecs';
import { computePrintSheetLayout, type SheetPreset } from '../utils/biometric';
import {
  renderAlignedPhotoToCanvas,
  renderPrintSheet,
  type CaliperPositions,
  type ImageTransformState,
} from '../utils/canvasExport';

export type WorkspaceMode = 'single' | 'sheet';

export interface SampleOption {
  id: string;
  label: string;
  src: string;
}

interface AlignmentCanvasProps {
  spec: CountryPhotoSpec;
  loadedImage: HTMLImageElement | null;
  imageName: string;
  transform: ImageTransformState;
  calipers: CaliperPositions;
  mode: WorkspaceMode;
  sheetPreset: SheetPreset;
  showGuides: boolean;
  samples: SampleOption[];
  activeSampleId: string | null;
  onSelectSample: (sample: SampleOption) => void;
  onOpenCamera: () => void;
  onTriggerUpload: () => void;
  onChangeMode: (mode: WorkspaceMode) => void;
  onChangeSheetPreset: (preset: SheetPreset) => void;
  onToggleGuides: () => void;
  onChangeTransform: (updater: (prev: ImageTransformState) => ImageTransformState) => void;
  onChangeCalipers: (updater: (prev: CaliperPositions) => CaliperPositions) => void;
  onResetAll: () => void;
}

type DragTarget = 'pan' | 'crown' | 'eye' | 'chin' | null;

export const AlignmentCanvas: React.FC<AlignmentCanvasProps> = ({
  spec,
  loadedImage,
  imageName,
  transform,
  calipers,
  mode,
  sheetPreset,
  showGuides,
  samples,
  activeSampleId,
  onSelectSample,
  onOpenCamera,
  onTriggerUpload,
  onChangeMode,
  onChangeSheetPreset,
  onToggleGuides,
  onChangeTransform,
  onChangeCalipers,
  onResetAll,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const [sheetPreviewUrl, setSheetPreviewUrl] = useState<string | null>(null);
  const [sheetCopyCount, setSheetCopyCount] = useState<number>(6);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Render live single-photo alignment canvas
  useEffect(() => {
    if (mode !== 'single') return;
    const canvas = canvasRef.current;
    if (!canvas || !loadedImage) return;
    // Render at sharp preview resolution preserving exact aspect ratio
    const maxPreviewEdge = 640;
    const aspect = spec.widthPx / spec.heightPx;
    const targetW = aspect >= 1 ? maxPreviewEdge : Math.round(maxPreviewEdge * aspect);
    const targetH = aspect >= 1 ? Math.round(maxPreviewEdge / aspect) : maxPreviewEdge;
    renderAlignedPhotoToCanvas(canvas, loadedImage, spec, transform, targetW, targetH);
  }, [mode, loadedImage, spec, transform]);

  // Render live print sheet preview when in sheet mode
  useEffect(() => {
    if (mode !== 'sheet' || !loadedImage) return;
    let active = true;
    let createdUrl: string | null = null;

    renderPrintSheet(loadedImage, spec, transform, sheetPreset, 0.45)
      .then((res) => {
        if (!active) {
          URL.revokeObjectURL(res.url);
          return;
        }
        createdUrl = res.url;
        setSheetPreviewUrl(res.url);
        setSheetCopyCount(res.count);
      })
      .catch(() => {
        // Ignore transient preview errors
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [mode, loadedImage, spec, transform, sheetPreset]);

  const sheetLayout = computePrintSheetLayout(sheetPreset, spec.widthMm, spec.heightMm, 300);

  const handlePointerDownPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragTarget) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragTarget('pan');
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: transform.panX,
      panY: transform.panY,
    };
  };

  const handlePointerDownCaliper = (
    target: 'crown' | 'eye' | 'chin',
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragTarget(target);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragTarget || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (dragTarget === 'pan') {
      const dx = (e.clientX - dragStartRef.current.x) / rect.width;
      const dy = (e.clientY - dragStartRef.current.y) / rect.height;
      onChangeTransform((prev) => ({
        ...prev,
        panX: Math.max(-0.85, Math.min(0.85, Number((dragStartRef.current.panX + dx).toFixed(3)))),
        panY: Math.max(-0.85, Math.min(0.85, Number((dragStartRef.current.panY + dy).toFixed(3)))),
      }));
      return;
    }

    const relY = Math.max(0.03, Math.min(0.96, (e.clientY - rect.top) / rect.height));
    onChangeCalipers((prev) => {
      if (dragTarget === 'crown') {
        const clamped = Math.min(prev.eyeY - 0.08, relY);
        return { ...prev, crownY: Number(clamped.toFixed(3)) };
      }
      if (dragTarget === 'eye') {
        const clamped = Math.max(prev.crownY + 0.08, Math.min(prev.chinY - 0.08, relY));
        return { ...prev, eyeY: Number(clamped.toFixed(3)) };
      }
      const clamped = Math.max(prev.eyeY + 0.08, relY);
      return { ...prev, chinY: Number(clamped.toFixed(3)) };
    });
  };

  const handlePointerUp = () => {
    setDragTarget(null);
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (mode !== 'single') return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    onChangeTransform((prev) => ({
      ...prev,
      zoom: Math.max(0.45, Math.min(2.8, Number((prev.zoom + delta).toFixed(2)))),
    }));
  };

  const eyeZoneTopPct = 100 - spec.eyeFromBottomMaxPct;
  const eyeZoneHeightPct = spec.eyeFromBottomMaxPct - spec.eyeFromBottomMinPct;

  return (
    <section
      aria-label="Biometric photo alignment workspace"
      className="flex flex-col rounded-xl border border-slate-200 bg-white"
    >
      {/* Workspace Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Canvas preview mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'single'}
              onClick={() => onChangeMode('single')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'single'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Single Photo</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'sheet'}
              onClick={() => onChangeMode('sheet')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'sheet'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Grid2X2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Print Sheet ({sheetLayout.tiles.length}×)</span>
            </button>
          </div>

          {mode === 'sheet' && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Paper sheet size">
              <button
                type="button"
                onClick={() => onChangeSheetPreset('4x6')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sheetPreset === '4x6'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                4×6 in
              </button>
              <button
                type="button"
                onClick={() => onChangeSheetPreset('a4')}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  sheetPreset === 'a4'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                A4 Sheet
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'single' && (
            <button
              type="button"
              onClick={onToggleGuides}
              aria-pressed={showGuides}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showGuides ? (
                <Eye className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              )}
              <span>{showGuides ? 'Guides On' : 'Guides Off'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onResetAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Stage Area */}
      <div
        className={`relative flex flex-col items-center justify-center bg-slate-100/80 p-5 sm:p-8 transition-colors ${
          isDraggingFile ? 'bg-blue-50/70' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFile(false);
          const file = e.dataTransfer.files?.[0];
          if (file && file.type.startsWith('image/')) {
            const event = new CustomEvent('passframe-file-drop', { detail: file });
            window.dispatchEvent(event);
          }
        }}
      >
        {/* Clean unboxed spec summary above stage */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{spec.country}</span>
          <span aria-hidden="true">·</span>
          <span>{spec.document}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {spec.unit === 'px' ? `${spec.widthPx}×${spec.heightPx} px` : formatPhysicalDimensions(spec)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {spec.unit === 'px' ? `${spec.dpi} DPI` : `${spec.widthPx}×${spec.heightPx} px`}
          </span>
        </div>

        {mode === 'single' ? (
          <div className="flex w-full flex-col items-center">
            <div
              ref={stageRef}
              data-testid="alignment-stage"
              onPointerDown={handlePointerDownPan}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheelZoom}
              style={{
                aspectRatio: `${spec.widthPx} / ${spec.heightPx}`,
              }}
              className="relative w-full max-w-[380px] select-none overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm touch-none cursor-grab active:cursor-grabbing"
            >
              <canvas
                ref={canvasRef}
                data-testid="alignment-canvas"
                aria-label="Aligned passport photo preview"
                className="block h-full w-full"
              />

              {/* Biometric overlay guides + interactive calipers */}
              {showGuides && (
                <div className="pointer-events-none absolute inset-0">
                  {/* Acceptable eye band */}
                  <div
                    style={{
                      top: `${eyeZoneTopPct}%`,
                      height: `${eyeZoneHeightPct}%`,
                    }}
                    className="absolute inset-x-0 border-y border-dashed border-blue-500/45 bg-blue-500/10"
                  />

                  {/* Center vertical axis */}
                  <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-blue-600/45" />

                  {/* Head target oval hint */}
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full"
                    aria-hidden="true"
                  >
                    <ellipse
                      cx="50"
                      cy={((calipers.crownY + calipers.chinY) / 2) * 100}
                      rx="26"
                      ry={((calipers.chinY - calipers.crownY) / 2) * 100}
                      fill="none"
                      stroke="rgba(37, 99, 235, 0.35)"
                      strokeWidth="0.6"
                      strokeDasharray="2 2"
                    />
                  </svg>

                  {/* Interactive Crown Caliper */}
                  <button
                    type="button"
                    aria-label="Adjust top of head caliper line"
                    onPointerDown={(e) => handlePointerDownCaliper('crown', e)}
                    style={{ top: `${calipers.crownY * 100}%` }}
                    className="pointer-events-auto absolute inset-x-0 -translate-y-1/2 flex items-center justify-between px-1.5 py-1.5 cursor-ns-resize group focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    <span className="h-[1.5px] w-full bg-emerald-600 group-hover:bg-emerald-500" />
                    <span className="ml-1.5 shrink-0 rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Crown
                    </span>
                  </button>

                  {/* Interactive Eye-Line Caliper */}
                  <button
                    type="button"
                    aria-label="Adjust eye level caliper line"
                    onPointerDown={(e) => handlePointerDownCaliper('eye', e)}
                    style={{ top: `${calipers.eyeY * 100}%` }}
                    className="pointer-events-auto absolute inset-x-0 -translate-y-1/2 flex items-center justify-between px-1.5 py-1.5 cursor-ns-resize group focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    <span className="h-[1.5px] w-full bg-blue-700 group-hover:bg-blue-600" />
                    <span className="ml-1.5 shrink-0 rounded bg-blue-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Eyes
                    </span>
                  </button>

                  {/* Interactive Chin Caliper */}
                  <button
                    type="button"
                    aria-label="Adjust chin bottom caliper line"
                    onPointerDown={(e) => handlePointerDownCaliper('chin', e)}
                    style={{ top: `${calipers.chinY * 100}%` }}
                    className="pointer-events-auto absolute inset-x-0 -translate-y-1/2 flex items-center justify-between px-1.5 py-1.5 cursor-ns-resize group focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    <span className="h-[1.5px] w-full bg-emerald-600 group-hover:bg-emerald-500" />
                    <span className="ml-1.5 shrink-0 rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Chin
                    </span>
                  </button>
                </div>
              )}
            </div>

            <p className="mt-3 text-center text-xs text-slate-500">
              Drag photo to center · Scroll to zoom · Drag <span className="font-medium text-slate-700">Crown / Eyes / Chin</span> markers onto your face
            </p>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center">
            <div
              data-testid="print-sheet-preview"
              className="w-full max-w-[560px] overflow-hidden rounded-lg border border-slate-300 bg-white p-2 shadow-sm"
            >
              {sheetPreviewUrl ? (
                <img
                  src={sheetPreviewUrl}
                  alt={`${sheetPreset.toUpperCase()} print sheet preview with ${sheetCopyCount} biometric photos`}
                  referrerPolicy="no-referrer"
                  className="block h-auto w-full rounded"
                />
              ) : (
                <div className="flex aspect-[3/2] items-center justify-center bg-slate-50 text-xs text-slate-500">
                  Rendering print sheet layout...
                </div>
              )}
            </div>
            <p className="mt-3 text-center text-xs text-slate-600">
              <span className="font-mono-tabular font-semibold text-slate-900">{sheetCopyCount} photos</span>
              <span aria-hidden="true"> · </span>
              <span>{sheetPreset === '4x6' ? '4×6 in (10×15 cm) photo paper' : 'A4 (210×297 mm) sheet'}</span>
              <span aria-hidden="true"> · </span>
              <span>300 DPI borderless print</span>
            </p>
          </div>
        )}
      </div>

      {/* Bottom Source Bar: Instant Demo Portraits + Camera + Upload */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">Source:</span>
          {samples.map((sample) => {
            const isSelected = activeSampleId === sample.id;
            return (
              <button
                key={sample.id}
                type="button"
                onClick={() => onSelectSample(sample)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'border-blue-700 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <img
                  src={sample.src}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-4 w-4 rounded-xs object-cover"
                />
                <span>{sample.label}</span>
              </button>
            );
          })}
          {!activeSampleId && (
            <span className="text-xs font-medium text-slate-700 truncate max-w-[180px]">
              {imageName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCamera}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Use Camera</span>
          </button>
          <button
            type="button"
            onClick={onTriggerUpload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Choose File</span>
          </button>
        </div>
      </div>
    </section>
  );
};
