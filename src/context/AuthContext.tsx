import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../services/firebase';
import { getUserProfile, signOutUser } from '../services/authService';
import type { UserProfile, UserRole } from '../types';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  role: UserRole | null;
  isDonor: boolean;
  isRequester: boolean;
  isWastePartner: boolean;
  isAdmin: boolean;
  refreshProfile: (knownProfile?: UserProfile) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(() => isFirebaseConfigured && !!auth);

  const fetchProfile = async (uid: string) => {
    try {
      const profile = await getUserProfile(uid);
      setUserProfile(profile);
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await fetchProfile(user.uid);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async (knownProfile?: UserProfile) => {
    if (knownProfile) {
      setUserProfile(knownProfile);
      if (auth?.currentUser) {
        setCurrentUser(auth.currentUser);
      }
      return;
    }
    const targetUid = currentUser?.uid || auth?.currentUser?.uid;
    if (targetUid) {
      await fetchProfile(targetUid);
    }
  };

  const logout = async () => {
    await signOutUser();
    setCurrentUser(null);
    setUserProfile(null);
  };

  const role = userProfile?.role || null;
  const isAdmin = role === 'admin';
  const isDonor = role === 'donor' || isAdmin;
  const isRequester = role === 'requester' || isAdmin;
  const isWastePartner = role === 'waste_partner' || isAdmin;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        isAuthenticated: !!currentUser,
        role,
        isDonor,
        isRequester,
        isWastePartner,
        isAdmin,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// oxlint-disable-next-line react/only-export-components
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
