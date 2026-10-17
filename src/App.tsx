import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { FirebaseAlertBanner } from './components/common/FirebaseAlertBanner';

// Pages
import { Home } from './pages/Home';
import { AvailableFood } from './pages/AvailableFood';
import { WasteManagement } from './pages/WasteManagement';
import { ImpactDashboard } from './pages/ImpactDashboard';
import { HotelDashboard } from './pages/HotelDashboard';
import { AddFoodListing } from './pages/AddFoodListing';
import { EditFoodListing } from './pages/EditFoodListing';
import { MyRequests } from './pages/MyRequests';
import { NgoDashboard } from './pages/NgoDashboard';
import { PartnerDashboard } from './pages/PartnerDashboard';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { FirebaseSetupGuide } from './pages/FirebaseSetupGuide';

export function AppContent() {
  const [currentPage, setCurrentPage] = useState<string>(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || 'home';
  });

  const [editListingId, setEditListingId] = useState<string | null>(null);

  // Sync hash with current page
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== currentPage) {
        if (hash.startsWith('edit-food/')) {
          setEditListingId(hash.replace('edit-food/', ''));
          setCurrentPage('edit-food');
        } else {
          setCurrentPage(hash);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentPage]);

  const navigateTo = (page: string, params?: { listingId?: string }) => {
    if (page === 'edit-food' && params?.listingId) {
      setEditListingId(params.listingId);
      window.location.hash = `edit-food/${params.listingId}`;
    } else {
      window.location.hash = page;
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditListing = (listingId: string) => {
    navigateTo('edit-food', { listingId });
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onNavigate={navigateTo} />;
      case 'available-food':
        return <AvailableFood onNavigate={navigateTo} />;
      case 'waste-management':
        return <WasteManagement onNavigate={navigateTo} />;
      case 'impact':
        return <ImpactDashboard onNavigate={navigateTo} />;
      case 'hotel-dashboard':
        return (
          <HotelDashboard
            onNavigate={navigateTo}
            onEditListing={handleEditListing}
          />
        );
      case 'add-food':
        return <AddFoodListing onNavigate={navigateTo} />;
      case 'edit-food':
        return editListingId ? (
          <EditFoodListing
            listingId={editListingId}
            onNavigate={navigateTo}
          />
        ) : (
          <HotelDashboard
            onNavigate={navigateTo}
            onEditListing={handleEditListing}
          />
        );
      case 'my-requests':
      case 'ngo-dashboard':
        return <NgoDashboard onNavigate={navigateTo} />;
      case 'partner-dashboard':
        return <PartnerDashboard onNavigate={navigateTo} />;
      case 'login':
        return <Login onNavigate={navigateTo} />;
      case 'signup':
        return <SignUp onNavigate={navigateTo} />;
      case 'setup-guide':
        return <FirebaseSetupGuide />;
      default:
        return <Home onNavigate={navigateTo} />;
    }
  };

  return (
    <>
      <FirebaseAlertBanner onOpenSetupGuide={() => navigateTo('setup-guide')} />
      <Navbar currentPage={currentPage} onNavigate={navigateTo} />
      <main className="main-content-wrapper">{renderPage()}</main>
      <Footer onNavigate={navigateTo} />
    </>
  );
}

export function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
