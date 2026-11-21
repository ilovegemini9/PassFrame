import type { CountryPhotoSpec } from '../data/countrySpecs';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface EdgeAnalysisResult {
  meanLuminance: number;
  stdDev: number;
  uniformityScore: number;
  status: CheckStatus;
  feedback: string;
}

export interface BiometricCheckItem {
  id: 'head-height' | 'eye-line' | 'resolution' | 'background' | 'centering';
  label: string;
  measured: string;
  target: string;
  status: CheckStatus;
  detail: string;
}

export interface BiometricReport {
  overallStatus: CheckStatus;
  passCount: number;
  totalChecks: number;
  headHeightPct: number;
  headHeightMm: number;
  eyeFromBottomPct: number;
  eyeFromBottomMm: number;
  effectiveDpi: number;
  centerOffsetPct: number;
  checks: BiometricCheckItem[];
}

export interface BiometricInput {
  spec: CountryPhotoSpec;
  /** Effective source pixels covering the cropped frame width */
  sampledSourceWidthPx: number;
  /** Effective source pixels covering the cropped frame height */
  sampledSourceHeightPx: number;
  /** Top of head (crown) as 0..1 fraction from top of output frame */
  crownYFrac: number;
  /** Bottom of chin as 0..1 fraction from top of output frame */
  chinYFrac: number;
  /** Eye line as 0..1 fraction from top of output frame */
  eyeYFrac: number;
  /** Horizontal face center offset from 0.5 (-0.5..+0.5) */
  centerOffsetFrac: number;
  /** Background edge analysis */
  edgeAnalysis: EdgeAnalysisResult;
}

export type SheetPreset = '4x6' | 'a4';

export interface SheetTile {
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
}

export interface PrintSheetLayout {
  sheetPreset: SheetPreset;
  sheetWidthPx: number;
  sheetHeightPx: number;
  sheetWidthIn: number;
  sheetHeightIn: number;
  orientation: 'landscape' | 'portrait';
  cols: number;
  rows: number;
  photoWidthPx: number;
  photoHeightPx: number;
  tiles: SheetTile[];
}

export function mmToPx(mm: number, dpi: number = 300): number {
  return Math.round((mm / 25.4) * dpi);
}

export function inToPx(inches: number, dpi: number = 300): number {
  return Math.round(inches * dpi);
}

export function analyzeEdgePixels(
  rgba: Uint8ClampedArray | number[],
  width: number,
  height: number,
  minLuminanceThreshold: number = 185
): EdgeAnalysisResult {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return {
      meanLuminance: 0,
      stdDev: 0,
      uniformityScore: 0,
      status: 'warn',
      feedback: 'Waiting for image pixel buffer.',
    };
  }

  const samples: number[] = [];
  const stepX = Math.max(1, Math.floor(width / 32));
  const stepY = Math.max(1, Math.floor(height / 32));

  // Sample upper-left & upper-right background corners (avoiding center hair crown and bottom shoulders)
  const topEdgeBand = Math.max(1, Math.floor(height * 0.03));
  const cornerMaxY = Math.floor(height * 0.3);
  const cornerBand = Math.max(2, Math.floor(width * 0.18));

  for (let y = 0; y < cornerMaxY; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const inTopEdge = y < topEdgeBand;
      const inUpperCorner = x < cornerBand || x >= width - cornerBand;
      if (!inTopEdge && !inUpperCorner) continue;

      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      samples.push(lum);
    }
  }

  if (samples.length === 0) {
    return {
      meanLuminance: 0,
      stdDev: 0,
      uniformityScore: 0,
      status: 'warn',
      feedback: 'Insufficient background area detected around edges.',
    };
  }

  const sum = samples.reduce((acc, v) => acc + v, 0);
  const mean = sum / samples.length;
  const variance = samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / samples.length;
  const stdDev = Math.sqrt(variance);
  const uniformityScore = Math.max(0, Math.min(100, Math.round(100 - stdDev * 1.4)));

  if (mean < minLuminanceThreshold - 35) {
    return {
      meanLuminance: Math.round(mean),
      stdDev: Number(stdDev.toFixed(1)),
      uniformityScore,
      status: 'fail',
      feedback: `Background is too dark (luminance ${Math.round(mean)}/255). Increase brightness or reshoot against a white/off-white wall.`,
    };
  }

  if (stdDev > 28) {
    return {
      meanLuminance: Math.round(mean),
      stdDev: Number(stdDev.toFixed(1)),
      uniformityScore,
      status: 'warn',
      feedback: `Uneven lighting or wall shadows detected (variance ${stdDev.toFixed(1)}). Check for side shadows.`,
    };
  }

  if (mean < minLuminanceThreshold) {
    return {
      meanLuminance: Math.round(mean),
      stdDev: Number(stdDev.toFixed(1)),
      uniformityScore,
      status: 'warn',
      feedback: `Slightly dim background (${Math.round(mean)}/255). Nudge Exposure slightly higher if wall looks grey.`,
    };
  }

  return {
    meanLuminance: Math.round(mean),
    stdDev: Number(stdDev.toFixed(1)),
    uniformityScore,
    status: 'pass',
    feedback: `Clean, evenly illuminated background (${Math.round(mean)}/255 luminance).`,
  };
}

