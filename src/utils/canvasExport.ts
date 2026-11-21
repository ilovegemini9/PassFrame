import type { CountryPhotoSpec } from '../data/countrySpecs';
import {
  analyzeEdgePixels,
  computePrintSheetLayout,
  patchJpegDpiBytes,
  type EdgeAnalysisResult,
  type SheetPreset,
} from './biometric';

export interface ImageTransformState {
  /** Zoom multiplier where 1.0 fits the source image nicely inside the frame */
  zoom: number;
  /** Horizontal pan offset in normalized output frame fraction (-0.5..+0.5) */
  panX: number;
  /** Vertical pan offset in normalized output frame fraction (-0.5..+0.5) */
  panY: number;
  /** Fine rotation in degrees (-15..+15) */
  rotationDeg: number;
  /** Horizontal mirror */
  flipH: boolean;
  /** Exposure / brightness percentage (70..135, default 100) */
  brightness: number;
  /** Contrast percentage (80..125, default 100) */
  contrast: number;
  /** Grayscale toggle for legacy monochrome requirements */
  grayscale: boolean;
}

export const DEFAULT_TRANSFORM: ImageTransformState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  rotationDeg: 0,
  flipH: false,
  brightness: 100,
  contrast: 100,
  grayscale: false,
};

export interface CaliperPositions {
  /** Top of head (crown) as 0..1 fraction from top */
  crownY: number;
  /** Eye level as 0..1 fraction from top */
  eyeY: number;
  /** Bottom of chin as 0..1 fraction from top */
  chinY: number;
}

export function getRecommendedCalipers(spec: CountryPhotoSpec): CaliperPositions {
  const targetHeadPct = (spec.headMinPct + spec.headMaxPct) / 2 / 100;
  const targetEyeFromBottom = (spec.eyeFromBottomMinPct + spec.eyeFromBottomMaxPct) / 2 / 100;
  const eyeY = 1 - targetEyeFromBottom;
  // Eyes sit roughly 48% down from crown to chin
  const crownY = Math.max(0.04, eyeY - targetHeadPct * 0.48);
  const chinY = Math.min(0.92, crownY + targetHeadPct);
  return {
    crownY: Number(crownY.toFixed(3)),
    eyeY: Number(eyeY.toFixed(3)),
    chinY: Number(chinY.toFixed(3)),
  };
}

/**
 * Computes the base scale needed so the source image covers the target frame.
 */
export function computeBaseCoverScale(
  imgWidth: number,
  imgHeight: number,
  frameWidth: number,
  frameHeight: number
): number {
  if (imgWidth <= 0 || imgHeight <= 0) return 1;
  return Math.max(frameWidth / imgWidth, frameHeight / imgHeight);
}

/**
 * Draws the user's source image onto a destination 2D canvas context with exact
 * zoom, pan, rotation, mirror, and natural brightness/contrast calibration.
 */
export function renderAlignedPhotoToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  spec: CountryPhotoSpec,
  transform: ImageTransformState,
  targetWidthPx: number = spec.widthPx,
  targetHeightPx: number = spec.heightPx
): void {
  canvas.width = targetWidthPx;
  canvas.height = targetHeightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.fillStyle = spec.backgroundHex || '#FFFFFF';
  ctx.fillRect(0, 0, targetWidthPx, targetHeightPx);

  ctx.filter = [
    `brightness(${transform.brightness}%)`,
    `contrast(${transform.contrast}%)`,
    transform.grayscale ? 'grayscale(100%)' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const baseScale = computeBaseCoverScale(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    targetWidthPx,
    targetHeightPx
  );
  const scale = baseScale * transform.zoom;

  ctx.translate(
    targetWidthPx / 2 + transform.panX * targetWidthPx,
    targetHeightPx / 2 + transform.panY * targetHeightPx
  );
  ctx.rotate((transform.rotationDeg * Math.PI) / 180);
  ctx.scale(transform.flipH ? -scale : scale, scale);

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

export function sampleCanvasEdgeLighting(
  img: HTMLImageElement,
  spec: CountryPhotoSpec,
  transform: ImageTransformState
): EdgeAnalysisResult {
  const sampleW = 120;
  const sampleH = Math.max(60, Math.round((120 * spec.heightPx) / spec.widthPx));
  const offscreen = document.createElement('canvas');
  renderAlignedPhotoToCanvas(offscreen, img, spec, transform, sampleW, sampleH);
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      meanLuminance: 0,
      stdDev: 0,
      uniformityScore: 0,
      status: 'warn',
      feedback: 'Canvas context unavailable.',
    };
  }
  const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
  return analyzeEdgePixels(imageData.data, sampleW, sampleH, spec.minBgLuminance);
}

