import React, { useState } from 'react';
import { isFirebaseConfigured, getMissingEnvVars } from '../services/firebase';
import {
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Flame,
  Database,
  Lock,
  HardDrive,
  RefreshCw,
} from 'lucide-react';

export const FirebaseSetupGuide: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const missingVars = getMissingEnvVars();

  const envTemplate = `# Firebase Web Configuration for Kṣudhita
VITE_FIREBASE_API_KEY=your_actual_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(envTemplate);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-badge">
          <Flame size={16} className="text-orange" />
          <span>Cloud Infrastructure</span>
        </div>
        <h1 className="page-title">Firebase Console Setup Guide</h1>
        <p className="page-subtitle">
          Connect your live Google Cloud Firebase project for persistent authentication, Firestore NoSQL
          storage, and cloud food image uploads.
        </p>
      </div>

      {/* Current Status Box */}
      <div className={`status-overview-card ${isFirebaseConfigured ? 'status-connected' : 'status-pending'}`}>
        <div className="status-card-header">
          {isFirebaseConfigured ? (
            <div className="status-indicator-badge success">
              <ShieldCheck size={20} />
              <span>Firebase is Fully Connected</span>
            </div>
          ) : (
            <div className="status-indicator-badge warning">
              <AlertTriangle size={20} />
              <span>Firebase Not Configured – Configuration Required</span>
            </div>
          )}
        </div>

        <div className="status-card-body">
          {isFirebaseConfigured ? (
            <p>
              Your web application is actively connected to Cloud Firestore, Firebase Authentication,
              and Firebase Storage. All operations write to live Google Cloud servers.
            </p>
          ) : (
            <div>
              <p>
                The application detected missing or default placeholder environment variables in your{' '}
                <code>.env</code> file. To store listings, authenticate users, and track waste, follow the
                steps below.
              </p>
              <div className="missing-vars-tag-list">
                <strong>Missing Variables:</strong>
                {missingVars.map((v) => (
                  <span key={v} className="badge-missing">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step by Step Instructions */}
      <div className="setup-steps-container">
        <h2 className="section-title">Step-by-Step Firebase Console Instructions</h2>

        <div className="setup-step-card">
          <div className="step-number">1</div>
          <div className="step-content">
            <h3>Create a Firebase Project</h3>
            <p>
              Navigate to the{' '}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-link"
              >
                Firebase Console <ExternalLink size={14} />
              </a>{' '}
              and click <strong>Add project</strong>. Enter a project name like <code>foodshare-system</code>.
              You can disable Google Analytics for this academic demo if desired, then click <strong>Create project</strong>.
            </p>
          </div>
        </div>

        <div className="setup-step-card">
          <div className="step-number">2</div>
          <div className="step-content">
            <h3>Register Web Application</h3>
            <p>
              In your Firebase project overview, click the <strong>Web (<code>&lt;/&gt;</code>)</strong> icon to register a web app.
              Name it <code>FoodShare Web</code>. Copy the <code>firebaseConfig</code> keys into your local <code>.env</code> file.
            </p>
          </div>
        </div>

        <div className="setup-step-card">
          <div className="step-number">3</div>
          <div className="step-content">
            <div className="step-title-with-icon">
              <Lock size={18} className="text-emerald" />
              <h3>Enable Firebase Authentication</h3>
            </div>
            <p>
              Go to <strong>Build → Authentication → Get Started</strong>. Under the <strong>Sign-in method</strong> tab,
              select <strong>Email/Password</strong>, toggle <strong>Enable</strong>, and click <strong>Save</strong>.
            </p>
          </div>
        </div>

        <div className="setup-step-card">
          <div className="step-number">4</div>
          <div className="step-content">
            <div className="step-title-with-icon">
              <Database size={18} className="text-emerald" />
              <h3>Enable Cloud Firestore Database</h3>
            </div>
            <p>
              Go to <strong>Build → Firestore Database → Create database</strong>. Choose a nearby region
              (e.g., <code>asia-south1</code> or <code>us-central1</code>). Select <strong>Start in test mode</strong> for rapid testing,
              or deploy the production rules defined in <code>firestore.rules</code>. Click <strong>Create</strong>.
            </p>
          </div>
        </div>

        <div className="setup-step-card">
          <div className="step-number">5</div>
          <div className="step-content">
            <div className="step-title-with-icon">
              <HardDrive size={18} className="text-emerald" />
              <h3>Enable Firebase Storage</h3>
            </div>
            <p>
              Go to <strong>Build → Storage → Get Started</strong>. Select <strong>Start in test mode</strong> (or apply
              the provided <code>storage.rules</code>) and click <strong>Done</strong>. This enables camera and photo uploads for leftover food items.
            </p>
          </div>
        </div>

        <div className="setup-step-card">
          <div className="step-number">6</div>
          <div className="step-content">
            <h3>Update Your Local <code>.env</code> File</h3>
            <p>
              Paste your copied keys into the <code>.env</code> file in the project root directory, then restart the Vite dev server:
            </p>
            <div className="code-block-wrapper">
              <div className="code-block-header">
                <span>.env</span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={copyToClipboard}
                >
                  {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied Template!' : 'Copy Template'}</span>
                </button>
              </div>
              <pre className="code-block">{envTemplate}</pre>
            </div>
          </div>
        </div>
      </div>

      <div className="setup-restart-notice">
        <RefreshCw size={18} className="text-primary" />
        <div>
          <strong>After saving .env:</strong>
          <p>
            Restart your local development server with <code>npm run dev</code> for Vite to pick up the updated environment variables.
          </p>
        </div>
      </div>
    </div>
  );
};
