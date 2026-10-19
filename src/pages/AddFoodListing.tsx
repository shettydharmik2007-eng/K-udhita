import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import { createFoodListing, uploadFoodImage } from '../services/foodService';
import { ImageUpload } from '../components/common/ImageUpload';
import type {
  FoodCategory,
  DietaryType,
  StorageCondition,
  FoodCondition,
  WeightUnit,
  WeightMeasurementMethod,
} from '../types';
import {
  Clock,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Building2,
  Scale,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Thermometer,
  FileText,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

function getInitialFormDates() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowHours = now.getHours().toString().padStart(2, '0');
  const nowMinutes = now.getMinutes().toString().padStart(2, '0');
  const futureDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const defaultDeadlineDate = futureDate.toISOString().split('T')[0];
  const defaultDeadlineTime = `${futureDate.getHours().toString().padStart(2, '0')}:${futureDate
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
  return {
    prepDate: todayStr,
    prepTime: `${nowHours}:${nowMinutes}`,
    deadlineDate: defaultDeadlineDate,
    deadlineTime: defaultDeadlineTime,
  };
}

// 6 Core Categories with rich details and dish suggestions
const CATEGORY_DEFINITIONS: {
  id: FoodCategory;
  title: string;
  desc: string;
  icon: string;
  suggestions: string[];
}[] = [
  {
    id: 'rice_pulao',
    title: 'Rice & Pulao',
    desc: 'Biryani, Jeera Rice, Fried Rice, Pulao, Khichdi',
    icon: '🍚',
    suggestions: ['Veg Biryani', 'Jeera Rice', 'Hyderabadi Dum Pulao', 'Steamed Basmati Rice', 'Peas Pulao', 'Khichdi', 'Curd Rice'],
  },
  {
    id: 'curries_dal',
    title: 'Curries & Dal',
    desc: 'Dal Makhani, Paneer Gravy, Mix Veg, Chole, Sambar',
    icon: '🍲',
    suggestions: ['Dal Makhani', 'Paneer Butter Masala', 'Yellow Dal Tadka', 'Mix Veg Curry', 'Palak Paneer', 'Chole Masala', 'Sambar'],
  },
  {
    id: 'roti_bread',
    title: 'Roti & Bread',
    desc: 'Naan, Tandoori Roti, Chapati, Poori, Parathas',
    icon: '🫓',
    suggestions: ['Tandoori Roti', 'Butter Naan', 'Phulka / Chapati', 'Poori', 'Laccha Paratha', 'Missi Roti', 'Garlic Naan'],
  },
  {
    id: 'snacks_starters',
    title: 'Snacks & Starters',
    desc: 'Samosas, Cutlets, Tikka, Pakoras, Spring Rolls',
    icon: '🥟',
    suggestions: ['Paneer Tikka', 'Cocktail Samosas', 'Veg Cutlet', 'Spring Rolls', 'Hara Bhara Kabab', 'Assorted Pakoras', 'Aloo Tikki'],
  },
  {
    id: 'sweets_desserts',
    title: 'Sweets & Desserts',
    desc: 'Gulab Jamun, Kheer, Halwa, Pastries, Rasgulla',
    icon: '🍨',
    suggestions: ['Gulab Jamun', 'Moong Dal Halwa', 'Rice Kheer', 'Rasgulla', 'Gajar Ka Halwa', 'Shahi Tukda', 'Jalebi'],
  },
  {
    id: 'fruits_salad_others',
    title: 'Fruits, Salad & Others',
    desc: 'Fruit Platters, Green Salad, Raita, Soups & Dips',
    icon: '🥗',
    suggestions: ['Fresh Cut Fruit Platter', 'Green Garden Salad', 'Boondi Raita', 'Russian Salad', 'Hot Tomato Soup', 'Sprouts Salad'],
  },
];

export const AddFoodListing: React.FC<Props> = ({ onNavigate }) => {
  const { currentUser, userProfile, isDonor } = useAuth();
  const { showNotification } = useNotification();

  // Step 1: Category (required first step)
  const [category, setCategory] = useState<FoodCategory>('rice_pulao');

  // Step 2: Dish Name & Suggestions
  const [foodName, setFoodName] = useState('');

  // Step 3: Photo
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Step 4: Direct Weight Entry (NO guest calculator)
  const [recordedWeight, setRecordedWeight] = useState<number | ''>('');
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [measurementMethod, setMeasurementMethod] = useState<WeightMeasurementMethod>('digital_scale');

  // Step 5: Preparation Date & Time
  const [prepDate, setPrepDate] = useState(() => getInitialFormDates().prepDate);
  const [prepTime, setPrepTime] = useState(() => getInitialFormDates().prepTime);

  // Step 6: Pickup Deadline Date & Time
  const [deadlineDate, setDeadlineDate] = useState(() => getInitialFormDates().deadlineDate);
  const [deadlineTime, setDeadlineTime] = useState(() => getInitialFormDates().deadlineTime);

  // Current timestamp tracked cleanly for countdown
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayDateStr = new Date(currentTime).toISOString().split('T')[0];

  // Step 7: Food Safety & Storage
  const [foodCondition, setFoodCondition] = useState<FoodCondition>('suitable');
  const [storageCondition, setStorageCondition] = useState<StorageCondition>('hot_holding');
  const [dietaryType, setDietaryType] = useState<DietaryType>('veg');
  const [location, setLocation] = useState(userProfile?.address || '');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [description, setDescription] = useState('');

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Photo upload states
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  // Compute normalized standard kilograms
  const computedKg =
    recordedWeight && Number(recordedWeight) > 0
      ? weightUnit === 'g'
        ? Number(recordedWeight) / 1000
        : Number(recordedWeight)
      : 0;

  // Compute remaining time until deadline
  const deadlineDateTime = new Date(`${deadlineDate}T${deadlineTime}`);
  const isDeadlineValid = !isNaN(deadlineDateTime.getTime()) && deadlineDateTime.getTime() > currentTime;
  const diffMinutes = Math.round((deadlineDateTime.getTime() - currentTime) / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const remainingMins = diffMinutes % 60;

  // Selected category definition
  const currentCategoryDef = CATEGORY_DEFINITIONS.find((c) => c.id === category) || CATEGORY_DEFINITIONS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isFirebaseConfigured) {
      setErrorMessage(
        'Firebase is not configured in .env. Real listings cannot be written to Firestore until setup is complete.'
      );
      return;
    }

    if (!currentUser || !userProfile) {
      setErrorMessage('You must be signed in as a Hotel or Banquet Hall donor to list food.');
      return;
    }

    if (!foodName.trim()) {
      setErrorMessage('Please enter or select a dish name.');
      return;
    }

    if (!recordedWeight || Number(recordedWeight) <= 0) {
      setErrorMessage('Please enter a valid food weight greater than zero.');
      return;
    }

    if (!prepDate || !prepTime) {
      setErrorMessage('Please specify the date and time when the food was prepared.');
      return;
    }

    if (!deadlineDate || !deadlineTime) {
      setErrorMessage('Please specify a pickup deadline date and time.');
      return;
    }

    if (!isDeadlineValid) {
      setErrorMessage('The pickup deadline must be later than the current listing time.');
      return;
    }

    if (!location.trim()) {
      setErrorMessage('Please provide the pickup location / hotel address.');
      return;
    }

    setLoading(true);
    try {
      let imageUrl = '';
      if (selectedFile) {
        setIsUploadingPhoto(true);
        setPhotoUploadError(null);
        setUploadProgress('Uploading food photo: 0%...');
        try {
          imageUrl = await uploadFoodImage(selectedFile, (percent) => {
            setPhotoUploadProgress(percent);
            setUploadProgress(`Uploading food photo: ${percent}%...`);
          });
        } catch (uploadErr: any) {
          console.error('[AddFoodListing] Image upload failed:', uploadErr);
          console.error(`[AddFoodListing] Firebase Storage Error Code: ${uploadErr?.code || 'unknown'}`);
          console.error(`[AddFoodListing] Firebase Storage Error Message: ${uploadErr?.message || uploadErr}`);
          const errorMsg = uploadErr.message || 'Firebase Storage upload failed';
          setIsUploadingPhoto(false);
          setPhotoUploadProgress(null);
          setPhotoUploadError(errorMsg);
          setErrorMessage(
            `Food photo upload failed: ${errorMsg}. Please retry or remove the photo to publish without one.`
          );
          setLoading(false);
          setUploadProgress(null);
          return;
        } finally {
          setIsUploadingPhoto(false);
        }
      }

      setUploadProgress('Saving listing details to Cloud Firestore...');
      const combinedPickupDeadline = deadlineDateTime.toISOString();

      await createFoodListing({
        donorId: currentUser.uid,
        donorName: userProfile.name,
        donorOrg: userProfile.organizationName || userProfile.name,
        donorPhone: userProfile.phone || '',
        foodName: foodName.trim(),
        category,
        dietaryType,
        initialQuantityKg: computedKg,
        portions: Math.max(1, Math.round(computedKg * 3)),
        recordedWeight: Number(recordedWeight),
        weightUnit,
        measurementMethod,
        prepDate,
        prepTime,
        pickupDeadline: combinedPickupDeadline,
        location: location.trim(),
        pickupInstructions: pickupInstructions.trim(),
        storageCondition,
        foodCondition,
        description: description.trim(),
        imageUrl,
      });

      showNotification(
        'success',
        'Food Listed Successfully!',
        `${foodName} (${computedKg.toFixed(1)} kg) is now active in your Hotel Portal.`
      );
      onNavigate('hotel-dashboard');
    } catch (err: any) {
      console.error('Failed to create food listing:', err);
      const msg = err.message || 'Failed to create listing. Please try again.';
      setErrorMessage(msg);
      showNotification('error', 'Listing Error', msg);
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header">
        <div className="page-header-badge">
          <Building2 size={16} className="text-emerald" />
          <span>Hospitality Surplus Portal</span>
        </div>
        <h1 className="page-title">List Banquet & Hotel Food Surplus</h1>
        <p className="page-subtitle">
          Record surplus meals from weddings, buffets, or conferences with direct weight verification for immediate NGO redistribution or organic recycling.
        </p>
      </div>

      {!isDonor && (
        <div className="alert alert-warning mb-6" role="alert">
          <AlertCircle size={18} />
          <div>
            <strong>Notice:</strong> You are currently signed in with a non-hotel account. Only registered
            Hotels, Caterers, and Banquet Halls can create food listings.
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-danger mb-6 animate-fade-in" role="alert">
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-card max-w-4xl mx-auto space-y-8">
        {/* STEP 1: Food Category Selection (First Step) */}
        <div className="form-section">
          <div className="flex items-center gap-2 mb-1">
            <span className="step-number-badge">1</span>
            <h2 className="text-lg font-bold text-slate-900">Select Food Category *</h2>
          </div>
          <p className="text-xs text-muted mb-3">
            Choose the category of banquet or buffet surplus you are listing.
          </p>

          <div className="category-select-grid">
            {CATEGORY_DEFINITIONS.map((cat) => {
              const isSelected = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`category-select-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setCategory(cat.id);
                  }}
                >
                  <div className="category-card-icon text-xl">{cat.icon}</div>
                  <div className="category-card-title">{cat.title}</div>
                  <div className="category-card-desc">{cat.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 2: Dish Name & Quick Suggestions */}
        <div className="form-section">
          <div className="flex items-center gap-2 mb-1">
            <span className="step-number-badge">2</span>
            <h2 className="text-lg font-bold text-slate-900">Dish Name *</h2>
          </div>
          <p className="text-xs text-muted mb-2">
            Click a popular banquet dish suggestion or type your hotel's custom preparation name.
          </p>

          <div className="form-group mb-2">
            <input
              type="text"
              className="form-control text-base font-semibold"
              placeholder={`e.g. ${currentCategoryDef.suggestions[0]} or Chef's Special Curry`}
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              required
            />
          </div>

          {/* Quick Suggestions Chips */}
          <div className="dish-suggestion-box">
            <span className="text-xs font-semibold text-slate-700">Quick Suggestions:</span>
            <div className="dish-suggestion-chips">
              {currentCategoryDef.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={`dish-chip ${foodName === suggestion ? 'active' : ''}`}
                  onClick={() => setFoodName(suggestion)}
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* STEP 3: Food Photo & Live Camera Viewfinder */}
        <div className="form-section">
          <div className="flex items-center gap-2 mb-1">
            <span className="step-number-badge">3</span>
            <h2 className="text-lg font-bold text-slate-900">Food Photo (Camera or Gallery)</h2>
          </div>
          <p className="text-xs text-muted mb-3">
            Capture a live photo using your phone/webcam or select an image from your device gallery.
          </p>

          <ImageUpload
            onImageSelected={(file) => {
              setSelectedFile(file);
              setPhotoUploadError(null);
            }}
            onImageRemoved={() => {
              setSelectedFile(null);
              setPhotoUploadError(null);
              setPhotoUploadProgress(null);
            }}
            uploadProgress={photoUploadProgress}
            isUploading={isUploadingPhoto}
            uploadError={photoUploadError}
            onRetryUpload={() => {
              setPhotoUploadError(null);
              // Trigger form submission
              const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
              handleSubmit(fakeEvent);
            }}
            disabled={loading}
          />
        </div>

        {/* STEP 4: Direct Food Weight Entry (NO Guest Calculator) */}
        <div className="form-section">
          <div className="flex items-center gap-2 mb-1">
            <span className="step-number-badge">4</span>
            <h2 className="text-lg font-bold text-slate-900">Direct Food Weight Entry *</h2>
          </div>
          <p className="text-xs text-muted mb-3">
            Enter the measured or verified weight directly. Do not enter guest count or estimated leftovers.
          </p>

          <div className="weight-entry-wrapper">
            <div className="form-row-2 gap-4">
              <div className="form-group">
                <label className="form-label font-bold text-slate-800">
                  Measured Surplus Weight *
                </label>
                <div className="weight-input-container">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    className="form-control text-lg font-bold text-slate-900"
                    placeholder="e.g. 15.5"
                    value={recordedWeight}
                    onChange={(e) =>
                      setRecordedWeight(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)))
                    }
                    required
                  />

                  {/* Unit Selector Toggle */}
                  <div className="unit-switch-group">
                    <button
                      type="button"
                      className={`unit-switch-btn ${weightUnit === 'kg' ? 'active' : ''}`}
                      onClick={() => setWeightUnit('kg')}
                    >
                      Kilograms (kg)
                    </button>
                    <button
                      type="button"
                      className={`unit-switch-btn ${weightUnit === 'g' ? 'active' : ''}`}
                      onClick={() => setWeightUnit('g')}
                    >
                      Grams (g)
                    </button>
                  </div>
                </div>

                {computedKg > 0 && (
                  <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md inline-block">
                    ✓ Recorded Quantity: {computedKg.toFixed(2)} kg (~{Math.round(computedKg * 3)} adult portions)
                  </div>
                )}
              </div>

              {/* Weight Measurement Method */}
              <div className="form-group">
                <label className="form-label font-bold text-slate-800">
                  Measurement Method *
                </label>
                <div className="measurement-method-grid">
                  <div
                    className={`measurement-method-card ${
                      measurementMethod === 'digital_scale' ? 'selected' : ''
                    }`}
                    onClick={() => setMeasurementMethod('digital_scale')}
                  >
                    <Scale size={20} className="text-emerald" />
                    <div>
                      <div className="font-bold">Digital Weighing Scale</div>
                      <div className="text-xs text-muted">Kitchen scale verified</div>
                    </div>
                  </div>

                  <div
                    className={`measurement-method-card ${
                      measurementMethod === 'manual_estimate' ? 'selected' : ''
                    }`}
                    onClick={() => setMeasurementMethod('manual_estimate')}
                  >
                    <FileText size={20} className="text-amber-600" />
                    <div>
                      <div className="font-bold">Manual Chef Estimate</div>
                      <div className="text-xs text-muted">Vessel / tray capacity</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 5: Preparation Date & Time */}
        <div className="form-section">
          <div className="flex items-center gap-2 mb-1">
            <span className="step-number-badge">5</span>
            <h2 className="text-lg font-bold text-slate-900">Preparation Date & Time *</h2>
          </div>
          <p className="text-xs text-muted mb-3">
            Record precisely when this batch of food was cooked or taken off the banquet line.
          </p>

          <div className="form-row-2 gap-4">
            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">
                <Calendar size={14} className="inline mr-1 text-emerald" /> Preparation Date *
              </label>
              <input
                type="date"
                className="form-control"
                value={prepDate}
                max={todayDateStr}
                onChange={(e) => setPrepDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">
                <Clock size={14} className="inline mr-1 text-emerald" /> Preparation Time *
              </label>
              <input
                type="time"
                className="form-control"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {/* STEP 6: Pickup Deadline & Countdown */}
        <div className="form-section">
          <div className="flex items-center gap-2 mb-1">
            <span className="step-number-badge">6</span>
            <h2 className="text-lg font-bold text-slate-900">Pickup Deadline *</h2>
          </div>
          <p className="text-xs text-muted mb-3">
            Specify the latest time by which recipient NGOs or volunteers must collect the food.
          </p>

          <div className="form-row-2 gap-4">
            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">
                <Calendar size={14} className="inline mr-1 text-emerald" /> Deadline Date *
              </label>
              <input
                type="date"
                className="form-control"
                value={deadlineDate}
                min={todayDateStr}
                onChange={(e) => setDeadlineDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">
                <Clock size={14} className="inline mr-1 text-emerald" /> Deadline Time *
              </label>
              <input
                type="time"
                className="form-control"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Time Remaining indicator */}
          <div className="mt-3">
            {isDeadlineValid ? (
              <span className={`countdown-badge ${diffMinutes < 120 ? 'urgent' : 'normal'}`}>
                <Clock size={14} />
                <span>
                  Pickup Window: {diffHours > 0 ? `${diffHours}h ` : ''}
                  {remainingMins}m remaining from now
                </span>
              </span>
            ) : (
              <span className="countdown-badge overdue">
                <AlertCircle size={14} />
                <span>Deadline must be in the future (later than current time)</span>
              </span>
            )}
          </div>
        </div>

        {/* STEP 7: Food Safety, Storage Condition & Location */}
        <div className="form-section">
          <div className="flex items-center gap-2 mb-1">
            <span className="step-number-badge">7</span>
            <h2 className="text-lg font-bold text-slate-900">Food Safety & Storage Conditions *</h2>
          </div>
          <p className="text-xs text-muted mb-3">
            Certify the food condition and temperature controls to guarantee recipient safety.
          </p>

          {/* Food Condition Radio Selector */}
          <div className="form-group mb-4">
            <label className="form-label font-bold text-slate-800">
              Food Safety Condition *
            </label>
            <div className="condition-selector-grid">
              <div
                className={`condition-card suitable ${foodCondition === 'suitable' ? 'selected' : ''}`}
                onClick={() => setFoodCondition('suitable')}
              >
                <div className="flex items-center gap-2 text-emerald font-bold">
                  <ShieldCheck size={18} />
                  <span>Suitable for Donation</span>
                </div>
                <span className="text-xs text-muted mt-1">
                  Fresh, unserved banquet surplus safe for immediate community distribution.
                </span>
              </div>

              <div
                className={`condition-card not_suitable ${foodCondition === 'not_suitable' ? 'selected' : ''}`}
                onClick={() => setFoodCondition('not_suitable')}
              >
                <div className="flex items-center gap-2 text-red-600 font-bold">
                  <ShieldAlert size={18} />
                  <span>Not Suitable for Donation</span>
                </div>
                <span className="text-xs text-muted mt-1">
                  Exceeded food safety holding limit. Will be routed directly to organic waste circular loop.
                </span>
              </div>

              <div
                className={`condition-card requires_review ${foodCondition === 'requires_review' ? 'selected' : ''}`}
                onClick={() => setFoodCondition('requires_review')}
              >
                <div className="flex items-center gap-2 text-amber-600 font-bold">
                  <HelpCircle size={18} />
                  <span>Requires Review</span>
                </div>
                <span className="text-xs text-muted mt-1">
                  Requires inspection by kitchen supervisor before releasing to volunteers.
                </span>
              </div>
            </div>
          </div>

          <div className="form-row-2 gap-4">
            {/* Storage Condition */}
            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">
                <Thermometer size={14} className="inline mr-1 text-emerald" /> Current Storage Condition *
              </label>
              <select
                className="form-control"
                value={storageCondition}
                onChange={(e) => setStorageCondition(e.target.value as StorageCondition)}
                required
              >
                <option value="hot_holding">Kept Hot (≥ 60°C in Bain Marie / Chafing Dish)</option>
                <option value="refrigerated">Refrigerated (≤ 5°C in Chiller / Cold Room)</option>
                <option value="room_temp">Room Temperature (Covered & Dry)</option>
                <option value="other">Other Temperature Controlled Setup</option>
              </select>
            </div>

            {/* Dietary Type */}
            <div className="form-group">
              <label className="form-label font-semibold text-slate-800">
                Dietary Preference *
              </label>
              <select
                className="form-control"
                value={dietaryType}
                onChange={(e) => setDietaryType(e.target.value as DietaryType)}
                required
              >
                <option value="veg">Vegetarian (Pure Veg)</option>
                <option value="non-veg">Non-Vegetarian</option>
                <option value="vegan">Vegan</option>
              </select>
            </div>
          </div>

          {/* Location & Instructions */}
          <div className="form-group mt-3">
            <label className="form-label font-semibold text-slate-800">
              <MapPin size={14} className="inline mr-1 text-emerald" /> Pickup Address / Gate Location *
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Grand Ballroom Banquet Entrance, Service Gate 2, Hotel Taj"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label font-semibold text-slate-800">
              Pickup Instructions & Staff Contact (Optional)
            </label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="e.g. Please bring clean food-grade insulated containers. Ask for Duty Captain Ramesh on arrival."
              value={pickupInstructions}
              onChange={(e) => setPickupInstructions(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label font-semibold text-slate-800">
              Additional Details / Description (Optional)
            </label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="e.g. Freshly prepared for banquet, kept in sealed chafing dishes."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* Submission Actions */}
        <div className="form-actions-bar border-t pt-6 flex items-center justify-between">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onNavigate('hotel-dashboard')}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="btn btn-primary btn-lg flex items-center gap-2"
            disabled={loading || !isDeadlineValid || !recordedWeight}
          >
            {loading ? (
              <>
                <div className="spinner-small" />
                <span>{uploadProgress || 'Publishing Listing...'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span>Publish Food Listing</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
