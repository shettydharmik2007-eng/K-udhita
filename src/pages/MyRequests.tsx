import React from 'react';
import { NgoDashboard } from './NgoDashboard';

interface Props {
  onNavigate: (page: string) => void;
}

// Seamlessly re-export NgoDashboard so existing routes and imports retain full compatibility
export const MyRequests: React.FC<Props> = (props) => {
  return <NgoDashboard {...props} />;
};

export default MyRequests;
