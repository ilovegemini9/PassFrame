import type { CountryPhotoSpec } from '../data/countrySpecs';
import { computeBaseCoverScale, type ImageTransformState } from './canvasExport';

export interface Point2D {
  x: number;
  y: number;
}

export interface ImageFaceLandmarks {
  crownImgY: number;
  eyeImgY: number;
  chinImgY: number;
  centerImgX: number;
}

export interface FaceDetectionResult {
  detected: boolean;
  landmarks?: ImageFaceLandmarks;
  recommendedTiltDeg?: number;
  score?: number;
  reason?: string;
}

function avgPoint(pts: Point2D[]): Point2D {
  const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return {
    x: sum.x / Math.max(1, pts.length),
    y: sum.y / Math.max(1, pts.length),
  };
}

/**
 * Scans downward from the top edge along central strips above the eyebrows to locate
 * where hair/head silhouettes diverge from the background wall color.
 * Returns normalized 0..1 image Y coordinate, or null if indistinguishable.
 */
export function findHairlineTopFraction(
  rgba: Uint8ClampedArray | number[],
  width: number,
  height: number,
  centerXFrac: number,
  faceWidthFrac: number,
  browYFrac: number,
  eyeToChinFrac: number
): number | null {
  if (width < 16 || height < 16 || rgba.length < width * height * 4) {
    return null;
  }

  // Estimate background color from top-left and top-right corners (2%..10% from top, outer 12% width)
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgCount = 0;
  const cornerMaxY = Math.max(2, Math.floor(height * 0.1));
  const cornerBandX = Math.max(2, Math.floor(width * 0.12));

  for (let y = Math.floor(height * 0.01); y < cornerMaxY; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= cornerBandX && x < width - cornerBandX) continue;
      const idx = (y * width + x) * 4;
      bgR += rgba[idx];
      bgG += rgba[idx + 1];
      bgB += rgba[idx + 2];
      bgCount++;
    }
  }

  if (bgCount === 0) return null;
  bgR /= bgCount;
  bgG /= bgCount;
  bgB /= bgCount;

  const stripOffsets = [-0.08, 0, 0.08].map((o) =>
    Math.max(0, Math.min(width - 1, Math.round((centerXFrac + o * faceWidthFrac) * width)))
  );

  const minScanY = Math.max(1, Math.floor(height * Math.max(0.01, browYFrac - 0.95 * eyeToChinFrac)));
  const maxScanY = Math.max(minScanY + 2, Math.floor(height * (browYFrac - 0.12 * eyeToChinFrac)));
  const minRunRows = Math.max(3, Math.round(height * 0.015));

  const detectedRows: number[] = [];
  for (const sx of stripOffsets) {
    let consecutive = 0;
    for (let y = minScanY; y < maxScanY; y++) {
      const idx = (y * width + sx) * 4;
      const dr = Math.abs(rgba[idx] - bgR);
      const dg = Math.abs(rgba[idx + 1] - bgG);
      const db = Math.abs(rgba[idx + 2] - bgB);
      const colorDiff = dr * 0.3 + dg * 0.59 + db * 0.11;
      const maxChannelDiff = Math.max(dr, dg, db);

      if (colorDiff > 22 || maxChannelDiff > 30) {
        consecutive++;
        if (consecutive >= minRunRows) {
          detectedRows.push((y - minRunRows + 1) / height);
          break;
        }
      } else {
        consecutive = 0;
      }
    }
  }

  if (detectedRows.length === 0) return null;
  // Pick earliest hair contact among central strips (crown peak)
  return Math.min(...detectedRows);
}

export interface LandmarkGeometryInput {
  imgWidth: number;
  imgHeight: number;
  leftEyePts: Point2D[];
  rightEyePts: Point2D[];
  browPts: Point2D[];
  chinPt: Point2D;
  nosePts?: Point2D[];
  detectedHairCrownYFrac?: number | null;
}

/**
 * Pure geometry mapper from 68-point facial landmarks to normalized biometric calipers
 * plus horizontal leveling angle.
 */
