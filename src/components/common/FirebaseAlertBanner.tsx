import React from 'react';
import { isFirebaseConfigured, getMissingEnvVars } from '../../services/firebase';
import { AlertTriangle, KeyRound } from 'lucide-react';

interface Props {
  onOpenSetupGuide: () => void;
}

export const FirebaseAlertBanner: React.FC<Props> = ({ onOpenSetupGuide }) => {
  if (isFirebaseConfigured) return null;

  const missing = getMissingEnvVars();

  return (
    <div className="firebase-banner" role="alert">
      <div className="firebase-banner-inner">
        <div className="firebase-banner-icon">
          <AlertTriangle size={20} />
        </div>
        <div className="firebase-banner-text">
          <strong>Firebase Project Not Configured:</strong>
          <span>
            {' '}Database and storage features require Firebase credentials in <code>.env</code> ({missing.length} keys missing).
            No simulated data is substituted.
          </span>
        </div>
        <div className="firebase-banner-actions">
          <button
            type="button"
            className="btn btn-sm btn-warning"
            onClick={onOpenSetupGuide}
          >
            <KeyRound size={14} />
            Setup Instructions
          </button>
        </div>
      </div>
    </div>
  );
};
