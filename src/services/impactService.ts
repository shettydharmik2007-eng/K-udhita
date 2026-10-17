import { collection, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import type {
  FoodListing,
  FoodRequest,
  WasteCollection,
  ImpactMetrics,
} from '../types';

export async function fetchLiveImpactMetrics(): Promise<ImpactMetrics> {
  if (!isFirebaseConfigured || !db) {
    return {
      totalFoodListedKg: 0,
      totalFoodPortions: 0,
      foodRedistributedKg: 0,
      foodRedistributedPortions: 0,
      foodRemainingKg: 0,
      wasteCompostingKg: 0,
      wasteBiogasKg: 0,
      totalWasteCollectedKg: 0,
      co2eAvoidedKg: 0,
      activeListingsCount: 0,
      completedTransfersCount: 0,
      totalDonorsCount: 0,
    };
  }

  try {
    const [listingsSnap, requestsSnap, wasteSnap] = await Promise.all([
      getDocs(collection(db, 'foodListings')).catch((err) => {
        console.warn('[Impact Service] foodListings read notice:', err?.message);
        return null;
      }),
      getDocs(collection(db, 'foodRequests')).catch(() => null),
      getDocs(collection(db, 'wasteCollections')).catch(() => null),
    ]);

    const listings = listingsSnap ? listingsSnap.docs.map((d) => d.data() as FoodListing) : [];
    const requests = requestsSnap ? requestsSnap.docs.map((d) => d.data() as FoodRequest) : [];
    const wasteList = wasteSnap ? wasteSnap.docs.map((d) => d.data() as WasteCollection) : [];

    let totalFoodListedKg = 0;
    let totalFoodPortions = 0;
    let foodRemainingKg = 0;
    let activeListingsCount = 0;
    const donorSet = new Set<string>();

    listings.forEach((item) => {
      const initKg = Number(item.initialQuantityKg) || 0;
      const remKg = Number(item.remainingQuantityKg) || 0;
      totalFoodListedKg += initKg;
      totalFoodPortions += Number(item.portions) || 0;

      if (item.status === 'available' || item.status === 'reserved') {
        foodRemainingKg += remKg;
        activeListingsCount++;
      }
      if (item.donorId) {
        donorSet.add(item.donorId);
      }
    });

    let foodRedistributedKg = 0;
    let foodRedistributedPortions = 0;
    let completedRequestsCount = 0;

    requests.forEach((req) => {
      if (req.status === 'completed' || req.status === 'accepted') {
        foodRedistributedKg += Number(req.requestedQuantityKg) || 0;
        foodRedistributedPortions += Number(req.requestedPortions) || 0;
        if (req.status === 'completed') {
          completedRequestsCount++;
        }
      }
    });

    let wasteCompostingKg = 0;
    let wasteBiogasKg = 0;
    let completedWasteCount = 0;

    wasteList.forEach((w) => {
      const qty = Number(w.quantityKg) || 0;
      if (w.category === 'composting') {
        wasteCompostingKg += qty;
      } else if (w.category === 'biogas') {
        wasteBiogasKg += qty;
      }
      if (w.status === 'completed' || w.status === 'collected') {
        completedWasteCount++;
      }
    });

    const totalWasteCollectedKg = wasteCompostingKg + wasteBiogasKg;
    // Standard greenhouse gas conversion factor:
    // Approximately 2.5 kg CO2e is mitigated per 1 kg of food surplus / organic waste diverted from municipal landfills (EPA WARM model / UNEP Food Waste Index).
    const totalDivertedKg = foodRedistributedKg + totalWasteCollectedKg;
    const co2eAvoidedKg = Math.round(totalDivertedKg * 2.5 * 10) / 10;

    return {
      totalFoodListedKg: Math.round(totalFoodListedKg * 10) / 10,
      totalFoodPortions,
      foodRedistributedKg: Math.round(foodRedistributedKg * 10) / 10,
      foodRedistributedPortions,
      foodRemainingKg: Math.round(foodRemainingKg * 10) / 10,
      wasteCompostingKg: Math.round(wasteCompostingKg * 10) / 10,
      wasteBiogasKg: Math.round(wasteBiogasKg * 10) / 10,
      totalWasteCollectedKg: Math.round(totalWasteCollectedKg * 10) / 10,
      co2eAvoidedKg,
      activeListingsCount,
      completedTransfersCount: completedRequestsCount + completedWasteCount,
      totalDonorsCount: donorSet.size,
    };
  } catch (err) {
    console.error('Error computing live impact metrics from Firestore:', err);
    throw err;
  }
}
