import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFoodListings } from '../services/foodService';
import { fetchLiveImpactMetrics } from '../services/impactService';
import { isFirebaseConfigured } from '../services/firebase';
import type { FoodListing, ImpactMetrics } from '../types';
import {
  Utensils,
  Leaf,
  Sparkles,
  ArrowRight,
  Scale,
  Users,
  Globe2,
  Recycle,
  ShieldCheck,
  Building2,
  Heart,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const Home: React.FC<Props> = ({ onNavigate }) => {
  const { isAuthenticated, userProfile, isDonor, isRequester, isWastePartner } = useAuth();
  const [recentListings, setRecentListings] = useState<FoodListing[]>([]);
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);

  useEffect(() => {
    if (isFirebaseConfigured) {
      getFoodListings({ status: 'available' })
        .then((items) => setRecentListings(items.slice(0, 3)))
        .catch((err) => console.warn('Could not load recent listings:', err));

      fetchLiveImpactMetrics()
        .then((m) => setMetrics(m))
        .catch((err) => console.warn('Could not load impact metrics:', err));
    }
  }, []);

  const getDashboardDestination = () => {
    if (isDonor) return 'hotel-dashboard';
    if (isRequester) return 'my-requests';
    if (isWastePartner) return 'partner-dashboard';
    return 'available-food';
  };

  return (
    <div className="home-wrapper">
      {/* Hero Section with Fluid Motions */}
      <section className="hero-section">
        <div className="container hero-container">
          <div className="hero-content animate-fade-in-up">
            <div className="hero-badge animate-pulse-glow">
              <Sparkles size={16} className="text-emerald" />
              <span>UN SDGs 2, 12 & 13 Aligned • Zero Waste Initiative</span>
            </div>

            <h1 className="hero-title">
              Nourishing Communities, <br />
              <span className="highlight-text">Ending Food Waste with Kṣudhita</span>
            </h1>

            <p className="hero-description">
              <strong>Kṣudhita</strong> bridges the gap between commercial surplus hospitality and community hunger relief.
              We ensure fresh, edible meals reach shelters promptly, while redirecting all post-window leftovers
              into certified bio-methane clean fuel and nutrient-rich compost.
            </p>

            <div className="hero-cta-group">
              {isAuthenticated ? (
                <button
                  type="button"
                  className="btn btn-primary btn-lg btn-motion"
                  onClick={() => onNavigate(getDashboardDestination())}
                >
                  <span>Open My {userProfile?.role === 'donor' ? 'Hotel' : userProfile?.role === 'waste_partner' ? 'Recycler' : 'Trust'} Portal</span>
                  <ArrowRight size={18} />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-lg btn-motion"
                    onClick={() => onNavigate('signup')}
                  >
                    <span>Get Started • Join Kṣudhita</span>
                    <ArrowRight size={18} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-lg btn-motion"
                    onClick={() => onNavigate('available-food')}
                  >
                    <Utensils size={18} />
                    <span>Browse Available Food</span>
                  </button>
                </>
              )}
            </div>

            {/* Quick Live Counters */}
            <div className="hero-quick-stats">
              <div className="quick-stat-item">
                <strong className="stat-counter">{metrics ? `${metrics.foodRedistributedKg} kg` : '0 kg'}</strong>
                <span>Meals Redistributed</span>
              </div>
              <div className="quick-stat-divider" />
              <div className="quick-stat-item">
                <strong className="stat-counter">{metrics ? `${metrics.totalWasteCollectedKg} kg` : '0 kg'}</strong>
                <span>Organic Leftovers Diverted</span>
              </div>
              <div className="quick-stat-divider" />
              <div className="quick-stat-item">
                <strong className="stat-counter">{metrics ? `${metrics.co2eAvoidedKg} kg` : '0 kg'}</strong>
                <span>CO₂e Greenhouse Mitigation</span>
              </div>
            </div>
          </div>

          {/* Interactive Circular Loop Card */}
          <div className="hero-visual animate-fade-in-right">
            <div className="circular-loop-card card-glass">
              <div className="loop-center-circle">
                <Leaf size={34} className="text-emerald animate-bounce-soft" />
                <span className="loop-brand">Kṣudhita</span>
                <small className="loop-caption">Circular Food & Bio-Energy Loop</small>
              </div>

              <div className="loop-node node-hotel">
                <div className="node-step-badge">1</div>
                <div>
                  <strong>Surplus Food Logged</strong>
                  <p>Buffet & banquet items listed before expiry</p>
                </div>
              </div>

              <div className="loop-node node-ngo">
                <div className="node-step-badge">2</div>
                <div>
                  <strong>Equitable Redistribution</strong>
                  <p>Claimed by verified trusts & hunger charities</p>
                </div>
              </div>

              <div className="loop-node node-waste">
                <div className="node-step-badge">3</div>
                <div>
                  <strong>Organic Resource Recovery</strong>
                  <p>Leftovers routed to composting & biogas energy</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How Kṣudhita Works (The Circular Flow) */}
      <section className="section-workflow">
        <div className="container">
          <div className="section-title-wrap text-center">
            <span className="badge-subtitle">THE SYSTEM IN ACTION</span>
            <h2 className="section-title">How Kṣudhita Closes the Food Loop</h2>
            <p className="section-desc max-w-xl mx-auto">
              A streamlined, accountable process designed for speed, safety, and verifiable climate impact.
            </p>
          </div>

          <div className="workflow-steps-grid mt-8">
            <div className="workflow-step-card animate-hover-lift">
              <div className="workflow-number-bubble">01</div>
              <div className="workflow-icon bg-emerald-light text-emerald">
                <Building2 size={24} />
              </div>
              <h3>Surplus Meals Registered</h3>
              <p>
                Hotels and banquet halls document unserved dishes using phone cameras or photo uploads with precise portion counts and pickup windows.
              </p>
            </div>

            <div className="workflow-step-card animate-hover-lift">
              <div className="workflow-number-bubble">02</div>
              <div className="workflow-icon bg-blue-light text-blue">
                <Users size={24} />
              </div>
              <h3>Safe Community Claims</h3>
              <p>
                Community trusts and shelters view live listings and reserve quantities with atomic database protection to prevent excess claiming.
              </p>
            </div>

            <div className="workflow-step-card animate-hover-lift">
              <div className="workflow-number-bubble">03</div>
              <div className="workflow-icon bg-orange-light text-orange">
                <Recycle size={24} />
              </div>
              <h3>Organic Waste Diverted</h3>
              <p>
                Post-window leftovers and unconsumed food are collected by certified partners for aerobic composting and bio-methane fuel production.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sustainable Development Goals Showcase */}
      <section className="section-sdgs">
        <div className="container">
          <div className="sdg-showcase-box">
            <div className="sdg-showcase-header">
              <span className="badge-sdg-tag">ACADEMIC CAPSTONE INITIATIVE</span>
              <h2>Rooted in United Nations Global Goals</h2>
              <p>
                Kṣudhita translates international sustainability mandates into measurable, localized daily operations.
              </p>
            </div>

            <div className="sdg-triad-grid">
              <div className="sdg-triad-item sdg-item-2 animate-hover-lift">
                <div className="sdg-item-number">SDG 2</div>
                <h3>Zero Hunger</h3>
                <p>
                  Target 2.1: Ensuring access to nutritious, hygienic meals for shelters and children through swift commercial redistribution.
                </p>
              </div>

              <div className="sdg-triad-item sdg-item-12 animate-hover-lift">
                <div className="sdg-item-number">SDG 12</div>
                <h3>Responsible Consumption</h3>
                <p>
                  Target 12.3: Substantially cutting per-capita hospitality food waste across banquet venues, kitchens, and events.
                </p>
              </div>

              <div className="sdg-triad-item sdg-item-13 animate-hover-lift">
                <div className="sdg-item-number">SDG 13</div>
                <h3>Climate Action</h3>
                <p>
                  Preventing anaerobic landfill decay directly halts fugitive methane (CH₄) emissions with audited circular transfer tracking.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Listings Preview */}
      {recentListings.length > 0 && (
        <section className="section-recent-listings">
          <div className="container">
            <div className="section-header-flex">
              <div>
                <h2 className="section-title">Fresh Surplus Available Now</h2>
                <p className="section-desc">Active listings awaiting immediate collection by trusts and relief teams.</p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-motion"
                onClick={() => onNavigate('available-food')}
              >
                <span>View Full Marketplace</span>
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="listings-grid mt-6">
              {recentListings.map((item) => (
                <div key={item.id} className="food-marketplace-card animate-hover-lift">
                  <div className="food-card-media">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.foodName}
                        className="food-card-img"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const ph = e.currentTarget.parentElement?.querySelector('.food-card-placeholder');
                          if (ph) (ph as HTMLElement).style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className="food-card-placeholder"
                      style={{ display: item.imageUrl ? 'none' : 'flex' }}
                    >
                      <Utensils size={36} />
                      <span>{item.category.replace('_', ' ')}</span>
                    </div>
                    <div className="food-card-tags">
                      <span className={`tag-dietary ${item.dietaryType}`}>
                        {item.dietaryType.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="food-card-content">
                    <div className="donor-org-header">
                      <Building2 size={14} className="text-emerald" />
                      <span className="donor-org-name">{item.donorOrg}</span>
                    </div>
                    <h3 className="food-card-title">{item.foodName}</h3>
                    <div className="food-specs-grid">
                      <div className="food-spec-item">
                        <Scale size={14} />
                        <div>
                          <strong>{item.remainingQuantityKg} kg</strong>
                          <small>Available</small>
                        </div>
                      </div>
                      <div className="food-spec-item">
                        <Users size={14} />
                        <div>
                          <strong>~{item.portions}</strong>
                          <small>Portions</small>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-block mt-4"
                      onClick={() => onNavigate('available-food')}
                    >
                      <span>Claim Food</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Call To Action Box */}
      <section className="section-cta-bottom">
        <div className="container">
          <div className="cta-banner-card card-gradient">
            <div className="cta-content">
              <h2>Join the Kṣudhita Network Today</h2>
              <p>
                Whether you run a banquet kitchen, operate a community food shelter, or manage organic waste recovery,
                your participation makes zero-waste hunger relief possible.
              </p>
              <div className="cta-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-lg btn-motion"
                  onClick={() => onNavigate('signup')}
                >
                  <span>Register Free Account</span>
                  <ArrowRight size={18} />
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-lg btn-motion"
                  onClick={() => onNavigate('login')}
                >
                  <span>Sign In to Existing Account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