export function computeBiometricMetrics(input: BiometricInput): BiometricReport {
  const {
    spec,
    sampledSourceWidthPx,
    sampledSourceHeightPx,
    crownYFrac,
    chinYFrac,
    eyeYFrac,
    centerOffsetFrac,
    edgeAnalysis,
  } = input;

  const headHeightFrac = Math.max(0.01, chinYFrac - crownYFrac);
  const headHeightPct = Number((headHeightFrac * 100).toFixed(1));
  const headHeightMm = Number((headHeightFrac * spec.heightMm).toFixed(1));

  const eyeFromBottomFrac = Math.max(0, Math.min(1, 1 - eyeYFrac));
  const eyeFromBottomPct = Number((eyeFromBottomFrac * 100).toFixed(1));
  const eyeFromBottomMm = Number((eyeFromBottomFrac * spec.heightMm).toFixed(1));

  const centerOffsetPct = Number((Math.abs(centerOffsetFrac) * 100).toFixed(1));

  // Effective DPI based on physical inches of the spec
  const widthInches = spec.widthMm / 25.4;
  const heightInches = spec.heightMm / 25.4;
  const dpiW = sampledSourceWidthPx / widthInches;
  const dpiH = sampledSourceHeightPx / heightInches;
  const effectiveDpi = Math.round(Math.min(dpiW, dpiH));

  // 1. Head Height Check
  const headTolerance = 1.5;
  let headStatus: CheckStatus = 'pass';
  let headDetail = `Head fills ${headHeightPct}% (${headHeightMm} mm), within official bounds.`;
  if (headHeightPct < spec.headMinPct - headTolerance || headHeightPct > spec.headMaxPct + headTolerance) {
    headStatus = 'fail';
    headDetail =
      headHeightPct < spec.headMinPct
        ? `Head is too small (${headHeightPct}%). Zoom in or align Crown/Chin calipers.`
        : `Head is too large (${headHeightPct}%). Zoom out so shoulders and headroom are clear.`;
  } else if (headHeightPct < spec.headMinPct || headHeightPct > spec.headMaxPct) {
    headStatus = 'warn';
    headDetail = `Borderline head height (${headHeightPct}%). Target ${spec.headMinPct}%–${spec.headMaxPct}%.`;
  }

  // 2. Eye-Line Position Check
  const eyeTolerance = 2;
  let eyeStatus: CheckStatus = 'pass';
  let eyeDetail = `Eye line at ${eyeFromBottomPct}% from bottom (${eyeFromBottomMm} mm).`;
  if (
    eyeFromBottomPct < spec.eyeFromBottomMinPct - eyeTolerance ||
    eyeFromBottomPct > spec.eyeFromBottomMaxPct + eyeTolerance
  ) {
    eyeStatus = 'fail';
    eyeDetail = `Eye line (${eyeFromBottomPct}%) sits outside ${spec.eyeFromBottomMinPct}%–${spec.eyeFromBottomMaxPct}% from bottom. Pan image vertically.`;
  } else if (eyeFromBottomPct < spec.eyeFromBottomMinPct || eyeFromBottomPct > spec.eyeFromBottomMaxPct) {
    eyeStatus = 'warn';
    eyeDetail = `Eye line (${eyeFromBottomPct}%) is near edge of ${spec.eyeFromBottomMinPct}%–${spec.eyeFromBottomMaxPct}% target.`;
  }

  // 3. Resolution Check
  const minSourceRatioW = sampledSourceWidthPx / spec.widthPx;
  const minSourceRatioH = sampledSourceHeightPx / spec.heightPx;
  const minRatio = Math.min(minSourceRatioW, minSourceRatioH);
  let resStatus: CheckStatus = 'pass';
  let resDetail = `Crisp ${Math.round(sampledSourceWidthPx)}×${Math.round(sampledSourceHeightPx)} source pixels (${effectiveDpi} DPI).`;
  if (minRatio < 0.7 || effectiveDpi < 180) {
    resStatus = 'fail';
    resDetail = `Low source resolution (${effectiveDpi} DPI). Avoid extreme zoom-in or upload a higher-res photo.`;
  } else if (minRatio < 0.95 || effectiveDpi < 260) {
    resStatus = 'warn';
    resDetail = `Moderate resolution (${effectiveDpi} DPI). 300+ DPI recommended for clean printing.`;
  }

  // 4. Centering Check
  let centerStatus: CheckStatus = 'pass';
  let centerDetail = `Centered horizontally (${centerOffsetPct}% offset).`;
  if (centerOffsetPct > 6) {
    centerStatus = 'fail';
    centerDetail = `Face is off-center by ${centerOffsetPct}%. Drag horizontally onto the center axis.`;
  } else if (centerOffsetPct > 3) {
    centerStatus = 'warn';
    centerDetail = `Slightly off-center (${centerOffsetPct}%). Nudge toward center guide.`;
  }

  const checks: BiometricCheckItem[] = [
    {
      id: 'head-height',
      label: 'Head Height',
      measured: `${headHeightPct}% (${headHeightMm} mm)`,
      target: `${spec.headMinPct}–${spec.headMaxPct}%`,
      status: headStatus,
      detail: headDetail,
    },
    {
      id: 'eye-line',
      label: 'Eye Line Height',
      measured: `${eyeFromBottomPct}% from bottom`,
      target: `${spec.eyeFromBottomMinPct}–${spec.eyeFromBottomMaxPct}%`,
      status: eyeStatus,
      detail: eyeDetail,
    },
    {
      id: 'resolution',
      label: 'Sharpness & DPI',
      measured: `${effectiveDpi} DPI`,
      target: `≥ ${spec.dpi} DPI`,
      status: resStatus,
      detail: resDetail,
    },
    {
      id: 'background',
      label: 'Background Light',
      measured: `${edgeAnalysis.meanLuminance}/255 lum`,
      target: `≥ ${spec.minBgLuminance} uniform`,
      status: edgeAnalysis.status,
      detail: edgeAnalysis.feedback,
    },
    {
      id: 'centering',
      label: 'Horizontal Axis',
      measured: `${centerOffsetPct}% offset`,
      target: '≤ 3.0% offset',
      status: centerStatus,
      detail: centerDetail,
    },
  ];

  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');
  const overallStatus: CheckStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';
  const passCount = checks.filter((c) => c.status === 'pass').length;

  return {
    overallStatus,
    passCount,
    totalChecks: checks.length,
    headHeightPct,
    headHeightMm,
    eyeFromBottomPct,
    eyeFromBottomMm,
    effectiveDpi,
    centerOffsetPct,
    checks,
  };
}

