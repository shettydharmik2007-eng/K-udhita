import React from 'react';
import { Leaf, Award } from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const Footer: React.FC<Props> = ({ onNavigate }) => {
  return (
    <footer className="footer-wrapper">
      {/* SDG Highlights Banner */}
      <div className="sdg-banner-section">
        <div className="container">
          <div className="sdg-banner-grid">
            <div className="sdg-card sdg-2 animate-hover-lift">
              <div className="sdg-number">SDG 2</div>
              <div className="sdg-content">
                <h4>Zero Hunger</h4>
                <p>Redirecting commercial hospitality surplus to trusts, shelters & child nutrition centers.</p>
              </div>
            </div>
            <div className="sdg-card sdg-12 animate-hover-lift">
              <div className="sdg-number">SDG 12</div>
              <div className="sdg-content">
                <h4>Responsible Consumption</h4>
                <p>Target 12.3: Cutting per-capita hospitality food waste across banquet venues & kitchens.</p>
              </div>
            </div>
            <div className="sdg-card sdg-13 animate-hover-lift">
              <div className="sdg-number">SDG 13</div>
              <div className="sdg-content">
                <h4>Climate Action</h4>
                <p>Abating methane greenhouse gas emissions by routing all leftover food to composting & biogas.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="footer-main">
        <div className="container footer-grid">
          <div className="footer-col brand-col">
            <div className="footer-logo">
              <Leaf size={22} className="text-emerald" />
              <span>Kṣudhita</span>
            </div>
            <p className="footer-desc">
              Food Redistribution and Organic Waste Management System. Connecting banquet halls, hotels,
              community trusts, and organic recycling facilities to eliminate hunger and landfill waste.
            </p>
            <div className="footer-disclaimer">
              <small>
                <strong>Academic Notice:</strong> Kṣudhita tracks and verifies material transfers to certified
                facilities (compost yards and biogas plants) and avoids fabricated production claims.
              </small>
            </div>
          </div>

          <div className="footer-col">
            <h5>Navigation</h5>
            <ul className="footer-links">
              <li><button type="button" onClick={() => onNavigate('home')}>Home</button></li>
              <li><button type="button" onClick={() => onNavigate('available-food')}>Available Food Marketplace</button></li>
              <li><button type="button" onClick={() => onNavigate('waste-management')}>Organic Waste Loop</button></li>
              <li><button type="button" onClick={() => onNavigate('impact')}>Sustainability Impact</button></li>
              <li><button type="button" onClick={() => onNavigate('setup-guide')}>Firebase Setup Guide</button></li>
            </ul>
          </div>

          <div className="footer-col">
            <h5>User Panels</h5>
            <ul className="footer-links">
              <li><button type="button" onClick={() => onNavigate('hotel-dashboard')}>Hotel & Banquet Panel</button></li>
              <li><button type="button" onClick={() => onNavigate('my-requests')}>Trust & NGO Panel</button></li>
              <li><button type="button" onClick={() => onNavigate('partner-dashboard')}>Recycler Logistics Panel</button></li>
              <li><button type="button" onClick={() => onNavigate('add-food')}>Post Surplus Food</button></li>
              <li><button type="button" onClick={() => onNavigate('signup')}>Register Account</button></li>
            </ul>
          </div>

          <div className="footer-col">
            <h5>College Project</h5>
            <div className="college-info-card">
              <Award size={18} className="text-emerald" />
              <div>
                <strong>Capstone Engineering Project</strong>
                <p>Sustainable Tech & Cloud Circular Economy</p>
              </div>
            </div>
            <p className="footer-tech-stack">
              Built with React, TypeScript, Vite, Firebase Authentication, Cloud Firestore, and Firebase Storage.
            </p>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="container footer-bottom-flex">
            <p>© {new Date().getFullYear()} Kṣudhita System – College Capstone Project. Aligned with UN SDGs.</p>
            <div className="footer-badges">
              <span className="pill-badge">SDG 2 Zero Hunger</span>
              <span className="pill-badge">SDG 12 Circular Loop</span>
              <span className="pill-badge">SDG 13 Climate Action</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
