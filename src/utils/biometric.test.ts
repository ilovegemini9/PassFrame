import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mmToPx,
  inToPx,
  analyzeEdgePixels,
  computeBiometricMetrics,
  computePrintSheetLayout,
} from './biometric';
import {
  COUNTRY_SPECS,
  filterSpecsByRegion,
  searchCountrySpecs,
  formatPhysicalDimensions,
} from '../data/countrySpecs';

test('mmToPx and inToPx convert physical units accurately at 300 DPI', () => {
  assert.equal(inToPx(2, 300), 600);
  assert.equal(mmToPx(35, 300), 413);
  assert.equal(mmToPx(45, 300), 531);
});

test('analyzeEdgePixels passes on uniform bright white buffer and fails on dark buffer', () => {
  const width = 40;
  const height = 40;
  const brightRgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < brightRgba.length; i += 4) {
    brightRgba[i] = 242;
    brightRgba[i + 1] = 242;
    brightRgba[i + 2] = 240;
    brightRgba[i + 3] = 255;
  }
  const brightResult = analyzeEdgePixels(brightRgba, width, height, 195);
  assert.equal(brightResult.status, 'pass');
  assert.ok(brightResult.meanLuminance >= 235);
  assert.equal(brightResult.stdDev, 0);

  const darkRgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < darkRgba.length; i += 4) {
    darkRgba[i] = 80;
    darkRgba[i + 1] = 80;
    darkRgba[i + 2] = 80;
    darkRgba[i + 3] = 255;
  }
  const darkResult = analyzeEdgePixels(darkRgba, width, height, 195);
  assert.equal(darkResult.status, 'fail');
});

test('analyzeEdgePixels detects uneven side shadow variance', () => {
  const width = 40;
  const height = 40;
  const splitRgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const val = x < width / 2 ? 250 : 120;
      splitRgba[idx] = val;
      splitRgba[idx + 1] = val;
      splitRgba[idx + 2] = val;
      splitRgba[idx + 3] = 255;
    }
  }
  const result = analyzeEdgePixels(splitRgba, width, height, 180);
  assert.notEqual(result.status, 'pass');
  assert.ok(result.stdDev > 28);
});

test('computeBiometricMetrics passes compliant US Passport geometry and catches Schengen undersized head', () => {
  const usSpec = COUNTRY_SPECS.find((s) => s.id === 'us-passport')!;
  const schengenSpec = COUNTRY_SPECS.find((s) => s.id === 'schengen-visa')!;

  const goodEdge = {
    meanLuminance: 240,
    stdDev: 4.2,
    uniformityScore: 94,
    status: 'pass' as const,
    feedback: 'Clean background.',
  };

  // Crown at 0.14, chin at 0.72 -> head = 58% (US allows 50-69%), eye at 0.38 -> 62% from bottom (US allows 56-69%)
  const usReport = computeBiometricMetrics({
    spec: usSpec,
    sampledSourceWidthPx: 900,
    sampledSourceHeightPx: 900,
    crownYFrac: 0.14,
    chinYFrac: 0.72,
    eyeYFrac: 0.38,
    centerOffsetFrac: 0.005,
    edgeAnalysis: goodEdge,
  });

  assert.equal(usReport.overallStatus, 'pass');
  assert.equal(usReport.passCount, 5);
  assert.equal(usReport.headHeightPct, 58);

  // Same 58% head on Schengen (requires 70-80%) must fail head-height check
  const schengenReport = computeBiometricMetrics({
    spec: schengenSpec,
    sampledSourceWidthPx: 900,
    sampledSourceHeightPx: 1150,
    crownYFrac: 0.14,
    chinYFrac: 0.72,
    eyeYFrac: 0.38,
    centerOffsetFrac: 0,
    edgeAnalysis: goodEdge,
  });

  assert.equal(schengenReport.overallStatus, 'fail');
  const headCheck = schengenReport.checks.find((c) => c.id === 'head-height')!;
  assert.equal(headCheck.status, 'fail');
});

test('computePrintSheetLayout maximizes photo tiles on 4x6 and A4 sheets', () => {
  // 2x2 in (50.8mm) on 4x6 in sheet with safe print margins -> 2 photos
  const layoutUs4x6 = computePrintSheetLayout('4x6', 50.8, 50.8, 300);
  assert.equal(layoutUs4x6.tiles.length, 2);

  // 2x2 in on A4 -> 3x5 = 15 photos
  const layoutUsA4 = computePrintSheetLayout('a4', 50.8, 50.8, 300);
  assert.equal(layoutUsA4.tiles.length, 15);

  // 35x45mm on 4x6 in (101.6x152.4mm) -> landscape 4 cols x 2 rows = 8 photos
  const layoutEu4x6 = computePrintSheetLayout('4x6', 35, 45, 300);
  assert.equal(layoutEu4x6.tiles.length, 8);
  assert.equal(layoutEu4x6.orientation, 'landscape');

  // A4 fits significantly more
  const layoutEuA4 = computePrintSheetLayout('a4', 35, 45, 300);
  assert.ok(layoutEuA4.tiles.length >= 24);
});

test('countrySpecs search and region filters work accurately', () => {
  assert.ok(COUNTRY_SPECS.length >= 30);
  const europeSpecs = filterSpecsByRegion(COUNTRY_SPECS, 'Europe');
  assert.ok(europeSpecs.every((s) => s.region === 'Europe'));
  assert.ok(europeSpecs.some((s) => s.id === 'schengen-visa'));

  const dvResults = searchCountrySpecs(COUNTRY_SPECS, 'DV Lottery');
  assert.ok(dvResults.some((s) => s.id === 'us-visa-ds160'));

  const ukSpec = COUNTRY_SPECS.find((s) => s.id === 'uk-passport')!;
  assert.equal(formatPhysicalDimensions(ukSpec), '35 × 45 mm');
});

test('patchJpegDpiBytes writes exact 300 DPI into JFIF APP0 header', async () => {
  const { patchJpegDpiBytes } = await import('./biometric');

  // Case 1: Existing JFIF APP0 segment at 72 DPI
  const withJfif = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
    0xff, 0xd9,
  ]);
  const patched1 = patchJpegDpiBytes(withJfif, 300);
  assert.equal(patched1[13], 1);
  assert.equal((patched1[14] << 8) | patched1[15], 300);
  assert.equal((patched1[16] << 8) | patched1[17], 300);

  // Case 2: Bare JPEG SOI without JFIF APP0
  const bareJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9]);
  const patched2 = patchJpegDpiBytes(bareJpeg, 300);
  assert.equal(patched2.length, bareJpeg.length + 18);
  assert.equal(patched2[2], 0xff);
  assert.equal(patched2[3], 0xe0);
  assert.equal((patched2[14] << 8) | patched2[15], 300);
});