export function computePrintSheetLayout(
  sheetPreset: SheetPreset,
  photoWidthMm: number,
  photoHeightMm: number,
  dpi: number = 300
): PrintSheetLayout {
  const baseWidthMm = sheetPreset === '4x6' ? 101.6 : 210;
  const baseHeightMm = sheetPreset === '4x6' ? 152.4 : 297;
  const baseWidthIn = sheetPreset === '4x6' ? 4 : 8.27;
  const baseHeightIn = sheetPreset === '4x6' ? 6 : 11.69;

  const photoW = mmToPx(photoWidthMm, dpi);
  const photoH = mmToPx(photoHeightMm, dpi);
  const marginPx = mmToPx(2.5, dpi);
  const gapPx = mmToPx(1.5, dpi);
  const footerReservePx = mmToPx(5, dpi);

  const calcFit = (sheetW: number, sheetH: number) => {
    const usableW = sheetW - marginPx * 2;
    const usableH = sheetH - marginPx * 2 - footerReservePx;
    const cols = Math.max(1, Math.floor((usableW + gapPx) / (photoW + gapPx)));
    const rows = Math.max(1, Math.floor((usableH + gapPx) / (photoH + gapPx)));
    return { cols, rows, count: cols * rows };
  };

  const portraitPxW = mmToPx(baseWidthMm, dpi);
  const portraitPxH = mmToPx(baseHeightMm, dpi);
  const landscapePxW = portraitPxH;
  const landscapePxH = portraitPxW;

  const portraitFit = calcFit(portraitPxW, portraitPxH);
  const landscapeFit = calcFit(landscapePxW, landscapePxH);

  const useLandscape = landscapeFit.count > portraitFit.count;
  const chosen = useLandscape ? landscapeFit : portraitFit;
  const sheetWidthPx = useLandscape ? landscapePxW : portraitPxW;
  const sheetHeightPx = useLandscape ? landscapePxH : portraitPxH;

  const gridWidth = chosen.cols * photoW + (chosen.cols - 1) * gapPx;
  const gridHeight = chosen.rows * photoH + (chosen.rows - 1) * gapPx;
  const startX = Math.round((sheetWidthPx - gridWidth) / 2);
  const startY = Math.round((sheetHeightPx - footerReservePx - gridHeight) / 2);

  const tiles: SheetTile[] = [];
  for (let r = 0; r < chosen.rows; r++) {
    for (let c = 0; c < chosen.cols; c++) {
      tiles.push({
        xPx: startX + c * (photoW + gapPx),
        yPx: startY + r * (photoH + gapPx),
        widthPx: photoW,
        heightPx: photoH,
      });
    }
  }

  return {
    sheetPreset,
    sheetWidthPx,
    sheetHeightPx,
    sheetWidthIn: useLandscape ? baseHeightIn : baseWidthIn,
    sheetHeightIn: useLandscape ? baseWidthIn : baseHeightIn,
    orientation: useLandscape ? 'landscape' : 'portrait',
    cols: chosen.cols,
    rows: chosen.rows,
    photoWidthPx: photoW,
    photoHeightPx: photoH,
    tiles,
  };
}

