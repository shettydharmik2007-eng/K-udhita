import React from 'react';
import type { FoodListingStatus, FoodRequestStatus, WasteCollectionStatus } from '../../types';

interface Props {
  status: FoodListingStatus | FoodRequestStatus | WasteCollectionStatus | string;
  type?: 'listing' | 'request' | 'waste';
}

export const StatusBadge: React.FC<Props> = ({ status, type: _type = 'listing' }) => {
  const getBadgeClass = () => {
    switch (status) {
      case 'available':
        return 'badge-success';
      case 'reserved':
        return 'badge-warning';
      case 'completed':
        return 'badge-primary';
      case 'expired':
      case 'overdue':
        return 'badge-danger';
      case 'transferred_to_waste':
        return 'badge-waste';
      case 'pending':
        return 'badge-warning';
      case 'collection_requested':
        return 'badge-warning';
      case 'accepted':
        return 'badge-info';
      case 'collected':
        return 'badge-secondary';
      case 'processing':
        return 'badge-info';
      case 'processed':
        return 'badge-success';
      case 'rejected':
      case 'cancelled':
        return 'badge-danger';
      case 'suitable':
        return 'badge-success';
      case 'not_suitable':
        return 'badge-danger';
      case 'requires_review':
        return 'badge-warning';
      default:
        return 'badge-neutral';
    }
  };

  const getLabel = () => {
    switch (status) {
      case 'available':
        return 'Available Now';
      case 'reserved':
        return 'Fully Reserved';
      case 'completed':
        return 'Completed';
      case 'expired':
        return 'Expired';
      case 'overdue':
        return 'Overdue (Review Required)';
      case 'transferred_to_waste':
        return 'Routed to Waste';
      case 'pending':
        return 'Available for Pickup';
      case 'collection_requested':
        return 'Collection Requested';
      case 'accepted':
        return 'Accepted / Scheduled';
      case 'collected':
        return 'Collected';
      case 'processing':
        return 'In Processing';
      case 'processed':
        return 'Processed & Repurposed';
      case 'rejected':
        return 'Declined';
      case 'cancelled':
        return 'Cancelled';
      case 'suitable':
        return 'Suitable for Donation';
      case 'not_suitable':
        return 'Not Suitable for Donation';
      case 'requires_review':
        return 'Requires Review';
      default:
        return status;
    }
  };

  return <span className={`status-badge ${getBadgeClass()}`}>{getLabel()}</span>;
};
