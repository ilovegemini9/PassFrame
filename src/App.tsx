import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  COUNTRY_SPECS,
  formatPhysicalDimensions,
  getSpecById,
  getSpecBySlug,
  getSpecUrlPath,
  type CountryPhotoSpec,
} from './data/countrySpecs';
import { resolveRouteSeo } from './utils/seo';
import {
  computeBiometricMetrics,
  computePrintSheetLayout,
  type EdgeAnalysisResult,
  type SheetPreset,
} from './utils/biometric';
import {
  computeBaseCoverScale,
  DEFAULT_TRANSFORM,
  exportSinglePhoto,
  renderPrintSheet,
  sampleCanvasEdgeLighting,
  type CaliperPositions,
  type ImageTransformState,
} from './utils/canvasExport';
import {
  computeAutoFitTransform,
  detectFaceInImage,
  type ImageFaceLandmarks,
} from './utils/faceDetection';
import { Header, type AppView } from './components/Header';
import { AlignmentCanvas, type SampleOption, type WorkspaceMode } from './components/AlignmentCanvas';
import { ComplianceRail } from './components/ComplianceRail';
import { CountryDirectory } from './components/CountryDirectory';
import { CountryLandingSection } from './components/CountryLandingSection';
import { PrintGuide } from './components/PrintGuide';
import { CameraModal } from './components/CameraModal';

const SAMPLES: SampleOption[] = [
  {
    id: 'sample-woman',
    label: 'Sample 1',
    src: '/src/assets/images/sample_portrait_woman_1795276319884.jpg',
  },
  {
    id: 'sample-man',
    label: 'Sample 2',
    src: '/src/assets/images/sample_portrait_man_1795276320800.jpg',
  },
];

const SAMPLE_LANDMARKS: Record<string, ImageFaceLandmarks> = {
  'sample-woman': {
    crownImgY: 0.175,
    eyeImgY: 0.382,
    chinImgY: 0.595,
    centerImgX: 0.5,
  },
  'sample-man': {
    crownImgY: 0.125,
    eyeImgY: 0.36,
    chinImgY: 0.585,
    centerImgX: 0.5,
  },
};

const DEFAULT_LANDMARKS: ImageFaceLandmarks = {
  crownImgY: 0.16,
  eyeImgY: 0.38,
  chinImgY: 0.62,
  centerImgX: 0.5,
};

function getInitialTransformForSample(sampleId: string | null): ImageTransformState {
  if (sampleId === 'sample-woman') {
    return { ...DEFAULT_TRANSFORM, zoom: 1.28, panY: 0.01 };
  }
  if (sampleId === 'sample-man') {
    return { ...DEFAULT_TRANSFORM, zoom: 1.2, panY: 0.03 };
  }
  return { ...DEFAULT_TRANSFORM, zoom: 1.15 };
}

function triggerBlobDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

interface RouteState {
  view: AppView;
  specId: string;
  isDedicatedCountryRoute: boolean;
}

function parseRouteFromLocation(): RouteState {
  if (typeof window === 'undefined') {
    return { view: 'studio', specId: 'us-passport', isDedicatedCountryRoute: false };
  }
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/country-specs') {
    return { view: 'directory', specId: 'us-passport', isDedicatedCountryRoute: false };
  }
  if (path === '/print-guide') {
    return { view: 'guide', specId: 'us-passport', isDedicatedCountryRoute: false };
  }
  if (path.startsWith('/photo/')) {
    const slug = path.slice('/photo/'.length);
    const matched = getSpecBySlug(slug);
    if (matched) {
      return { view: 'studio', specId: matched.id, isDedicatedCountryRoute: true };
    }
  }
  const querySpec = new URLSearchParams(window.location.search).get('spec');
  if (querySpec) {
    const matched = getSpecById(querySpec);
    if (matched) {
      return { view: 'studio', specId: matched.id, isDedicatedCountryRoute: true };
    }
  }
  return { view: 'studio', specId: 'us-passport', isDedicatedCountryRoute: false };
}

