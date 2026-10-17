import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, AlertCircle } from 'lucide-react';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

  const handleRemove = () => {
    setLocalPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    onImageRemoved();
  };

  return (
    <div className="image-upload-wrapper">
      <label className="form-label">Food Photo (Camera or Upload)</label>

      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled}
      />
      {/* Mobile camera specific input */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled}
      />

      {localPreview ? (
        <div className="image-preview-container">
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
          <div className="image-preview-badge">Selected Photo</div>
        </div>
      ) : (
        <div className="image-upload-box">
          <div className="image-upload-icon-group">
            <Camera size={32} className="text-emerald" />
            <ImageIcon size={32} className="text-muted" />
          </div>
          <p className="image-upload-instruction">
            Capture with phone camera or upload from device gallery
          </p>
          <span className="image-upload-hint">Supported: JPG, PNG, WebP (Max 5MB)</span>

          <div className="image-upload-buttons">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => cameraInputRef.current?.click()}
              disabled={disabled}
            >
              <Camera size={16} />
              Open Camera
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <ImageIcon size={16} />
              Choose from Gallery
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
