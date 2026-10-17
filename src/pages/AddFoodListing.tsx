import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { isFirebaseConfigured } from '../services/firebase';
import { createFoodListing, uploadFoodImage } from '../services/foodService';
import { ImageUpload } from '../components/common/ImageUpload';
import type { FoodCategory, DietaryType, StorageCondition } from '../types';
import {
  Utensils,
  Clock,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Building2,
  Scale,
  Users,
  Info,
  ArrowRight,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const AddFoodListing: React.FC<Props> = ({ onNavigate }) => {
  const { currentUser, userProfile, isDonor } = useAuth();
  const { showNotification } = useNotification();

  const [foodName, setFoodName] = useState('');
  const [category, setCategory] = useState<FoodCategory>('cooked_meals');
  const [dietaryType, setDietaryType] = useState<DietaryType>('veg');
  const [initialQuantityKg, setInitialQuantityKg] = useState<number | ''>('');
  const [portions, setPortions] = useState<number | ''>('');
  const [prepTime, setPrepTime] = useState('');
  const [pickupDeadline, setPickupDeadline] = useState('');
  const [location, setLocation] = useState(userProfile?.address || '');
  const [storageCondition, setStorageCondition] = useState<StorageCondition>('room_temp');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    if (!initialQuantityKg || Number(initialQuantityKg) <= 0) {
      setErrorMessage('Please specify a valid quantity in kilograms (> 0 kg).');
      return;
    }

    if (!portions || Number(portions) <= 0) {
      setErrorMessage('Please specify estimated portions (> 0).');
      return;
    }

    if (!pickupDeadline) {
      setErrorMessage('Please select a pickup deadline.');
      return;
    }

    setLoading(true);
    try {
      let imageUrl = '';
      if (selectedFile) {
        setUploadProgress('Uploading food photo to Firebase Storage...');
        imageUrl = await uploadFoodImage(selectedFile);
      }

      setUploadProgress('Recording food listing in Cloud Firestore...');
      await createFoodListing({
        donorId: currentUser.uid,
        donorName: userProfile.name,
        donorOrg: userProfile.organizationName || userProfile.name,
        donorPhone: userProfile.phone || '',
        foodName,
        category,
        dietaryType,
        initialQuantityKg: Number(initialQuantityKg),
        portions: Number(portions),
        prepTime: prepTime || new Date().toISOString(),
        pickupDeadline,
        location,
        storageCondition,
        description,
        imageUrl,
      });

      showNotification('success', 'Food Listed Successfully!', `${foodName} is now live for community pickup.`);
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
      <div className="page-header">
        <div className="page-header-badge">
          <Building2 size={16} className="text-emerald" />
          <span>Surplus Hospitality Redistribution</span>
        </div>
        <h1 className="page-title">List Leftover Food</h1>
        <p className="page-subtitle">
          Record edible surplus meals from your banquet or buffet before expiry so nearby community NGOs can collect them.
        </p>
      </div>

      {!isDonor && (
        <div className="alert alert-warning mb-4" role="alert">
          <AlertCircle size={18} />
          <div>
            <strong>Notice:</strong> You are currently signed in with a non-donor role. Only registered
            Hotels, Caterers, and Banquet Halls should post surplus food.
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="alert alert-danger mb-4" role="alert">
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="form-card-container">
        <form onSubmit={handleSubmit} className="standard-form">
          {/* Photo capture component */}
          <div className="form-section">
            <h3 className="form-section-title">1. Food Photo</h3>
            <ImageUpload
              onImageSelected={(file) => setSelectedFile(file)}
              onImageRemoved={() => setSelectedFile(null)}
              disabled={loading}
            />
          </div>

          {/* Basic Details */}
          <div className="form-section">
            <h3 className="form-section-title">2. Food Identification</h3>

            <div className="form-group">
              <label className="form-label" htmlFor="food-name">
                Food / Dish Name *
              </label>
              <input
                id="food-name"
                type="text"
                className="form-control"
                placeholder="e.g. Mixed Vegetable Pulao & Paneer Gravy Platters"
                value={foodName}
                onChange={(e) => setFoodName(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="food-category">
                  Category *
                </label>
                <select
                  id="food-category"
                  className="form-control"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FoodCategory)}
                  disabled={loading}
                >
                  <option value="cooked_meals">Cooked Buffet / Meals</option>
                  <option value="bakery">Bakery & Breads</option>
                  <option value="raw_produce">Raw Produce / Salads</option>
                  <option value="packaged">Packaged / Sealed Food</option>
                  <option value="dairy_desserts">Dairy & Desserts</option>
                  <option value="beverages">Beverages & Juices</option>
                  <option value="other">Other Edibles</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="dietary-type">
                  Dietary Classification *
                </label>
                <select
                  id="dietary-type"
                  className="form-control"
                  value={dietaryType}
                  onChange={(e) => setDietaryType(e.target.value as DietaryType)}
                  disabled={loading}
                >
                  <option value="veg">Vegetarian (Veg)</option>
                  <option value="non-veg">Non-Vegetarian (Non-Veg)</option>
                  <option value="vegan">100% Plant-Based (Vegan)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quantities and Times */}
          <div className="form-section">
            <h3 className="form-section-title">3. Quantities & Timings</h3>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="quantity-kg">
                  Available Quantity in Kilograms (kg) *
                </label>
                <div className="input-with-icon">
                  <Scale size={18} className="input-icon" />
                  <input
                    id="quantity-kg"
                    type="number"
                    step="0.5"
                    min="0.5"
                    className="form-control"
                    placeholder="e.g. 15.5"
                    value={initialQuantityKg}
                    onChange={(e) => setInitialQuantityKg(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="portions-count">
                  Approximate Portions / Meals Count *
                </label>
                <div className="input-with-icon">
                  <Users size={18} className="input-icon" />
                  <input
                    id="portions-count"
                    type="number"
                    min="1"
                    className="form-control"
                    placeholder="e.g. 45"
                    value={portions}
                    onChange={(e) => setPortions(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="prep-time">
                  Preparation Time / Cooked At
                </label>
                <div className="input-with-icon">
                  <Clock size={18} className="input-icon" />
                  <input
                    id="prep-time"
                    type="datetime-local"
                    className="form-control"
                    value={prepTime}
                    onChange={(e) => setPrepTime(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="pickup-deadline">
                  Pickup Deadline *
                </label>
                <div className="input-with-icon">
                  <Calendar size={18} className="input-icon" />
                  <input
                    id="pickup-deadline"
                    type="datetime-local"
                    className="form-control"
                    value={pickupDeadline}
                    onChange={(e) => setPickupDeadline(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label" htmlFor="storage-cond">
                  Current Storage Condition *
                </label>
                <select
                  id="storage-cond"
                  className="form-control"
                  value={storageCondition}
                  onChange={(e) => setStorageCondition(e.target.value as StorageCondition)}
                  disabled={loading}
                >
                  <option value="room_temp">Room Temperature Chafing Dish</option>
                  <option value="refrigerated">Refrigerated / Chilled (&lt; 4°C)</option>
                  <option value="hot_holding">Hot Holding Cabinet (&gt; 60°C)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="location-address">
                  Pickup Address & Landmark *
                </label>
                <div className="input-with-icon">
                  <MapPin size={18} className="input-icon" />
                  <input
                    id="location-address"
                    type="text"
                    className="form-control"
                    placeholder="Hotel Gate 3, Loading Bay / Kitchen Area"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Description & Packaging */}
          <div className="form-section">
            <h3 className="form-section-title">4. Description & Handling Notes</h3>

            <div className="form-group">
              <label className="form-label" htmlFor="food-desc">
                Description, Ingredients, Packaging Details
              </label>
              <textarea
                id="food-desc"
                className="form-control"
                rows={3}
                placeholder="e.g. Packed in stainless steel containers. Please bring clean transport vessels. No nuts or seafood included."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-actions-bar">
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
              className="btn btn-primary btn-lg"
              disabled={loading}
            >
              {loading ? (
                <span className="spinner-inline">{uploadProgress || 'Saving Listing...'}</span>
              ) : (
                <>
                  <span>Publish Food Listing</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
