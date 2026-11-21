import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRY_SPECS } from '../data/countrySpecs';
import { DEFAULT_TRANSFORM } from './canvasExport';
import {
  computeAutoFitTransform,
  findHairlineTopFraction,
  landmarksToPortraitMetrics,
} from './faceDetection';
import { computeBiometricMetrics } from './biometric';

test('landmarksToPortraitMetrics maps 68-landmark eye, chin, crown, and tilt accurately', () => {
  // Portrait 800x1000 with slight clockwise tilt (right eye 10px lower across 120px inter-ocular span)
  const result = landmarksToPortraitMetrics({
    imgWidth: 800,
    imgHeight: 1000,
    leftEyePts: [
      { x: 340, y: 400 },
      { x: 350, y: 400 },
    ],
    rightEyePts: [
      { x: 460, y: 410 },
      { x: 470, y: 410 },
    ],
    browPts: [
      { x: 340, y: 365 },
      { x: 460, y: 375 },
    ],
    chinPt: { x: 405, y: 650 },
    nosePts: [{ x: 405, y: 480 }],
    detectedHairCrownYFrac: 0.16,
  });

  assert.equal(result.landmarks.crownImgY, 0.16);
  assert.ok(Math.abs(result.landmarks.eyeImgY - 0.405) < 0.005);
  assert.equal(result.landmarks.chinImgY, 0.65);
  assert.ok(Math.abs(result.landmarks.centerImgX - 0.506) < 0.01);
  // Expect negative rotation (~ -4.8 deg) to level right eye back up
  assert.ok(result.recommendedTiltDeg < -4 && result.recommendedTiltDeg > -6);
});

test('findHairlineTopFraction locates hair boundary against light wall', () => {
  const w = 100;
  const h = 100;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      // Dark hair silhouette starting at row y=18 in the middle column
      const isHair = y >= 18 && y <= 34 && x >= 35 && x <= 65;
      const v = isHair ? 35 : 242;
      rgba[idx] = v;
      rgba[idx + 1] = v;
      rgba[idx + 2] = v;
      rgba[idx + 3] = 255;
    }
  }

  const hairTop = findHairlineTopFraction(rgba, w, h, 0.5, 0.3, 0.36, 0.22);
  assert.ok(hairTop !== null);
  assert.ok(Math.abs(hairTop - 0.18) <= 0.02);
});

test('computeAutoFitTransform frames an off-center wide selfie into compliant US and Schengen bounds', () => {
  const offCenterLandmarks = {
    crownImgY: 0.2,
    eyeImgY: 0.36,
    chinImgY: 0.52,
    centerImgX: 0.64,
  };

  for (const specId of ['us-passport', 'us-visa-ds160', 'schengen-visa', 'morocco-passport']) {
    const spec = COUNTRY_SPECS.find((s) => s.id === specId)!;
    const fitted = computeAutoFitTransform(2400, 1800, spec, offCenterLandmarks, DEFAULT_TRANSFORM, 0);

    const baseScale = Math.max(spec.widthPx / 2400, spec.heightPx / 1800);
    const scale = baseScale * fitted.zoom;
    const toFrameY = (imgY: number) => 0.5 + fitted.panY + ((imgY - 0.5) * 1800 * scale) / spec.heightPx;
    const toFrameX = (imgX: number) => 0.5 + fitted.panX + ((imgX - 0.5) * 2400 * scale) / spec.widthPx;

    const report = computeBiometricMetrics({
      spec,
      sampledSourceWidthPx: spec.widthPx / scale,
      sampledSourceHeightPx: spec.heightPx / scale,
      crownYFrac: toFrameY(offCenterLandmarks.crownImgY),
      chinYFrac: toFrameY(offCenterLandmarks.chinImgY),
      eyeYFrac: toFrameY(offCenterLandmarks.eyeImgY),
      centerOffsetFrac: toFrameX(offCenterLandmarks.centerImgX) - 0.5,
      edgeAnalysis: {
        meanLuminance: 240,
        stdDev: 4,
        uniformityScore: 95,
        status: 'pass',
        feedback: 'Clean background',
      },
    });

    assert.equal(report.overallStatus, 'pass', `${spec.id} should pass after auto-fit`);
    assert.ok(report.centerOffsetPct <= 1.0, `${spec.id} horizontal offset should be near 0`);
  }
});