export interface EncodedPhotoResult {
  blob: Blob;
  url: string;
  sizeKb: number;
  qualityUsed: number;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
  dpi?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode photo canvas.'));
          return;
        }
        if (mimeType === 'image/jpeg' && dpi) {
          const buf = new Uint8Array(await blob.arrayBuffer());
          const patched = patchJpegDpiBytes(buf, dpi);
          const copy = new Uint8Array(patched.length);
          copy.set(patched);
          resolve(new Blob([copy.buffer], { type: 'image/jpeg' }));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

export async function exportSinglePhoto(
  img: HTMLImageElement,
  spec: CountryPhotoSpec,
  transform: ImageTransformState,
  format: 'image/jpeg' | 'image/png',
  requestedQuality: number,
  autoFitMaxKb: boolean
): Promise<EncodedPhotoResult> {
  const canvas = document.createElement('canvas');
  renderAlignedPhotoToCanvas(canvas, img, spec, transform, spec.widthPx, spec.heightPx);

  if (format === 'image/png') {
    const blob = await canvasToBlob(canvas, 'image/png', 1);
    return {
      blob,
      url: URL.createObjectURL(blob),
      sizeKb: Math.round(blob.size / 1024),
      qualityUsed: 100,
    };
  }

  let quality = Math.max(0.35, Math.min(0.98, requestedQuality));
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality, spec.dpi);

  if (autoFitMaxKb && spec.maxFileKb && blob.size / 1024 > spec.maxFileKb) {
    let low = 0.35;
    let high = quality;
    for (let i = 0; i < 6; i++) {
      const mid = (low + high) / 2;
      const candidate = await canvasToBlob(canvas, 'image/jpeg', mid, spec.dpi);
      if (candidate.size / 1024 <= spec.maxFileKb) {
        blob = candidate;
        quality = mid;
        low = mid;
      } else {
        high = mid;
      }
    }
    if (blob.size / 1024 > spec.maxFileKb) {
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.35, spec.dpi);
      quality = 0.35;
    }
  }

  return {
    blob,
    url: URL.createObjectURL(blob),
    sizeKb: Math.round(blob.size / 1024),
    qualityUsed: Math.round(quality * 100),
  };
}

export interface RenderedSheetResult {
  blob: Blob;
  url: string;
  sizeKb: number;
  count: number;
  sheetWidthPx: number;
  sheetHeightPx: number;
}

export async function renderPrintSheet(
  img: HTMLImageElement,
  spec: CountryPhotoSpec,
  transform: ImageTransformState,
  sheetPreset: SheetPreset,
  previewScale: number = 1
): Promise<RenderedSheetResult> {
  const dpi = Math.round(300 * previewScale);
  const layout = computePrintSheetLayout(sheetPreset, spec.widthMm, spec.heightMm, dpi);

  const singleCanvas = document.createElement('canvas');
  renderAlignedPhotoToCanvas(
    singleCanvas,
    img,
    spec,
    transform,
    layout.photoWidthPx,
    layout.photoHeightPx
  );

  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = layout.sheetWidthPx;
  sheetCanvas.height = layout.sheetHeightPx;
  const ctx = sheetCanvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create print sheet canvas.');

  // Clean photographic white paper base
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, layout.sheetWidthPx, layout.sheetHeightPx);

  const tick = Math.max(8, Math.round(20 * previewScale));
  const lineW = Math.max(1, Math.round(1.5 * previewScale));

  for (const tile of layout.tiles) {
    ctx.drawImage(singleCanvas, tile.xPx, tile.yPx, tile.widthPx, tile.heightPx);

    // Subtle hairline border around each photo
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = lineW;
    ctx.strokeRect(tile.xPx, tile.yPx, tile.widthPx, tile.heightPx);

    // Corner scissor crop marks
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = lineW;
    const x1 = tile.xPx;
    const y1 = tile.yPx;
    const x2 = tile.xPx + tile.widthPx;
    const y2 = tile.yPx + tile.heightPx;

    ctx.beginPath();
    // Top-left
    ctx.moveTo(x1 - tick, y1);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x1, y1 - tick);
    ctx.lineTo(x1, y1);
    // Top-right
    ctx.moveTo(x2, y1);
    ctx.lineTo(x2 + tick, y1);
    ctx.moveTo(x2, y1 - tick);
    ctx.lineTo(x2, y1);
    // Bottom-left
    ctx.moveTo(x1 - tick, y2);
    ctx.lineTo(x1, y2);
    ctx.moveTo(x1, y2);
    ctx.lineTo(x1, y2 + tick);
    // Bottom-right
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 + tick, y2);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2, y2 + tick);
    ctx.stroke();
  }

  // Minimal technical footer on paper margin (print-shop cutting guide)
  const fontSize = Math.max(10, Math.round(20 * previewScale));
  ctx.fillStyle = '#64748B';
  ctx.font = `500 ${fontSize}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  const sheetLabel = sheetPreset === '4x6' ? '4x6 in' : 'A4';
  ctx.fillText(
    `${spec.country} · ${spec.document} · ${layout.tiles.length}x · ${sheetLabel} · 300 DPI`,
    layout.sheetWidthPx / 2,
    layout.sheetHeightPx - Math.round(16 * previewScale)
  );

  const blob = await canvasToBlob(sheetCanvas, 'image/jpeg', 0.94, dpi);
  return {
    blob,
    url: URL.createObjectURL(blob),
    sizeKb: Math.round(blob.size / 1024),
    count: layout.tiles.length,
    sheetWidthPx: layout.sheetWidthPx,
    sheetHeightPx: layout.sheetHeightPx,
  };
}
