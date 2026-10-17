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
}

export type FoodCategory =
  | 'cooked_meals'
  | 'bakery'
  | 'raw_produce'
  | 'packaged'
  | 'dairy_desserts'
  | 'beverages'
  | 'other';

export type DietaryType = 'veg' | 'non-veg' | 'vegan';

export type StorageCondition = 'refrigerated' | 'hot_holding' | 'room_temp';

export type FoodListingStatus =
  | 'available'
  | 'reserved'
  | 'completed'
  | 'expired'
  | 'transferred_to_waste';

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
  prepTime: string;
  pickupDeadline: string;
  location: string;
  storageCondition: StorageCondition;
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
  requesterId: string;
  requesterName: string;
  requesterOrg: string;
  requesterPhone?: string;
  requestedQuantityKg: number;
  requestedPortions: number;
  pickupTimeEstimate: string;
  notes?: string;
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