export function landmarksToPortraitMetrics(input: LandmarkGeometryInput): {
  landmarks: ImageFaceLandmarks;
  recommendedTiltDeg: number;
} {
  const { imgWidth, imgHeight, leftEyePts, rightEyePts, browPts, chinPt, nosePts, detectedHairCrownYFrac } =
    input;

  const leftEye = avgPoint(leftEyePts);
  const rightEye = avgPoint(rightEyePts);
  const brow = avgPoint(browPts);
  const noseCenter = nosePts && nosePts.length > 0 ? avgPoint(nosePts) : null;

  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeCenterY = (leftEye.y + rightEye.y) / 2;
  const centerImgX = noseCenter ? (eyeCenterX * 0.6 + noseCenter.x * 0.4) / imgWidth : eyeCenterX / imgWidth;

  const eyeImgY = eyeCenterY / imgHeight;
  const chinImgY = chinPt.y / imgHeight;
  const browImgY = brow.y / imgHeight;

  const eyeToChin = Math.max(0.06, chinImgY - eyeImgY);
  // Cranium + typical hair anthropometric top relative to eye-chin distance
  const anatomicalCrownY = Math.max(0.015, eyeImgY - eyeToChin * 0.88);
  const minPlausibleCrownY = Math.max(0.01, eyeImgY - eyeToChin * 1.18);
  const maxPlausibleCrownY = Math.max(0.02, browImgY - eyeToChin * 0.35);

  let crownImgY = anatomicalCrownY;
  if (typeof detectedHairCrownYFrac === 'number' && Number.isFinite(detectedHairCrownYFrac)) {
    crownImgY = Math.max(minPlausibleCrownY, Math.min(maxPlausibleCrownY, detectedHairCrownYFrac));
  }

  // Eye line roll angle: positive dx, dy means right eye sits lower -> rotate counter-clockwise (negative deg)
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const rawAngleDeg = (-Math.atan2(dy, Math.max(1, dx)) * 180) / Math.PI;
  const recommendedTiltDeg =
    Math.abs(rawAngleDeg) < 0.6 ? 0 : Math.max(-12, Math.min(12, Number(rawAngleDeg.toFixed(1))));

  return {
    landmarks: {
      crownImgY: Number(Math.max(0.01, Math.min(0.9, crownImgY)).toFixed(4)),
      eyeImgY: Number(Math.max(0.05, Math.min(0.95, eyeImgY)).toFixed(4)),
      chinImgY: Number(Math.max(0.1, Math.min(0.98, chinImgY)).toFixed(4)),
      centerImgX: Number(Math.max(0.05, Math.min(0.95, centerImgX)).toFixed(4)),
    },
    recommendedTiltDeg,
  };
}

/**
 * Computes zoom and pan to center the detected face inside any official country specification.
 */
export function computeAutoFitTransform(
  imgW: number,
  imgH: number,
  spec: CountryPhotoSpec,
  landmarks: ImageFaceLandmarks,
  prevTransform: ImageTransformState,
  recommendedTiltDeg?: number
): ImageTransformState {
  const baseScale = computeBaseCoverScale(imgW, imgH, spec.widthPx, spec.heightPx);
  const faceSpanImg = Math.max(0.08, landmarks.chinImgY - landmarks.crownImgY);
  const targetHeadFrac = (spec.headMinPct + spec.headMaxPct) / 2 / 100;

  const targetZoom = Math.max(
    0.45,
    Math.min(
      2.6,
      Number(((targetHeadFrac * spec.heightPx) / (faceSpanImg * imgH * baseScale)).toFixed(2))
    )
  );
  const newScale = baseScale * targetZoom;

  const targetEyeFrameY = 1 - (spec.eyeFromBottomMinPct + spec.eyeFromBottomMaxPct) / 2 / 100;
  const rawPanY = targetEyeFrameY - 0.5 - ((landmarks.eyeImgY - 0.5) * imgH * newScale) / spec.heightPx;
  const signedCenterX = prevTransform.flipH ? 0.5 - landmarks.centerImgX : landmarks.centerImgX - 0.5;
  const rawPanX = -((signedCenterX * imgW * newScale) / spec.widthPx);

  return {
    ...prevTransform,
    zoom: targetZoom,
    panX: Math.max(-0.85, Math.min(0.85, Number(rawPanX.toFixed(3)))),
    panY: Math.max(-0.85, Math.min(0.85, Number(rawPanY.toFixed(3)))),
    rotationDeg:
      typeof recommendedTiltDeg === 'number' ? recommendedTiltDeg : prevTransform.rotationDeg,
  };
}