export default function App() {
  const initialRoute = useMemo(() => parseRouteFromLocation(), []);
  const [activeView, setActiveView] = useState<AppView>(initialRoute.view);
  const [selectedSpecId, setSelectedSpecId] = useState<string>(initialRoute.specId);
  const [isDedicatedCountryRoute, setIsDedicatedCountryRoute] = useState<boolean>(
    initialRoute.isDedicatedCountryRoute
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('single');
  const [sheetPreset, setSheetPreset] = useState<SheetPreset>('4x6');
  const [showGuides, setShowGuides] = useState<boolean>(true);

  const [activeSampleId, setActiveSampleId] = useState<string | null>(SAMPLES[0].id);
  const [imageSrc, setImageSrc] = useState<string>(SAMPLES[0].src);
  const [imageName, setImageName] = useState<string>('sample_portrait_1.jpg');
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);

  const [transform, setTransform] = useState<ImageTransformState>(() =>
    getInitialTransformForSample(SAMPLES[0].id)
  );
  const [landmarks, setLandmarks] = useState<ImageFaceLandmarks>(
    SAMPLE_LANDMARKS[SAMPLES[0].id]
  );

  const [exportFormat, setExportFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg');
  const [jpegQuality, setJpegQuality] = useState<number>(0.92);
  const [autoFitMaxKb, setAutoFitMaxKb] = useState<boolean>(true);
  const [estimatedSizeKb, setEstimatedSizeKb] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [lastExportMessage, setLastExportMessage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isDetectingFace, setIsDetectingFace] = useState<boolean>(false);
  const [faceDetectionWarning, setFaceDetectionWarning] = useState<string | null>(null);
  const [recommendedTiltDeg, setRecommendedTiltDeg] = useState<number>(0);

  const [edgeAnalysis, setEdgeAnalysis] = useState<EdgeAnalysisResult>({
    meanLuminance: 240,
    stdDev: 4,
    uniformityScore: 94,
    status: 'pass',
    feedback: 'Clean, evenly illuminated background.',
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const selectedSpec: CountryPhotoSpec = useMemo(
    () => COUNTRY_SPECS.find((s) => s.id === selectedSpecId) ?? COUNTRY_SPECS[0],
    [selectedSpecId]
  );

  const navigateToPath = useCallback((nextPath: string, replace: boolean = false) => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== nextPath || window.location.search) {
      if (replace) {
        window.history.replaceState({}, '', nextPath);
      } else {
        window.history.pushState({}, '', nextPath);
      }
    }
  }, []);

  const handleSelectView = useCallback(
    (view: AppView) => {
      setActiveView(view);
      if (view === 'directory') {
        navigateToPath('/country-specs');
      } else if (view === 'guide') {
        navigateToPath('/print-guide');
      } else if (isDedicatedCountryRoute) {
        navigateToPath(getSpecUrlPath(selectedSpec));
      } else {
        navigateToPath('/');
      }
    },
    [isDedicatedCountryRoute, navigateToPath, selectedSpec]
  );

  const handleSelectCountrySpec = useCallback(
    (specId: string, openInStudio: boolean = true) => {
      const spec = getSpecById(specId) ?? COUNTRY_SPECS[0];
      setSelectedSpecId(spec.id);
      setIsDedicatedCountryRoute(true);
      setLastExportMessage(null);
      const imgW = loadedImage?.naturalWidth || loadedImage?.width || 1024;
      const imgH = loadedImage?.naturalHeight || loadedImage?.height || 1024;
      setTransform((prev) => computeAutoFitTransform(imgW, imgH, spec, landmarks, prev));
      if (openInStudio) {
        setActiveView('studio');
      }
      navigateToPath(getSpecUrlPath(spec));
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [landmarks, loadedImage, navigateToPath]
  );

  // Sync browser Back/Forward buttons
  useEffect(() => {
    const onPopState = () => {
      const parsed = parseRouteFromLocation();
      setActiveView(parsed.view);
      setSelectedSpecId(parsed.specId);
      setIsDedicatedCountryRoute(parsed.isDedicatedCountryRoute);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Keep client-side <title>, meta description, canonical, and JSON-LD in sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentPath =
      activeView === 'directory'
        ? '/country-specs'
        : activeView === 'guide'
          ? '/print-guide'
          : isDedicatedCountryRoute
            ? getSpecUrlPath(selectedSpec)
            : '/';
    const seo = resolveRouteSeo(currentPath, window.location.origin);
    document.title = seo.title;

    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute('content', seo.description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', seo.title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', seo.description);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', seo.canonicalUrl);

    const ldScript = document.querySelector('script[type="application/ld+json"]');
    if (ldScript) {
      ldScript.textContent = JSON.stringify(
        seo.jsonLd.length === 1 ? seo.jsonLd[0] : seo.jsonLd
      );
    }
  }, [activeView, isDedicatedCountryRoute, selectedSpec]);

  // Load current imageSrc into HTMLImageElement & run real local face detection
  const selectedSpecRef = useRef<CountryPhotoSpec>(selectedSpec);
  selectedSpecRef.current = selectedSpec;

  const runFaceDetection = useCallback(async (img: HTMLImageElement, spec: CountryPhotoSpec) => {
    setIsDetectingFace(true);
    setFaceDetectionWarning(null);
    const result = await detectFaceInImage(img);
    setIsDetectingFace(false);

    if (result.detected && result.landmarks) {
      const imgW = img.naturalWidth || img.width || 1024;
      const imgH = img.naturalHeight || img.height || 1024;
      const detectedLandmarks = result.landmarks;
      const tilt = result.recommendedTiltDeg ?? 0;
      setLandmarks(detectedLandmarks);
      setRecommendedTiltDeg(tilt);
      setFaceDetectionWarning(null);
      setTransform((prev) =>
        computeAutoFitTransform(imgW, imgH, spec, detectedLandmarks, prev, tilt)
      );
    } else {
      setRecommendedTiltDeg(0);
      setFaceDetectionWarning(
        result.reason ??
          'No clear frontal face detected. Drag Crown, Eyes, and Chin markers onto your portrait manually.'
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    setImageLoadError(null);
    setFaceDetectionWarning(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (active) {
        setLoadedImage(img);
        setImageLoadError(null);
        void runFaceDetection(img, selectedSpecRef.current);
      }
    };
    img.onerror = () => {
      if (active) {
        setImageLoadError(
          'Could not decode that image file in this browser. Please upload a standard JPG, PNG, or WebP portrait.'
        );
      }
    };
    img.src = imageSrc;
    return () => {
      active = false;
    };
  }, [imageSrc, runFaceDetection]);

  const handleFileLoad = useCallback((file: File) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setActiveSampleId(null);
    setImageSrc(url);
    setImageName(file.name);
    setTransform(getInitialTransformForSample(null));
    setLandmarks(DEFAULT_LANDMARKS);
    setActiveView('studio');
    setLastExportMessage(null);
  }, []);

  // Listen for drag-and-drop file events from AlignmentCanvas
  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<File>;
      if (custom.detail) {
        handleFileLoad(custom.detail);
      }
    };
    window.addEventListener('passframe-file-drop', handler);
    return () => window.removeEventListener('passframe-file-drop', handler);
  }, [handleFileLoad]);

  // Cleanup uploaded object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  // Project image-space face landmarks into current output frame coordinates
  const frameGeometry = useMemo(() => {
    const imgW = loadedImage?.naturalWidth || loadedImage?.width || 1024;
    const imgH = loadedImage?.naturalHeight || loadedImage?.height || 1024;
    const baseScale = computeBaseCoverScale(
      imgW,
      imgH,
      selectedSpec.widthPx,
      selectedSpec.heightPx
    );
    const scale = baseScale * transform.zoom;

    const toFrameY = (imgY: number) =>
      0.5 + transform.panY + ((imgY - 0.5) * imgH * scale) / selectedSpec.heightPx;

    const toFrameX = (imgX: number) => {
      const signedX = transform.flipH ? 0.5 - imgX : imgX - 0.5;
      return 0.5 + transform.panX + (signedX * imgW * scale) / selectedSpec.widthPx;
    };

    const calipers: CaliperPositions = {
      crownY: Math.max(0.02, Math.min(0.92, toFrameY(landmarks.crownImgY))),
      eyeY: Math.max(0.05, Math.min(0.95, toFrameY(landmarks.eyeImgY))),
      chinY: Math.max(0.1, Math.min(0.98, toFrameY(landmarks.chinImgY))),
    };

    const centerOffsetFrac = toFrameX(landmarks.centerImgX) - 0.5;
    const sampledSourceWidthPx = selectedSpec.widthPx / scale;
    const sampledSourceHeightPx = selectedSpec.heightPx / scale;

    return {
      imgW,
      imgH,
      scale,
      calipers,
      centerOffsetFrac,
      sampledSourceWidthPx,
      sampledSourceHeightPx,
    };
  }, [loadedImage, selectedSpec, transform, landmarks]);

  const handleChangeCalipers = useCallback(
    (updater: (prev: CaliperPositions) => CaliperPositions) => {
      const nextFrame = updater(frameGeometry.calipers);
      const { imgH, scale } = frameGeometry;
      const toImgY = (frameY: number) =>
        0.5 + ((frameY - 0.5 - transform.panY) * selectedSpec.heightPx) / (imgH * scale);

      setLandmarks((prev) => ({
        ...prev,
        crownImgY: Number(Math.max(0.01, Math.min(0.95, toImgY(nextFrame.crownY))).toFixed(4)),
        eyeImgY: Number(Math.max(0.02, Math.min(0.96, toImgY(nextFrame.eyeY))).toFixed(4)),
        chinImgY: Number(Math.max(0.05, Math.min(0.99, toImgY(nextFrame.chinY))).toFixed(4)),
      }));
    },
    [frameGeometry, transform.panY, selectedSpec.heightPx]
  );

  // Sample edge background luminance & shadow uniformity whenever photo/framing changes
  useEffect(() => {
    if (!loadedImage) return;
    const timer = window.setTimeout(() => {
      const result = sampleCanvasEdgeLighting(loadedImage, selectedSpec, transform);
      setEdgeAnalysis(result);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loadedImage, selectedSpec, transform]);

  // Estimate exported file size in KB asynchronously
  useEffect(() => {
    if (!loadedImage) return;
    let active = true;
    const timer = window.setTimeout(() => {
      exportSinglePhoto(
        loadedImage,
        selectedSpec,
        transform,
        exportFormat,
        jpegQuality,
        autoFitMaxKb
      )
        .then((res) => {
          URL.revokeObjectURL(res.url);
          if (active) {
            setEstimatedSizeKb(res.sizeKb);
          }
        })
        .catch(() => {
          if (active) setEstimatedSizeKb(null);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadedImage, selectedSpec, transform, exportFormat, jpegQuality, autoFitMaxKb]);

  const complianceReport = useMemo(
    () =>
      computeBiometricMetrics({
        spec: selectedSpec,
        sampledSourceWidthPx: frameGeometry.sampledSourceWidthPx,
        sampledSourceHeightPx: frameGeometry.sampledSourceHeightPx,
        crownYFrac: frameGeometry.calipers.crownY,
        chinYFrac: frameGeometry.calipers.chinY,
        eyeYFrac: frameGeometry.calipers.eyeY,
        centerOffsetFrac: frameGeometry.centerOffsetFrac,
        edgeAnalysis,
      }),
    [selectedSpec, frameGeometry, edgeAnalysis]
  );

  const sheetLayout = useMemo(
    () => computePrintSheetLayout(sheetPreset, selectedSpec.widthMm, selectedSpec.heightMm, 300),
    [sheetPreset, selectedSpec]
  );

  const handleSelectSample = (sample: SampleOption) => {
    setActiveSampleId(sample.id);
    setImageSrc(sample.src);
    setImageName(`${sample.id}.jpg`);
    setTransform(getInitialTransformForSample(sample.id));
    setLandmarks(SAMPLE_LANDMARKS[sample.id] ?? DEFAULT_LANDMARKS);
    setLastExportMessage(null);
  };

  const handleResetAll = () => {
    setTransform(getInitialTransformForSample(activeSampleId));
    setLandmarks(
      activeSampleId ? SAMPLE_LANDMARKS[activeSampleId] ?? DEFAULT_LANDMARKS : DEFAULT_LANDMARKS
    );
    setLastExportMessage(null);
  };

  const handleAutoFitToSpec = () => {
    const imgW = loadedImage?.naturalWidth || loadedImage?.width || 1024;
    const imgH = loadedImage?.naturalHeight || loadedImage?.height || 1024;
    setTransform((prev) =>
      computeAutoFitTransform(imgW, imgH, selectedSpec, landmarks, prev, recommendedTiltDeg)
    );
  };

  const handleRedetectFace = () => {
    if (!loadedImage) return;
    void runFaceDetection(loadedImage, selectedSpec);
  };

  const handleDownloadSingle = async () => {
    if (!loadedImage) return;
    setIsExporting(true);
    setLastExportMessage(null);
    try {
      const result = await exportSinglePhoto(
        loadedImage,
        selectedSpec,
        transform,
        exportFormat,
        jpegQuality,
        autoFitMaxKb
      );
      const ext = exportFormat === 'image/png' ? 'png' : 'jpg';
      const filename = `passframe-${selectedSpec.id}-${selectedSpec.widthPx}x${selectedSpec.heightPx}.${ext}`;
      triggerBlobDownload(result.url, filename);
      window.setTimeout(() => URL.revokeObjectURL(result.url), 1500);
      setLastExportMessage(
        `Saved ${filename} (${result.sizeKb} KB, quality ${result.qualityUsed}%).`
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSheet = async () => {
    if (!loadedImage) return;
    setIsExporting(true);
    setLastExportMessage(null);
    try {
      const result = await renderPrintSheet(
        loadedImage,
        selectedSpec,
        transform,
        sheetPreset,
        1
      );
      const filename = `passframe-${selectedSpec.id}-sheet-${sheetPreset}-${result.count}x.jpg`;
      triggerBlobDownload(result.url, filename);
      window.setTimeout(() => URL.revokeObjectURL(result.url), 1500);
      setLastExportMessage(
        `Saved ${sheetPreset.toUpperCase()} sheet with ${result.count} photos (${result.sizeKb} KB).`
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleCaptureCamera = (dataUrl: string) => {
    setActiveSampleId(null);
    setImageSrc(dataUrl);
    setImageName('webcam-capture.jpg');
    setTransform({ ...DEFAULT_TRANSFORM, zoom: 1.15 });
    setLandmarks(DEFAULT_LANDMARKS);
    setActiveView('studio');
    setLastExportMessage(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        activeView={activeView}
        onSelectView={handleSelectView}
        onTriggerUpload={() => fileInputRef.current?.click()}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        aria-label="Upload portrait photo"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleFileLoad(file);
          }
          e.target.value = '';
        }}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
        {activeView === 'studio' && (
          <div>
            {/* Compact Studio Heading */}
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl text-balance">
                  {isDedicatedCountryRoute
                    ? `${selectedSpec.country} ${selectedSpec.document} Photo Maker`
                    : 'Biometric Passport & Visa Photo Studio'}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {isDedicatedCountryRoute
                    ? selectedSpec.unit === 'px'
                      ? `Verify exact ${selectedSpec.widthPx}×${selectedSpec.heightPx} px sizing, head height, and lighting locally—zero uploads or watermarks.`
                      : `Verify exact ${formatPhysicalDimensions(selectedSpec)} (${selectedSpec.widthPx}×${selectedSpec.heightPx} px) sizing, head height, and lighting locally—zero uploads or watermarks.`
                    : 'Verify exact head height, eye line, lighting, and KB limits locally in your browser—zero uploads, zero watermarks.'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                <span>{COUNTRY_SPECS.length} official specs</span>
                <span aria-hidden="true">·</span>
                <span>100% on-device</span>
                <span aria-hidden="true">·</span>
                <span>No AI retouching</span>
              </div>
            </div>

            {imageLoadError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {imageLoadError}
              </div>
            )}

            {/* Primary 2-Column Studio Workspace */}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px]">
              <AlignmentCanvas
                spec={selectedSpec}
                loadedImage={loadedImage}
                imageName={imageName}
                transform={transform}
                calipers={frameGeometry.calipers}
                mode={workspaceMode}
                sheetPreset={sheetPreset}
                showGuides={showGuides}
                samples={SAMPLES}
                activeSampleId={activeSampleId}
                onSelectSample={handleSelectSample}
                onOpenCamera={() => setIsCameraOpen(true)}
                onTriggerUpload={() => fileInputRef.current?.click()}
                onChangeMode={setWorkspaceMode}
                onChangeSheetPreset={setSheetPreset}
                onToggleGuides={() => setShowGuides((v) => !v)}
                onChangeTransform={setTransform}
                onChangeCalipers={handleChangeCalipers}
                onResetAll={handleResetAll}
              />

              <ComplianceRail
                specs={COUNTRY_SPECS}
                selectedSpec={selectedSpec}
                onSelectSpecId={(id) => handleSelectCountrySpec(id, false)}
                report={complianceReport}
                transform={transform}
                onChangeTransform={setTransform}
                exportFormat={exportFormat}
                onChangeExportFormat={setExportFormat}
                jpegQuality={jpegQuality}
                onChangeJpegQuality={setJpegQuality}
                autoFitMaxKb={autoFitMaxKb}
                onToggleAutoFitMaxKb={setAutoFitMaxKb}
                estimatedSizeKb={estimatedSizeKb}
                sheetPreset={sheetPreset}
                sheetPhotoCount={sheetLayout.tiles.length}
                onDownloadSingle={handleDownloadSingle}
                onDownloadSheet={handleDownloadSheet}
                onAutoFit={handleAutoFitToSpec}
                isDetectingFace={isDetectingFace}
                faceDetectionWarning={faceDetectionWarning}
                onRedetectFace={handleRedetectFace}
                isExporting={isExporting}
                lastExportMessage={lastExportMessage}
              />
            </div>

            <CountryLandingSection
              spec={selectedSpec}
              onNavigateCountry={(spec) => handleSelectCountrySpec(spec.id, true)}
            />
          </div>
        )}

        {activeView === 'directory' && (
          <CountryDirectory
            activeSpecId={selectedSpec.id}
            onSelectInStudio={(specId) => handleSelectCountrySpec(specId, true)}
          />
        )}

        {activeView === 'guide' && (
          <PrintGuide onReturnToStudio={() => handleSelectView('studio')} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-4 text-xs text-slate-500 sm:px-6">
          <span>PassFrame · Client-side biometric passport & visa photo formatter</span>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/country-specs"
              onClick={(e) => {
                e.preventDefault();
                handleSelectView('directory');
              }}
              className="hover:text-slate-900 cursor-pointer"
            >
              {COUNTRY_SPECS.length} Country Specifications
            </a>
            <a
              href="/print-guide"
              onClick={(e) => {
                e.preventDefault();
                handleSelectView('guide');
              }}
              className="hover:text-slate-900 cursor-pointer"
            >
              DIY Lighting & Printing Guide
            </a>
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900"
            >
              Sitemap
            </a>
          </div>
        </div>
      </footer>

      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCaptureDataUrl={handleCaptureCamera}
      />
    </div>
  );
}
