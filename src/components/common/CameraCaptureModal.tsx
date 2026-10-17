import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RotateCcw, AlertCircle, Image as ImageIcon } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallbackToGallery?: () => void;
}

export const CameraCaptureModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onCapture,
  onFallbackToGallery,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [startingCamera, setStartingCamera] = useState(false);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async (mode: 'environment' | 'user') => {
    stopStream();
    setCameraError(null);
    setStartingCamera(true);

    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        throw new Error('Camera access is not supported by this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      let msg = 'Camera permission denied or camera device is unavailable.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser settings or upload from gallery.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera hardware found on this device. Please upload from gallery.';
      }
      setCameraError(msg);
    } finally {
      setStartingCamera(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `food_photo_${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        stopStream();
        onCapture(file);
        onClose();
      },
      'image/jpeg',
      0.85
    );
  };

  const handleSwitchFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop animate-fade-in" onClick={onClose}>
      <div
        className="modal-container camera-modal-card animate-scale-up"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '95%' }}
      >
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Camera size={20} className="text-emerald" />
            <h3 className="modal-title">Live Food Camera Viewfinder</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close camera"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body p-4 text-center">
          {cameraError ? (
            <div className="camera-error-container py-6">
              <AlertCircle size={44} className="text-amber mx-auto mb-3" />
              <h4 className="font-bold text-slate-800 mb-2">Camera Unavailable</h4>
              <p className="text-sm text-muted mb-4">{cameraError}</p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    onFallbackToGallery?.();
                  }}
                >
                  <ImageIcon size={16} />
                  <span>Upload from Gallery Instead</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => startCamera(facingMode)}
                >
                  <RotateCcw size={16} />
                  <span>Retry Camera</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="camera-viewfinder-wrapper">
              <div className="camera-feed-box relative rounded-xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center">
                {startingCamera && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 z-10 text-white">
                    <div className="spinner-large mb-2" />
                    <span className="text-sm">Initializing camera...</span>
                  </div>
                )}
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  autoPlay
                  muted
                />
                <div className="viewfinder-overlay-crosshair pointer-events-none" />
              </div>

              <p className="text-xs text-muted mt-2">
                Align the food container within the frame and ensure adequate lighting.
              </p>

              <div className="camera-controls-bar flex items-center justify-center gap-4 mt-4">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleSwitchFacing}
                  title="Switch camera"
                >
                  <RotateCcw size={16} />
                  <span>Flip Camera</span>
                </button>

                <button
                  type="button"
                  className="btn btn-primary btn-lg rounded-full px-6 shadow-lg flex items-center gap-2"
                  onClick={handleCapture}
                  disabled={startingCamera || !!cameraError}
                >
                  <Camera size={20} />
                  <span className="font-bold">Capture Photo</span>
                </button>

                {onFallbackToGallery && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      onClose();
                      onFallbackToGallery();
                    }}
                    title="Upload file"
                  >
                    <ImageIcon size={16} />
                    <span>Gallery</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