/**
 * Patches or inserts a JFIF APP0 segment in a JPEG byte buffer so Xdensity/Ydensity
 * report the exact target DPI (e.g. 300 DPI) instead of the browser default 72/96 DPI.
 */
export function patchJpegDpiBytes(jpegBytes: Uint8Array, dpi: number = 300): Uint8Array {
  if (jpegBytes.length < 4 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    return jpegBytes;
  }

  const hi = (dpi >> 8) & 0xff;
  const lo = dpi & 0xff;

  // Check if APP0 JFIF segment is already right after SOI
  if (
    jpegBytes.length >= 20 &&
    jpegBytes[2] === 0xff &&
    jpegBytes[3] === 0xe0 &&
    jpegBytes[6] === 0x4a && // 'J'
    jpegBytes[7] === 0x46 && // 'F'
    jpegBytes[8] === 0x49 && // 'I'
    jpegBytes[9] === 0x46 && // 'F'
    jpegBytes[10] === 0x00
  ) {
    const out = new Uint8Array(jpegBytes);
    out[13] = 1; // units: pixels per inch
    out[14] = hi;
    out[15] = lo;
    out[16] = hi;
    out[17] = lo;
    return out;
  }

  // Otherwise insert a standard 18-byte JFIF APP0 segment after SOI (0xFF 0xD8)
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01,
    0x01, // units: DPI
    hi, lo,
    hi, lo,
    0x00, 0x00,
  ]);
  const out = new Uint8Array(jpegBytes.length + app0.length);
  out.set(jpegBytes.subarray(0, 2), 0);
  out.set(app0, 2);
  out.set(jpegBytes.subarray(2), 2 + app0.length);
  return out;
}