type FaceApiModule = typeof import('@vladmandic/face-api');
let modelsPromise: Promise<FaceApiModule> | null = null;

async function ensureFaceApiReady(): Promise<FaceApiModule> {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const tfRuntime = faceapi.tf as unknown as {
        ready?: () => Promise<void>;
        setBackend?: (name: string) => Promise<boolean>;
      };

      try {
        if (typeof tfRuntime?.ready === 'function') {
          await tfRuntime.ready();
        }
      } catch {
        if (typeof tfRuntime?.setBackend === 'function') {
          await tfRuntime.setBackend('cpu');
        }
        if (typeof tfRuntime?.ready === 'function') {
          await tfRuntime.ready();
        }
      }

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      ]);
      return faceapi;
    })().catch((err) => {
      modelsPromise = null;
      throw err;
    });
  }
  return modelsPromise;
}

/**
 * Runs 100% browser-local neural face & 68-landmark detection on an HTMLImageElement,
 * plus contrast-based hairline detection to locate crown, eyes, chin, horizontal center,
 * and roll tilt angle.
 */
export async function detectFaceInImage(img: HTMLImageElement): Promise<FaceDetectionResult> {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (!naturalW || !naturalH) {
    return { detected: false, reason: 'Image has not finished decoding yet.' };
  }

  try {
    const faceapi = await ensureFaceApiReady();

    // Scale oversized photos onto a clean bounded canvas for fast, consistent inference
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(64, Math.round(naturalW * scale));
    canvas.height = Math.max(64, Math.round(naturalH * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return { detected: false, reason: 'Canvas context unavailable in browser.' };
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let detection = await faceapi
      .detectSingleFace(
        canvas,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })
      )
      .withFaceLandmarks(true);

    if (!detection) {
      detection = await faceapi
        .detectSingleFace(
          canvas,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.25 })
        )
        .withFaceLandmarks(true);
    }

    if (!detection) {
      return {
        detected: false,
        reason:
          'No clear frontal face detected. Drag Crown, Eyes, and Chin markers onto your portrait manually.',
      };
    }

    const leftEyePts = detection.landmarks.getLeftEye();
    const rightEyePts = detection.landmarks.getRightEye();
    const browPts = [
      ...detection.landmarks.getLeftEyeBrow(),
      ...detection.landmarks.getRightEyeBrow(),
    ];
    const jawPts = detection.landmarks.getJawOutline();
    const chinPt = jawPts[8] ?? jawPts[Math.floor(jawPts.length / 2)];
    const nosePts = detection.landmarks.getNose();

    const eyeYAvg =
      ([...leftEyePts, ...rightEyePts].reduce((s, p) => s + p.y, 0) /
        Math.max(1, leftEyePts.length + rightEyePts.length)) /
      canvas.height;
    const browYAvg =
      browPts.reduce((s, p) => s + p.y, 0) / Math.max(1, browPts.length) / canvas.height;
    const chinYFrac = chinPt.y / canvas.height;
    const eyeToChinFrac = Math.max(0.06, chinYFrac - eyeYAvg);
    const box = detection.detection.box;
    const centerXFrac = (box.x + box.width / 2) / canvas.width;
    const faceWidthFrac = box.width / canvas.width;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hairTopFrac = findHairlineTopFraction(
      imageData.data,
      canvas.width,
      canvas.height,
      centerXFrac,
      faceWidthFrac,
      browYAvg,
      eyeToChinFrac
    );

    const mapped = landmarksToPortraitMetrics({
      imgWidth: canvas.width,
      imgHeight: canvas.height,
      leftEyePts,
      rightEyePts,
      browPts,
      chinPt,
      nosePts,
      detectedHairCrownYFrac: hairTopFrac,
    });

    return {
      detected: true,
      landmarks: mapped.landmarks,
      recommendedTiltDeg: mapped.recommendedTiltDeg,
      score: Number(detection.detection.score.toFixed(2)),
    };
  } catch (err) {
    return {
      detected: false,
      reason:
        err instanceof Error
          ? `Face detection unavailable (${err.message}). Adjust markers manually.`
          : 'Face detection unavailable. Adjust markers manually.',
    };
  }
}
