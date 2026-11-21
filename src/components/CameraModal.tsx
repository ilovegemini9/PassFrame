import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RotateCcw } from 'lucide-react';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureDataUrl: (dataUrl: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCaptureDataUrl,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setIsReady(false);
      setError(null);
      return;
    }

    let cancelled = false;
    async function startCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError('Camera capture is not supported in this browser. Use Upload Photo instead.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch {
        if (!cancelled) {
          setError('Camera access was blocked or no webcam was found. Please allow camera permission or upload an image file.');
        }
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !isReady) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Mirror front camera so capture matches preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    onCaptureDataUrl(dataUrl);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="camera-modal-title" className="text-base font-semibold text-slate-900">
              Take Passport Photo
            </h2>
            <p className="text-xs text-slate-500">
              Stand against a plain light wall with even daylight on your face.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera modal"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-medium">Unable to start camera</p>
              <p className="mt-1 text-xs text-red-700">{error}</p>
            </div>
          ) : (
            <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full -scale-x-100 object-cover"
              />
              {/* Biometric oval alignment guide */}
              <svg
                viewBox="0 0 100 100"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <ellipse
                  cx="50"
                  cy="44"
                  rx="21"
                  ry="28"
                  fill="none"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth="0.6"
                  strokeDasharray="2 1.5"
                />
                <line
                  x1="28"
                  y1="42"
                  x2="72"
                  y2="42"
                  stroke="rgba(96,165,250,0.85)"
                  strokeWidth="0.45"
                />
              </svg>
              {!isReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-xs font-medium text-white">
                  Initializing camera...
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCapture}
              disabled={!isReady || Boolean(error)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {error ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
              <span>Capture Photo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
