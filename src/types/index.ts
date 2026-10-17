export type UserRole = 'donor' | 'requester' | 'waste_partner' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  organizationName: string;
  phone: string;
  address: string;
  createdAt: any;
  updatedAt?: any;
}

export type FoodCategory =
  | 'rice_pulao'
  | 'curries_dal'
  | 'roti_bread'
  | 'snacks_starters'
  | 'sweets_desserts'
  | 'fruits_salad_others'
  | 'cooked_meals'
  | 'bakery'
  | 'raw_produce'
  | 'packaged'
  | 'dairy_desserts'
  | 'beverages'
  | 'other';

export type DietaryType = 'veg' | 'non-veg' | 'vegan';

export type StorageCondition =
  | 'hot_holding'    // Kept Hot
  | 'refrigerated'   // Refrigerated
  | 'room_temp'      // Room Temperature
  | 'other';         // Other

export type FoodCondition =
  | 'suitable'         // Suitable for Donation
  | 'not_suitable'     // Not Suitable for Donation
  | 'requires_review'; // Requires Review

export type WeightUnit = 'kg' | 'g';
export type WeightMeasurementMethod = 'digital_scale' | 'manual_estimate';

export type FoodListingStatus =
  | 'available'
  | 'reserved'
  | 'completed'
  | 'expired'
  | 'overdue'
  | 'transferred_to_waste'
  | 'cancelled';

export interface FoodListing {
  id: string;
  donorId: string;
  donorName: string;
  donorOrg: string;
  donorPhone?: string;
  foodName: string;
  category: FoodCategory;
  dietaryType: DietaryType;
  initialQuantityKg: number;
  remainingQuantityKg: number;
  portions: number;

  // Direct Weight Entry
  recordedWeight?: number;
  weightUnit?: WeightUnit;
  measurementMethod?: WeightMeasurementMethod;

  // Dates & Timestamps
  prepDate?: string;
  prepTime: string;
  pickupDeadline: string;

  location: string;
  pickupInstructions?: string;
  storageCondition: StorageCondition;
  foodCondition?: FoodCondition;
  description: string;
  imageUrl: string;
  status: FoodListingStatus;
  createdAt: any;
  updatedAt?: any;
}

export type FoodRequestStatus =
  | 'pending'
  | 'accepted'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface FoodRequest {
  id: string;
  listingId: string;
  foodName: string;
  donorId: string;
  donorOrg: string;
  donorPhone?: string;
  requesterId: string;
  requesterName: string;
  requesterOrg: string;
  requesterPhone?: string;
  requestedQuantityKg: number;
  requestedPortions: number;
  pickupTimeEstimate: string;
  notes?: string;
  imageUrl?: string;
  location?: string;
  pickupDeadline?: string;
  pickupInstructions?: string;
  category?: FoodCategory;
  status: FoodRequestStatus;
  createdAt: any;
  updatedAt?: any;
}

export type WasteCategory = 'composting' | 'biogas' | 'other_disposal';

export type WasteCollectionStatus =
  | 'pending'
  | 'accepted'
  | 'collected'
  | 'completed';

export interface WasteCollection {
  id: string;
  sourceListingId?: string;
  donorId: string;
  donorOrg: string;
  donorPhone?: string;
  foodName: string;
  category: WasteCategory;
  quantityKg: number;
  location: string;
  destinationFacility: string;
  partnerId?: string;
  partnerName?: string;
  partnerPhone?: string;
  status: WasteCollectionStatus;
  notes?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface ImpactMetrics {
  totalFoodListedKg: number;
  totalFoodPortions: number;
  foodRedistributedKg: number;
  foodRedistributedPortions: number;
  foodRemainingKg: number;
  wasteCompostingKg: number;
  wasteBiogasKg: number;
  totalWasteCollectedKg: number;
  co2eAvoidedKg: number;
  activeListingsCount: number;
  completedTransfersCount: number;
  totalDonorsCount: number;
}
