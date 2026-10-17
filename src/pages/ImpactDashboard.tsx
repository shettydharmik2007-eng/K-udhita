import React, { useState, useEffect } from 'react';
import { fetchLiveImpactMetrics } from '../services/impactService';
import { isFirebaseConfigured } from '../services/firebase';
import type { ImpactMetrics } from '../types';
import {
  BarChart3,
  Scale,
  Users,
  Leaf,
  Flame,
  Globe2,
  RefreshCw,
  Award,
  ShieldCheck,
  AlertTriangle,
  Building2,
  TrendingUp,
  PieChart,
} from 'lucide-react';

interface Props {
  onNavigate: (page: string) => void;
}

export const ImpactDashboard: React.FC<Props> = ({ onNavigate }) => {
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await fetchLiveImpactMetrics();
      setMetrics(data);
    } catch (err: any) {
      console.error('Failed to calculate impact metrics:', err);
      setError(err.message || 'Could not fetch database records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const totalDivertedKg = metrics
    ? metrics.foodRedistributedKg + metrics.totalWasteCollectedKg
    : 0;

  // Donut chart angles
  const redistributedPct =
    metrics && totalDivertedKg > 0
      ? Math.round((metrics.foodRedistributedKg / totalDivertedKg) * 100)
      : 0;

  const compostPct =
    metrics && totalDivertedKg > 0
      ? Math.round((metrics.wasteCompostingKg / totalDivertedKg) * 100)
      : 0;

  const biogasPct =
    metrics && totalDivertedKg > 0
      ? Math.round((metrics.wasteBiogasKg / totalDivertedKg) * 100)
      : 0;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="dashboard-header-flex">
        <div>
          <div className="page-header-badge">
            <BarChart3 size={16} className="text-emerald" />
            <span>Sustainability Telemetry</span>
          </div>
          <h1 className="page-title">Sustainability Impact Dashboard</h1>
          <p className="page-subtitle">
            Auditable metrics calculated in real-time from active Cloud Firestore collections:
            food redistributed, meals saved, and organic waste redirected from landfills.
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setRefreshing(true);
              loadMetrics();
            }}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'spin-icon' : ''} />
            <span>Recalculate Metrics</span>
          </button>
        </div>
      </div>

      {!isFirebaseConfigured && (
        <div className="alert alert-warning mb-6">
          <AlertTriangle size={20} />
          <div>
            <strong>Firestore Not Connected:</strong>
            <p>
              In accordance with academic standards, this dashboard does not simulate artificial database numbers.
              Configure your Firebase project in <code>.env</code> to start accumulating live data.
            </p>
            <button
              type="button"
              className="btn btn-sm btn-outline mt-2"
              onClick={() => onNavigate('setup-guide')}
            >
              View Setup Instructions
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-danger mb-6">
          <AlertTriangle size={18} />
          <span>Error reading database records: {error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16">
          <div className="spinner-large" />
          <p className="mt-4 text-muted">Aggregating live collection records from Cloud Firestore...</p>
        </div>
      ) : (
        <>
          {/* Main 5 Metric Cards */}
          <div className="impact-kpi-grid">
            {/* 1. Total Food Listed */}
            <div className="kpi-card">
              <div className="kpi-icon-wrap bg-blue-light text-blue">
                <Scale size={24} />
              </div>
              <div className="kpi-data">
                <span className="kpi-label">Total Food Listed</span>
                <span className="kpi-number">
                  {metrics?.totalFoodListedKg ?? 0} <span className="kpi-unit">kg</span>
                </span>
                <span className="kpi-sub">
                  ~{metrics?.totalFoodPortions ?? 0} estimated portions
                </span>
              </div>
            </div>

            {/* 2. Food Successfully Redistributed */}
            <div className="kpi-card highlight-green">
              <div className="kpi-icon-wrap bg-emerald-light text-emerald">
                <Users size={24} />
              </div>
              <div className="kpi-data">
                <span className="kpi-label">Food Redistributed</span>
                <span className="kpi-number">
                  {metrics?.foodRedistributedKg ?? 0} <span className="kpi-unit">kg</span>
                </span>
                <span className="kpi-sub">
                  ~{metrics?.foodRedistributedPortions ?? 0} meals served (SDG 2)
                </span>
              </div>
            </div>

            {/* 3. Food Remaining */}
            <div className="kpi-card">
              <div className="kpi-icon-wrap bg-amber-light text-amber">
                <Scale size={24} />
              </div>
              <div className="kpi-data">
                <span className="kpi-label">Food Remaining</span>
                <span className="kpi-number">
                  {metrics?.foodRemainingKg ?? 0} <span className="kpi-unit">kg</span>
                </span>
                <span className="kpi-sub">
                  {metrics?.activeListingsCount ?? 0} active listings awaiting claim
                </span>
              </div>
            </div>

            {/* 4. Organic Waste: Composting */}
            <div className="kpi-card">
              <div className="kpi-icon-wrap bg-lime-light text-lime">
                <Leaf size={24} />
              </div>
              <div className="kpi-data">
                <span className="kpi-label">Collected for Composting</span>
                <span className="kpi-number">
                  {metrics?.wasteCompostingKg ?? 0} <span className="kpi-unit">kg</span>
                </span>
                <span className="kpi-sub">
                  Aerobic nutrient return to soil
                </span>
              </div>
            </div>

            {/* 5. Organic Waste: Biogas */}
            <div className="kpi-card">
              <div className="kpi-icon-wrap bg-orange-light text-orange">
                <Flame size={24} />
              </div>
              <div className="kpi-data">
                <span className="kpi-label">Collected for Biogas</span>
                <span className="kpi-number">
                  {metrics?.wasteBiogasKg ?? 0} <span className="kpi-unit">kg</span>
                </span>
                <span className="kpi-sub">
                  Anaerobic biofuel feedstock
                </span>
              </div>
            </div>
          </div>

          {/* Climate Action & CO2e Avoidance Card */}
          <div className="climate-highlight-card mt-8">
            <div className="climate-icon-large">
              <Globe2 size={40} className="text-emerald" />
            </div>
            <div className="climate-content">
              <h3>Climate Action Impact (SDG 13)</h3>
              <p>
                Organic materials decaying anaerobically in landfills generate methane gas (CH₄), which has 28x the global warming potential of CO₂ over a century.
                By redistributing edible surplus and dispatching leftovers to compost and bio-digesters, the system has diverted{' '}
                <strong>{totalDivertedKg.toFixed(1)} kg</strong> of organic waste.
              </p>
              <div className="co2-metric-pill">
                <strong>{(metrics?.co2eAvoidedKg ?? 0).toFixed(1)} kg CO₂e Abated</strong>
                <span>(EPA WARM / UNEP Landfill Diversion Baseline)</span>
              </div>
            </div>
          </div>

          {/* Visual Charts and Breakdowns */}
          <div className="impact-charts-grid mt-8">
            {/* SVG Diverted Material Ratio Chart */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-title-with-icon">
                  <PieChart size={18} className="text-emerald" />
                  <h3>Organic Stream Breakdown</h3>
                </div>
                <span className="chart-header-tag">Live Proportions</span>
              </div>

              <div className="donut-chart-container">
                <svg viewBox="0 0 100 100" className="donut-svg">
                  {/* Background circle */}
                  <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f5f9" strokeWidth="16" />

                  {/* Redistribution segment */}
                  {totalDivertedKg > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#10b981"
                      strokeWidth="16"
                      strokeDasharray={`${(redistributedPct * 238.76) / 100} 238.76`}
                      strokeDashoffset="0"
                      transform="rotate(-90 50 50)"
                    />
                  )}

                  {/* Compost segment */}
                  {totalDivertedKg > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#84cc16"
                      strokeWidth="16"
                      strokeDasharray={`${(compostPct * 238.76) / 100} 238.76`}
                      strokeDashoffset={`-${(redistributedPct * 238.76) / 100}`}
                      transform="rotate(-90 50 50)"
                    />
                  )}

                  {/* Biogas segment */}
                  {totalDivertedKg > 0 && (
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#f97316"
                      strokeWidth="16"
                      strokeDasharray={`${(biogasPct * 238.76) / 100} 238.76`}
                      strokeDashoffset={`-${((redistributedPct + compostPct) * 238.76) / 100}`}
                      transform="rotate(-90 50 50)"
                    />
                  )}
                  <text x="50" y="48" textAnchor="middle" className="donut-text-value">
                    {totalDivertedKg.toFixed(0)} kg
                  </text>
                  <text x="50" y="60" textAnchor="middle" className="donut-text-sub">
                    Diverted
                  </text>
                </svg>

                <div className="donut-legend-list">
                  <div className="legend-item">
                    <span className="legend-dot bg-emerald" />
                    <span>Redistributed ({redistributedPct}%)</span>
                    <strong>{metrics?.foodRedistributedKg ?? 0} kg</strong>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot bg-lime" />
                    <span>Composted ({compostPct}%)</span>
                    <strong>{metrics?.wasteCompostingKg ?? 0} kg</strong>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot bg-orange" />
                    <span>Biogas Recycled ({biogasPct}%)</span>
                    <strong>{metrics?.wasteBiogasKg ?? 0} kg</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Comparative Bar Chart */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div className="chart-title-with-icon">
                  <BarChart3 size={18} className="text-blue" />
                  <h3>Comparative Food & Waste Metrics (kg)</h3>
                </div>
                <span className="chart-header-tag">Database Totals</span>
              </div>

              <div className="bar-chart-container">
                {[
                  {
                    label: 'Total Listed',
                    val: metrics?.totalFoodListedKg ?? 0,
                    color: 'var(--color-primary-600)',
                  },
                  {
                    label: 'Redistributed',
                    val: metrics?.foodRedistributedKg ?? 0,
                    color: 'var(--color-emerald-600)',
                  },
                  {
                    label: 'Available Remaining',
                    val: metrics?.foodRemainingKg ?? 0,
                    color: 'var(--color-amber-500)',
                  },
                  {
                    label: 'Compost Route',
                    val: metrics?.wasteCompostingKg ?? 0,
                    color: 'var(--color-lime-600)',
                  },
                  {
                    label: 'Biogas Route',
                    val: metrics?.wasteBiogasKg ?? 0,
                    color: 'var(--color-orange-500)',
                  },
                ].map((bar, idx) => {
                  const maxVal = Math.max(
                    1,
                    metrics?.totalFoodListedKg ?? 0,
                    metrics?.totalWasteCollectedKg ?? 0
                  );
                  const barWidth = Math.min(100, (bar.val / maxVal) * 100);

                  return (
                    <div key={idx} className="horizontal-bar-row">
                      <div className="bar-label-col">
                        <span>{bar.label}</span>
                        <strong>{bar.val.toFixed(1)} kg</strong>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: bar.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SDG Alignment Reference Section */}
          <div className="sdg-alignment-detail-grid mt-10">
            <div className="sdg-detail-card">
              <div className="sdg-badge-large sdg-2-bg">SDG 2</div>
              <h4>Zero Hunger</h4>
              <p>
                Directing hot banquet trays and surplus meals to community shelters directly addresses
                Target 2.1 (universal access to safe, nutritious food).
              </p>
            </div>

            <div className="sdg-detail-card">
              <div className="sdg-badge-large sdg-12-bg">SDG 12</div>
              <h4>Responsible Consumption</h4>
              <p>
                Addresses Target 12.3: Halving per capita global food waste and reducing food losses along
                production and supply chains, including post-event hospitality losses.
              </p>
            </div>

            <div className="sdg-detail-card">
              <div className="sdg-badge-large sdg-13-bg">SDG 13</div>
              <h4>Climate Action</h4>
              <p>
                Eliminating municipal organic waste dump landfilling directly mitigates fugitive methane
                emissions, helping urban regions meet localized climate action targets.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
