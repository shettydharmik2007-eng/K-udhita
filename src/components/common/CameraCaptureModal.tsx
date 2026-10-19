import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  X,
  RotateCcw,
  AlertCircle,
  Image as ImageIcon,
  CheckCircle2,
  FlipHorizontal,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

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
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);

  // Capture preview & retake state
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);

  // Stop all active camera tracks
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Cleanup object URL
  const clearCapturedPreview = useCallback(() => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    setCapturedBlob(null);
  }, [capturedPreviewUrl]);

  // Check available camera devices
  const checkCameraDevices = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      }
    } catch {
      // ignore device enumeration errors
    }
  }, []);

  // Start or switch camera stream
  const startCamera = useCallback(
    async (mode: 'environment' | 'user') => {
      stopStream();
      await Promise.resolve();
      setCameraError(null);
      setDeviceNotice(null);
      setStartingCamera(true);

      // Check secure context (HTTPS required for camera, except on localhost)
      if (
        typeof window !== 'undefined' &&
        !window.isSecureContext &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        setCameraError(
          'Live camera access requires a secure connection (HTTPS). Please choose a photo from your device gallery instead.'
        );
        setStartingCamera(false);
        return;
      }

      try {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          throw new Error('Camera access is not supported by this browser.');
        }

        // Use ideal constraints to prevent OverconstrainedError on devices with single camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
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

        // Re-check devices after permission granted
        checkCameraDevices();
      } catch (err: any) {
        console.warn('Camera access error:', err);
        let msg = 'Camera permission denied or camera device is unavailable.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg =
            'Camera permission was denied. Please allow camera access in your browser address bar/settings, or click "Choose from Gallery" below.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg = 'No camera hardware found on this device. Please upload from your gallery.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          msg = 'Camera is already in use by another application or tab. Please close other camera apps and retry.';
        } else if (err.name === 'OverconstrainedError') {
          // Fallback to any camera without facingMode constraint
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
            streamRef.current = fallbackStream;
            if (videoRef.current) {
              videoRef.current.srcObject = fallbackStream;
              await videoRef.current.play().catch(() => {});
            }
            return;
          } catch {
            msg = 'Requested camera resolution or orientation is not supported by your device.';
          }
        }
        setCameraError(msg);
      } finally {
        setStartingCamera(false);
      }
    },
    [stopStream, checkCameraDevices]
  );

  // Lifecycle: open/close modal
  useEffect(() => {
    if (isOpen) {
      void Promise.resolve().then(() => {
        startCamera(facingMode);
      });
    } else {
      stopStream();
    }

    return () => {
      stopStream();
    };
  }, [isOpen, facingMode, startCamera, stopStream]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
  }, [capturedPreviewUrl]);

  // Flip Camera between front & rear
  const handleFlipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);

    if (!hasMultipleCameras) {
      setDeviceNotice('Switching orientation... (Only 1 camera detected)');
      setTimeout(() => setDeviceNotice(null), 3000);
    }
  };

  // Shutter Capture
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Trigger visual shutter flash effect
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // If using user (front) camera, mirror image for natural selfie view
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setCapturedPreviewUrl(url);

        // Pause live video while reviewing preview
        try {
          video.pause();
        } catch {
          // ignore
        }
      },
      'image/jpeg',
      0.88
    );
  };

  // Retake: discard captured shot and resume live camera feed
  const handleRetakePhoto = () => {
    clearCapturedPreview();
    if (videoRef.current && streamRef.current) {
      videoRef.current.play().catch(() => {
        startCamera(facingMode);
      });
    } else {
      startCamera(facingMode);
    }
  };

  // Confirm and use captured photo
  const handleConfirmPhoto = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `food_photo_${Date.now()}.jpg`, {
      type: 'image/jpeg',
    });

    stopStream();
    clearCapturedPreview();
    onCapture(file);
    onClose();
  };

  const handleCloseModal = () => {
    stopStream();
    clearCapturedPreview();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop animate-fade-in" onClick={handleCloseModal}>
      <div
        className="modal-container camera-modal-card animate-scale-up"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '680px', width: '95%' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Camera size={20} className="text-emerald" />
            <h3 className="modal-title font-bold text-slate-900">
              {capturedPreviewUrl ? 'Review Food Photo' : 'Live Camera Viewfinder'}
            </h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleCloseModal}
            aria-label="Close camera"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body p-4 text-center">
          {cameraError ? (
            <div className="camera-error-container py-6">
              <AlertCircle size={44} className="text-amber mx-auto mb-3" />
              <h4 className="font-bold text-slate-800 mb-2">Camera Unavailable</h4>
              <p className="text-sm text-slate-600 mb-5 max-w-md mx-auto">{cameraError}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    handleCloseModal();
                    onFallbackToGallery?.();
                  }}
                >
                  <ImageIcon size={16} />
                  <span>Choose Photo from Gallery</span>
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => startCamera(facingMode)}
                >
                  <RefreshCw size={16} />
                  <span>Retry Camera Permission</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="camera-viewfinder-wrapper">
              {/* Viewfinder Screen */}
              <div
                className={`camera-feed-box relative rounded-2xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center border-2 border-slate-800 shadow-inner ${
                  isFlashing ? 'camera-shutter-flash' : ''
                }`}
              >
                {/* Initializing Spinner */}
                {startingCamera && !capturedPreviewUrl && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20 text-white">
                    <div className="spinner-large mb-3" />
                    <span className="text-sm font-semibold tracking-wide">
                      Requesting camera permission & initializing...
                    </span>
                  </div>
                )}

                {/* Live Video Element */}
                <video
                  ref={videoRef}
                  className={`w-full h-full object-cover ${
                    facingMode === 'user' ? 'transform -scale-x-100' : ''
                  } ${capturedPreviewUrl ? 'hidden' : 'block'}`}
                  playsInline
                  autoPlay
                  muted
                />

                {/* Captured Photo Preview Overlay */}
                {capturedPreviewUrl && (
                  <div className="absolute inset-0 z-15 bg-black flex items-center justify-center">
                    <img
                      src={capturedPreviewUrl}
                      alt="Captured food preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow">
                      <Sparkles size={13} className="text-emerald" />
                      <span>Photo Captured</span>
                    </div>
                  </div>
                )}

                {/* Viewfinder Target Guidelines (only during live view) */}
                {!capturedPreviewUrl && !startingCamera && (
                  <div className="viewfinder-overlay pointer-events-none absolute inset-0">
                    <div className="viewfinder-corner top-left" />
                    <div className="viewfinder-corner top-right" />
                    <div className="viewfinder-corner bottom-left" />
                    <div className="viewfinder-corner bottom-right" />
                    <div className="viewfinder-center-guide" />
                  </div>
                )}

                {/* Facing Mode Badge */}
                {!capturedPreviewUrl && !startingCamera && (
                  <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-medium z-10 flex items-center gap-1.5">
                    <Camera size={12} className="text-emerald" />
                    <span>{facingMode === 'environment' ? 'Rear Camera' : 'Front Camera'}</span>
                  </div>
                )}
              </div>

              {/* Status / Hint text */}
              {deviceNotice ? (
                <p className="text-xs text-amber-600 font-medium mt-2 animate-fade-in">
                  {deviceNotice}
                </p>
              ) : capturedPreviewUrl ? (
                <p className="text-xs text-emerald-700 font-semibold mt-2">
                  ✓ Photo captured! Review below: click <strong>Use Photo</strong> to attach or{' '}
                  <strong>Retake</strong> to snap another shot.
                </p>
              ) : (
                <p className="text-xs text-muted mt-2">
                  Position the surplus food dish clearly inside the frame with adequate room lighting.
                </p>
              )}

              {/* Controls Bar */}
              <div className="camera-controls-bar flex items-center justify-center gap-4 mt-5 pt-2 border-t border-slate-100">
                {capturedPreviewUrl ? (
                  // State 1: Photo Captured (Preview & Retake)
                  <div className="flex flex-wrap items-center justify-center gap-3 w-full">
                    <button
                      type="button"
                      className="btn btn-outline btn-md flex items-center gap-2"
                      onClick={handleRetakePhoto}
                    >
                      <RotateCcw size={18} />
                      <span>Retake Photo</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-md flex items-center gap-2 px-6 shadow-md"
                      onClick={handleConfirmPhoto}
                    >
                      <CheckCircle2 size={18} />
                      <span className="font-bold">Use This Photo</span>
                    </button>
                  </div>
                ) : (
                  // State 2: Live Viewfinder (Flip, Shutter, Gallery)
                  <>
                    {/* Flip Camera Button */}
                    <button
                      type="button"
                      className="btn btn-outline btn-sm flex items-center gap-1.5"
                      onClick={handleFlipCamera}
                      title={
                        hasMultipleCameras
                          ? 'Switch between front and rear cameras'
                          : 'Flip camera orientation'
                      }
                      disabled={startingCamera || !!cameraError}
                    >
                      <FlipHorizontal size={16} />
                      <span className="hidden sm:inline">Flip Camera</span>
                    </button>

                    {/* Main Capture Button */}
                    <button
                      type="button"
                      className="camera-shutter-btn flex items-center justify-center"
                      onClick={handleCapturePhoto}
                      disabled={startingCamera || !!cameraError}
                      aria-label="Capture Food Photo"
                      title="Capture Food Photo"
                    >
                      <div className="camera-shutter-inner" />
                    </button>

                    {/* Gallery Fallback Option */}
                    {onFallbackToGallery && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm flex items-center gap-1.5"
                        onClick={() => {
                          handleCloseModal();
                          onFallbackToGallery();
                        }}
                        title="Select an existing photo from device files"
                      >
                        <ImageIcon size={16} />
                        <span className="hidden sm:inline">Gallery</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
