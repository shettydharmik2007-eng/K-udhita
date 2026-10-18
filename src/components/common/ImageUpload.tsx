import React, { useRef, useState, useEffect } from 'react';
import {
  Camera,
  Image as ImageIcon,
  X,
  AlertCircle,
  ShieldAlert,
  RotateCcw,
  RefreshCw,
  Upload,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { CameraCaptureModal } from './CameraCaptureModal';

interface Props {
  onImageSelected: (file: File) => void;
  onImageRemoved: () => void;
  previewUrl?: string;
  disabled?: boolean;
  uploadProgress?: number | null;
  isUploading?: boolean;
  uploadError?: string | null;
  onRetryUpload?: () => void;
}

export const ImageUpload: React.FC<Props> = ({
  onImageSelected,
  onImageRemoved,
  previewUrl,
  disabled = false,
  uploadProgress = null,
  isUploading = false,
  uploadError = null,
  onRetryUpload,
}) => {
  const [localPreview, setLocalPreview] = useState<string | null>(previewUrl || null);
  const [fileDetails, setFileDetails] = useState<{ name: string; sizeKb: number } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync external previewUrl updates (e.g., when editing existing listings)
  useEffect(() => {
    if (previewUrl && !localPreview) {
      setLocalPreview(previewUrl);
    }
  }, [previewUrl]);

  // Format file size nicely
  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const processFile = (file: File) => {
    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setValidationError('Photo exceeds 5MB size limit. Please choose a smaller photo.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setValidationError('Please select a valid image file (JPEG, PNG, or WebP).');
      return;
    }

    setValidationError(null);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    setFileDetails({
      name: file.name,
      sizeKb: Math.round(file.size / 1024),
    });
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
    if (localPreview && localPreview.startsWith('blob:')) {
      URL.revokeObjectURL(localPreview);
    }
    setLocalPreview(null);
    setFileDetails(null);
    setValidationError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onImageRemoved();
  };

  const handleStartCamera = () => {
    setCameraModalOpen(true);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
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

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp,image/jpg"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled || isUploading}
      />

      {/* Live Camera Viewfinder Modal */}
      <CameraCaptureModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handleCameraCapture}
        onFallbackToGallery={() => fileInputRef.current?.click()}
      />

      {localPreview ? (
        // STATE 1: Photo Selected / Preview Mode
        <div className="image-preview-card animate-fade-in">
          <div className="image-preview-container">
            <img src={localPreview} alt="Selected food preview" className="image-preview" />
            <div className="image-preview-badge">Attached Food Photo</div>
            {fileDetails && (
              <div className="image-filesize-badge">{fileDetails.sizeKb} KB</div>
            )}
          </div>

          {/* Upload Progress Bar (when active) */}
          {(isUploading || (uploadProgress !== null && uploadProgress > 0)) && (
            <div className="upload-progress-container mt-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                <span className="flex items-center gap-1.5">
                  <Upload size={13} className="text-emerald animate-bounce" />
                  <span>Uploading to Firebase Storage...</span>
                </span>
                <span>{uploadProgress || 0}%</span>
              </div>
              <div className="upload-progress-track">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${Math.min(100, uploadProgress || 0)}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Error Banner & Retry Button */}
          {uploadError && (
            <div className="upload-error-box mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong>Photo Upload Failed:</strong> {uploadError}
                  {onRetryUpload && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger inline-flex items-center gap-1.5"
                        onClick={onRetryUpload}
                        disabled={isUploading}
                      >
                        <RefreshCw size={13} />
                        <span>Retry Upload</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Toolbar: Retake, Change, Remove */}
          <div className="image-preview-actions mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm flex items-center gap-1.5"
              onClick={handleStartCamera}
              disabled={disabled || isUploading}
              title="Open camera to retake photo"
            >
              <Camera size={14} className="text-emerald" />
              <span>Retake Photo</span>
            </button>

            <button
              type="button"
              className="btn btn-outline btn-sm flex items-center gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              title="Choose a different image from files"
            >
              <ImageIcon size={14} />
              <span>Change Photo</span>
            </button>

            <button
              type="button"
              className="btn btn-outline btn-sm text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-1.5 ml-auto"
              onClick={handleRemove}
              disabled={disabled || isUploading}
              title="Remove photo"
            >
              <Trash2 size={14} />
              <span>Remove</span>
            </button>
          </div>

          {/* Food Safety Disclaimer */}
          <div className="safety-photo-disclaimer flex items-center gap-2 mt-3 p-2.5 rounded-lg bg-amber-50 text-amber-800 text-xs border border-amber-200">
            <ShieldAlert size={16} className="shrink-0 text-amber-600" />
            <span>
              <strong>Food Safety Note:</strong> Visual photos provide immediate reference for receiving
              shelters. Certified safe temperature and preparation time must still be verified upon pickup.
            </span>
          </div>
        </div>
      ) : (
        // STATE 2: Empty Upload Box with Prominent "Take Photo" and "Choose Photo" Buttons
        <div
          className={`image-upload-box ${isDragging ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="image-upload-icon-group">
            <div className="icon-badge bg-emerald-50 text-emerald-600 p-2.5 rounded-full border border-emerald-100">
              <Camera size={26} />
            </div>
            <div className="icon-badge bg-blue-50 text-blue-600 p-2.5 rounded-full border border-blue-100">
              <ImageIcon size={26} />
            </div>
          </div>

          <p className="image-upload-instruction text-slate-800 font-bold text-sm">
            Snap a real-time photo of the prepared dish or upload from files
          </p>
          <span className="image-upload-hint text-xs text-slate-500">
            Supports JPG, PNG, WebP (Max 5MB) • Clear lighting recommended
          </span>

          {/* Clearly Visible Action Buttons */}
          <div className="image-upload-buttons flex flex-wrap items-center justify-center gap-3 mt-2">
            <button
              type="button"
              className="btn btn-primary btn-sm flex items-center gap-2 px-4 shadow-sm"
              onClick={handleStartCamera}
              disabled={disabled}
            >
              <Camera size={16} />
              <span className="font-bold">Take Live Photo</span>
            </button>

            <button
              type="button"
              className="btn btn-outline btn-sm flex items-center gap-2 px-4"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <ImageIcon size={16} />
              <span>Choose from Gallery</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 mt-1">
            or drag and drop your food image directly into this box
          </p>
        </div>
      )}

      {/* Inline Validation Error */}
      {validationError && (
        <div className="form-error-inline flex items-center gap-1.5 text-xs text-red-600 mt-1.5 animate-fade-in">
          <AlertCircle size={14} />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
};
