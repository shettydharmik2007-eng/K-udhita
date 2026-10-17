import React from 'react';
import type { FoodListingStatus, FoodRequestStatus, WasteCollectionStatus } from '../../types';

interface Props {
  status: FoodListingStatus | FoodRequestStatus | WasteCollectionStatus | string;
  type?: 'listing' | 'request' | 'waste';
}

export const StatusBadge: React.FC<Props> = ({ status, type = 'listing' }) => {
  const getBadgeClass = () => {
    switch (status) {
      case 'available':
        return 'badge-success';
      case 'reserved':
        return 'badge-warning';
      case 'completed':
        return 'badge-primary';
      case 'expired':
        return 'badge-danger';
      case 'transferred_to_waste':
        return 'badge-waste';
      case 'pending':
        return 'badge-warning';
      case 'accepted':
        return 'badge-info';
      case 'collected':
        return 'badge-secondary';
      case 'rejected':
      case 'cancelled':
        return 'badge-danger';
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
      case 'transferred_to_waste':
        return 'Routed to Waste';
      case 'pending':
        return 'Pending Review';
      case 'accepted':
        return 'Accepted / Scheduled';
      case 'collected':
        return 'Collected';
      case 'rejected':
        return 'Declined';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  return <span className={`status-badge ${getBadgeClass()}`}>{getLabel()}</span>;
};
