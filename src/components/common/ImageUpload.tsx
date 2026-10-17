import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, AlertCircle, ShieldAlert } from 'lucide-react';
import { CameraCaptureModal } from './CameraCaptureModal';

interface Props {
  onImageSelected: (file: File) => void;
  onImageRemoved: () => void;
  previewUrl?: string;
  disabled?: boolean;
}

export const ImageUpload: React.FC<Props> = ({
  onImageSelected,
  onImageRemoved,
  previewUrl,
  disabled = false,
}) => {
  const [localPreview, setLocalPreview] = useState<string | null>(previewUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo exceeds 5MB size limit. Please choose a smaller photo.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, WebP).');
      return;
    }

    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    onImageSelected(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleCameraCapture = (file: File) => {
    processFile(file);
  };

  const handleRemove = () => {
    setLocalPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (mobileCameraInputRef.current) mobileCameraInputRef.current.value = '';
    onImageRemoved();
  };

  const handleStartCamera = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      setCameraModalOpen(true);
    } else if (mobileCameraInputRef.current) {
      // Fallback for older mobile devices without getUserMedia
      mobileCameraInputRef.current.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="image-upload-wrapper">
      <div className="flex items-center justify-between mb-1">
        <label className="form-label mb-0 font-semibold text-slate-800">
          Food Photo (Live Camera or Gallery Upload)
        </label>
        <span className="text-xs text-muted">Optional but recommended</span>
      </div>

      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled}
      />
      {/* Mobile camera specific input fallback */}
      <input
        type="file"
        ref={mobileCameraInputRef}
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled}
      />

      {/* Live Camera Modal */}
      <CameraCaptureModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handleCameraCapture}
        onFallbackToGallery={() => fileInputRef.current?.click()}
      />

      {localPreview ? (
        <div className="image-preview-container animate-fade-in">
          <img src={localPreview} alt="Food preview" className="image-preview" />
          <button
            type="button"
            className="btn-remove-image"
            onClick={handleRemove}
            title="Remove photo"
            disabled={disabled}
          >
            <X size={18} />
          </button>
          <div className="image-preview-badge">Attached Photo</div>

          <div className="safety-photo-disclaimer flex items-center gap-2 mt-2 p-2 rounded-lg bg-amber-50 text-amber-800 text-xs border border-amber-200">
            <ShieldAlert size={16} className="shrink-0 text-amber-600" />
            <span>
              <strong>Food Safety Notice:</strong> A photo alone is visual reference only and does
              not certify food safety. Always verify smell, temperature, and preparation timestamps.
            </span>
          </div>
        </div>
      ) : (
        <div className="image-upload-box">
          <div className="image-upload-icon-group">
            <Camera size={30} className="text-emerald" />
            <ImageIcon size={30} className="text-muted" />
          </div>
          <p className="image-upload-instruction">
            Take a real-time photo of the dish or select from your gallery
          </p>
          <span className="image-upload-hint">Supported: JPG, PNG, WebP (Max 5MB)</span>

          <div className="image-upload-buttons">
            <button
              type="button"
              className="btn btn-primary btn-sm flex items-center gap-2"
              onClick={handleStartCamera}
              disabled={disabled}
            >
              <Camera size={16} />
              <span>Take Photo</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm flex items-center gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <ImageIcon size={16} />
              <span>Upload from Gallery</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="form-error-inline">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
