import L from "leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";
import "./style.css";

import { demoFloodArea } from "./data/demoFlood";

// ======================================================
// CONFIGURATION & TYPES
// ======================================================

const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
const BACKEND_URL = "http://127.0.0.1:8000/api";

interface LocationRecord {
  location_id: number;
  location_name: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
}

interface SatelliteObservation {
  observation_id: number;
  location_id: number;
  location_name: string;
  district: string;
  satellite: string;
  sensor: string;
  acquisition_date: string;
  product_id: string;
  image_url: string | null;
  cloud_cover: number | null;
  data_source: string;
}

interface FloodDetectionRecord {
  flood_detection_id: number;
  observation_id: number;
  location_id: number;
  location_name: string;
  district: string;
  satellite: string;
  sensor: string;
  acquisition_date: string;
  detection_date: string;
  status: string;
  flooded_area_km2: number | null;
  flood_percentage: number | null;
  confidence: number | null;
  detection_method: string;
  source: string;
}

interface FloodRegionRecord {
  flood_region_id: number;
  flood_detection_id: number;
  detection_date: string;
  location_id: number;
  location_name: string;
  region_name: string;
  district: string;
  affected_area_km2: number | null;
  severity: string;
  population_affected: number | null;
}

interface RiskPredictionRecord {
  risk_prediction_id: number;
  location_id: number;
  location_name: string;
  district: string;
  prediction_date: string;
  risk_score: number | null;
  risk_level: string;
  rainfall_mm: number | null;
  accumulated_rainfall_mm: number | null;
  temperature_c: number | null;
  elevation_m: number | null;
  slope_degree: number | null;
  river_distance_km: number | null;
  ndvi: number | null;
  ndwi: number | null;
  historical_flood_frequency: number | null;
  previous_flooded_area_km2: number | null;
  model_name: string;
}

interface HistoricalFloodRecord {
  historical_flood_id: number;
  location_id: number;
  location_name: string;
  district: string;
  state: string;
  flood_year: number;
  flood_date: string;
  flooded_area_km2: number | null;
  severity: string;
  rainfall_mm: number | null;
  duration_days: number | null;
  source: string;
  description: string;
}

interface AlertRecord {
  alert_id: number;
  location_id: number;
  location_name: string;
  district: string;
  risk_prediction_id: number | null;
  flood_detection_id: number | null;
  alert_type: string;
  alert_level: string;
  alert_message: string;
  alert_date: string;
  is_resolved: boolean;
}

interface ReportLocation {
  location_id: number;
  name: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
}

interface ReportData {
  title: string;
  generated_at: string;
  location: ReportLocation;
  satellite_observations: SatelliteObservation[];
  flood_detections: FloodDetectionRecord[];
  flood_regions: FloodRegionRecord[];
  risk_predictions: RiskPredictionRecord[];
  historical_floods: HistoricalFloodRecord[];
  alerts: AlertRecord[];
  data_provenance: {
    database: string;
    satellite: string;
    risk_model: string;
  };
}

interface ReportSummary {
  status: string;
  report: ReportData;
}

// SAR Pipeline types
interface SarPipelineStage {
  stage: number;
  name: string;
  status: string;
  description: string;
}

interface SarPipelineSummary {
  registry_path: string;
  total_scenes: number;
  by_status: {
    pending: number;
    acquired: number;
    processed: number;
    failed: number;
  };
  last_discovery: string | null;
  pipeline_stages: SarPipelineStage[];
}

// Sentinel-1 Product Discovery types
interface Sentinel1Product {
  product_id: string | null;
  collection: string;
  product_type: string | null;
  sensor: string | null;
  acquisition_date: string | null;
  platform: string | null;
  orbit_direction: string | null;
  polarization: string | null;
  relative_orbit: number | null;
  cloud_cover: null;
  bbox: number[] | null;
  stac_item_url: string | null;
  data_source: string;
}

interface Sentinel1ProductResponse {
  status: string;
  location: {
    location_id: number;
    name: string;
    district: string;
    state: string;
    latitude: number;
    longitude: number;
  };
  products: Sentinel1Product[];
  count: number;
  query: {
    location_id: number;
    days: number;
    collection: string;
    data_source: string;
    stac_endpoint: string;
  };
  download_status: string;
  pipeline_note: string;
}

// Copernicus Data Space Auth types
interface CdseAuthResponse {
  status: "connected" | "not_configured" | "authentication_failed";
  message: string;
}

// Sentinel-1 Controlled Download types
interface Sentinel1DownloadResponse {
  status: "downloaded" | "already_downloaded" | "authentication_failed" | "download_failed" | "invalid_product" | "not_found";
  product_id?: string;
  location_id?: number;
  file_path?: string;
  file_size_bytes?: number;
  download_status?: "COMPLETED" | "ALREADY_EXISTS";
  message?: string;
}

interface Sentinel1DownloadInfoResponse {
  status: string;
  product_id: string;
  filename?: string;
  expected_size_bytes?: number | null;
  is_downloaded: boolean;
  existing_path?: string | null;
  existing_size_bytes?: number | null;
  message?: string;
}

// Central Selected-Location State
export let dbLocations: LocationRecord[] = [];
export let selectedLocationId: number = 1;
export let selectedLocationName: string = "Bhubaneswar";
export let selectedLatitude: number = 20.2961;
export let selectedLongitude: number = 85.8245;
export let allObservations: SatelliteObservation[] = [];
export let allFloodDetections: FloodDetectionRecord[] = [];
export let allFloodRegions: FloodRegionRecord[] = [];
export let allRiskPredictions: RiskPredictionRecord[] = [];
export let allHistoricalFloods: HistoricalFloodRecord[] = [];
export let allAlerts: AlertRecord[] = [];

export function getSelectedLocationState() {
  return {
    selectedLocationId,
    selectedLocationName,
    selectedLatitude,
    selectedLongitude,
  };
}

// ======================================================
// MOUNT DASHBOARD HTML
// ======================================================

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
appRoot.innerHTML = `
  <div class="app">

    <!-- NAVBAR -->
    <header class="navbar">
      <div class="brand-group">
        <h1>🌍 EarthWatch-AI</h1>
        <span class="brand-badge">Disaster Monitoring</span>
      </div>

      <div class="nav-actions">
        <div class="status-group">
          <span class="pulse-dot"></span>
          <span class="status" id="system-status-indicator">Backend Checking...</span>
        </div>

        <button class="nav-report-btn" id="generate-report-btn">
          📑 Generate Report
        </button>

        <button class="nav-cdse-btn" id="open-cdse-btn" title="Copernicus Data Space Authentication">
          🛰️ Copernicus Data Space
        </button>
      </div>
    </header>

    <main class="dashboard">

      <!-- HERO & CONTROLS -->
      <section class="hero">
        <div class="hero-header">
          <div>
            <h2>Earth Observation & Flood Intelligence Dashboard</h2>
            <p>
              Integrated SQL Server telemetry, Copernicus Sentinel STAC catalogue & prototype flood risk modeling.
            </p>
          </div>

          <div class="provenance-legend">
            <span class="legend-title">Data Provenance:</span>
            <span class="provenance-tag tag-db">SQL DATABASE</span>
            <span class="provenance-tag tag-stac">COPERNICUS STAC</span>
            <span class="provenance-tag tag-live">LIVE WEATHER</span>
            <span class="provenance-tag tag-proto">PROTOTYPE MODEL</span>
            <span class="provenance-tag tag-demo">DEMO DATA</span>
          </div>
        </div>

        <div class="control-panel">
          <div class="control-group">
            <label for="db-location-select">
              📍 Monitored Location <span class="provenance-tag tag-db">SQL DATABASE</span>
            </label>
            <select id="db-location-select" class="db-select">
              <option value="">Loading locations...</option>
            </select>
          </div>

          <div class="control-group" style="flex: 1;">
            <label for="location-input">
              🔍 OpenWeather Geocoding Search <span class="provenance-tag tag-live">LIVE WEATHER</span>
            </label>
            <div class="location-control">
              <input id="location-input" type="text" placeholder="Or search city (e.g. Cuttack, Puri)..." />
              <button id="location-button" class="btn-secondary">Search City</button>
            </div>
          </div>

          <div class="location-meta-pill" id="location-meta-pill">
            <span>District: <strong id="meta-district">Khordha</strong></span>
            <span>State: <strong id="meta-state">Odisha</strong></span>
            <span>Coords: <strong id="meta-coords">20.2961° N, 85.8245° E</strong></span>
          </div>
        </div>
      </section>

      <!-- METRIC CARDS (9 CORE OBSERVATIONS) -->
      <section class="cards">

        <!-- 1. Flooded Area -->
        <div class="card">
          <div class="card-header-row">
            <h3>🌊 Flooded Area</h3>
            <span class="provenance-tag tag-db">SQL SERVER DATABASE</span>
          </div>
          <p class="value" id="flooded-area">--</p>
          <span class="card-subtitle" id="flood-extent-subtitle">Database detection record</span>
        </div>

        <!-- 2. Detection Confidence -->
        <div class="card">
          <div class="card-header-row">
            <h3>🎯 Confidence</h3>
            <span class="provenance-tag tag-proto">PROTOTYPE MODEL</span>
          </div>
          <p class="value" id="detection-confidence">--</p>
          <span class="card-subtitle" id="detection-method-subtitle">Prototype / Baseline Detection</span>
        </div>

        <!-- 3. Satellite Observation -->
        <div class="card">
          <div class="card-header-row">
            <h3>🛰️ Satellite Record</h3>
            <span class="provenance-tag tag-db">DATABASE OBSERVATION</span>
          </div>
          <p class="value" id="satellite-observation">--</p>
          <span class="card-subtitle" id="satellite-meta-subtitle">Sensor & date pending</span>
        </div>

        <!-- 4. Sentinel-1 SAR Asset -->
        <div class="card">
          <div class="card-header-row">
            <h3>📡 Sentinel-1 SAR</h3>
            <span class="provenance-tag tag-stac">LIVE COPERNICUS STAC SEARCH</span>
          </div>
          <p class="value" id="sar-status">Checking...</p>
          <span class="card-subtitle" id="sar-details">Copernicus STAC discovery</span>
        </div>

        <!-- 5. Flood Risk Score -->
        <div class="card">
          <div class="card-header-row">
            <h3>⚠️ Flood Risk</h3>
            <span class="provenance-tag tag-proto">PROTOTYPE MODEL</span>
          </div>
          <p class="value" id="flood-risk">--</p>
          <span class="card-subtitle" id="analysis-status">Ready for evaluation</span>
        </div>

        <!-- 6. Rainfall -->
        <div class="card">
          <div class="card-header-row">
            <h3>🌧️ Rainfall</h3>
            <span class="provenance-tag tag-live" id="rainfall-source-tag">LIVE WEATHER</span>
          </div>
          <p class="value" id="rainfall">--</p>
          <span class="card-subtitle" id="rainfall-status">Precipitation depth</span>
        </div>

        <!-- 7. Temperature -->
        <div class="card">
          <div class="card-header-row">
            <h3>🌡️ Temperature</h3>
            <span class="provenance-tag tag-live">LIVE WEATHER</span>
          </div>
          <p class="value" id="temperature">--</p>
          <span class="card-subtitle" id="condition">Current reading</span>
        </div>

        <!-- 8. Air Quality -->
        <div class="card">
          <div class="card-header-row">
            <h3>💧 Air Quality</h3>
            <span class="provenance-tag tag-live">LIVE WEATHER</span>
          </div>
          <p class="value" id="air-quality">--</p>
          <span class="card-subtitle" id="air-quality-status">AQI status</span>
        </div>

        <!-- 9. Affected Sub-Regions -->
        <div class="card">
          <div class="card-header-row">
            <h3>📍 Affected Regions</h3>
            <span class="provenance-tag tag-db">SQL SERVER DATABASE</span>
          </div>
          <p class="value" id="affected-regions">--</p>
          <span class="card-subtitle" id="regions-subtitle">Database sub-regions</span>
        </div>

      </section>

      <!-- QUICK ACTIONS -->
      <section class="quick-actions">
        <div class="section-title-row">
          <h3 class="section-title">⚡ Operational Workflows</h3>
        </div>
        <div class="action-buttons">
          <button id="detect-flood-button" class="action-btn">🌊 Refresh Flood Status</button>
          <button id="compare-button" class="action-btn">🛰️ Compare Satellite Scenes</button>
          <button id="risk-button" class="action-btn">⚠️ Risk Factor Breakdown</button>
          <button id="history-button" class="action-btn">📊 Historical Analytics</button>
          <button id="alerts-button" class="action-btn">🔔 Alert Center</button>
          <button id="cdse-action-btn" class="action-btn">🛰️ Copernicus Data Space</button>
          <button id="report-action-btn" class="action-btn">📑 Disaster Assessment Report</button>
        </div>
      </section>

      <!-- ALERT CENTER -->
      <section class="alert-center-section" id="alert-center-section">
        <div class="section-title-row">
          <h3 class="section-title">
            🔔 Disaster Alert Center <span class="provenance-tag tag-db">DATABASE ALERT</span>
          </h3>
          <span id="alert-count-badge" class="provenance-tag tag-proto">0 Active</span>
        </div>
        <div id="alerts-container" class="alerts-grid">
          <div class="state-box">Loading alerts from database...</div>
        </div>
      </section>

      <!-- RISK PREDICTION & FACTOR BREAKDOWN -->
      <section class="risk-section" id="risk-section">
        <div class="section-title-row">
          <h3 class="section-title">
            ⚠️ Environmental Risk Prediction <span class="provenance-tag tag-proto">PROTOTYPE MODEL</span>
          </h3>
          <span class="card-subtitle" id="risk-model-name">Model: Random Forest Prototype</span>
        </div>

        <div class="risk-summary-grid">
          <div class="risk-gauge-card">
            <div class="gauge-circle" id="risk-gauge-ring">
              <span class="gauge-score" id="risk-score-value">--</span>
              <span class="gauge-label">PROTOTYPE RISK SCORE</span>
            </div>
            <div id="risk-level-badge" class="alert-pill pill-medium">EVALUATING</div>
            <p style="font-size:12px; color:var(--text-dim); margin-top:8px;">
              Not a certified probabilistic forecast. Based on prototype feature inputs.
            </p>
          </div>

          <div class="risk-factors-grid" id="risk-factors-grid">
            <div class="risk-factor-item">
              <div class="factor-label">24h Rainfall</div>
              <div class="factor-value" id="rf-rainfall">-- mm</div>
            </div>
            <div class="risk-factor-item">
              <div class="factor-label">Accumulated Rain</div>
              <div class="factor-value" id="rf-accum-rain">-- mm</div>
            </div>
            <div class="risk-factor-item">
              <div class="factor-label">Temperature</div>
              <div class="factor-value" id="rf-temperature">-- °C</div>
            </div>
            <div class="risk-factor-item">
              <div class="factor-label">River Distance</div>
              <div class="factor-value" id="rf-river-dist">-- km</div>
            </div>
            <div class="risk-factor-item">
              <div class="factor-label">Terrain Elevation</div>
              <div class="factor-value" id="rf-elevation">-- m</div>
            </div>
            <div class="risk-factor-item">
              <div class="factor-label">Slope Degree</div>
              <div class="factor-value" id="rf-slope">--°</div>
            </div>
            <div class="risk-factor-item">
              <div class="factor-label">Vegetation Index (NDVI)</div>
              <div class="factor-value" id="rf-ndvi">--</div>
            </div>
            <div class="risk-factor-item">
              <div class="factor-label">Water Index (NDWI)</div>
              <div class="factor-value" id="rf-ndwi">--</div>
            </div>
            <div class="risk-factor-item">
              <div class="factor-label">Historical Frequency</div>
              <div class="factor-value" id="rf-freq">-- events</div>
            </div>
            <div class="risk-factor-item">
              <div class="factor-label">Prior Flood Extent</div>
              <div class="factor-value" id="rf-prior-area">-- km²</div>
            </div>
          </div>
        </div>
      </section>

      <!-- INTERACTIVE LEAFLET MAP -->
      <section class="map-section">
        <div class="section-title-row">
          <h3 class="section-title">
            🌊 Interactive Geospatial Flood Map
          </h3>
          <div style="display:flex; gap:8px; align-items:center;">
            <label style="font-size:12px; color:var(--text-muted); cursor:pointer;">
              <input type="checkbox" id="toggle-demo-boundaries" /> Show Demo Boundary Polygon
            </label>
          </div>
        </div>

        <div class="map-wrapper">
          <div class="map-status-banner">
            <span id="map-region-status">Loading database-driven geospatial layers...</span>
            <span id="map-active-coords" style="font-family:monospace;">--</span>
          </div>

          <div id="map"></div>

          <div class="map-legend-overlay">
            <div class="map-legend-title">
              <span>Map Layer Reference</span>
              <span class="provenance-tag tag-stac">GIS</span>
            </div>
            <div class="map-legend-item">
              <div class="legend-swatch swatch-monitored"></div>
              <span>Database Monitored Center</span>
            </div>
            <div class="map-legend-item">
              <div class="legend-swatch swatch-flood"></div>
              <span>Database Flood Regions (if present)</span>
            </div>
            <div class="map-legend-item">
              <div class="legend-swatch swatch-demo"></div>
              <span>Demo / Prototype Extent Polygon</span>
            </div>
          </div>
        </div>
      </section>

      <!-- HISTORICAL FLOOD ANALYTICS -->
      <section class="history-section" id="history-section">
        <div class="section-title-row">
          <h3 class="section-title">
            📊 Historical Flood Analytics <span class="provenance-tag tag-db">HISTORICAL DATASET</span>
          </h3>
          <span class="card-subtitle" id="history-source-badge">Multi-year records</span>
        </div>

        <div class="charts-row">
          <div class="chart-card">
            <h4>Flooded Area by Year (km²)</h4>
            <div id="chart-area-container" class="svg-chart-container">
              <!-- Dynamically generated SVG -->
            </div>
          </div>

          <div class="chart-card">
            <h4>Rainfall by Year (mm)</h4>
            <div id="chart-rainfall-container" class="svg-chart-container">
              <!-- Dynamically generated SVG -->
            </div>
          </div>
        </div>

        <div class="history-table-wrapper">
          <table class="history-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Event Date</th>
                <th>Location</th>
                <th>Flooded Area</th>
                <th>Rainfall</th>
                <th>Duration</th>
                <th>Severity</th>
                <th>Data Source</th>
              </tr>
            </thead>
            <tbody id="history-table-body">
              <tr><td colspan="8" class="state-box">Loading historical records...</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- COPERNICUS SATELLITE COMPARISON -->
      <section class="comparison-section" id="comparison-section">
        <div class="comparison-header">
          <div>
            <h2>🛰️ Satellite Image Comparison & Change Analysis</h2>
            <p>
              Direct scene queries to Copernicus Data Space STAC for Sentinel-1 SAR & Sentinel-2 MSI.
            </p>
          </div>
          <span class="provenance-tag tag-stac">Live Copernicus STAC Search</span>
        </div>

        <div class="comparison-controls">
          <div class="comparison-control">
            <label for="comparison-location">Location</label>
            <select id="comparison-location" class="db-select comparison-location-select">
              <option value="">Loading locations...</option>
            </select>
          </div>

          <div class="comparison-control">
            <label for="before-date-input">Before Date</label>
            <input type="date" id="before-date-input" value="2026-09-15" />
          </div>

          <div class="comparison-control">
            <label for="after-date-input">After Date</label>
            <input type="date" id="after-date-input" value="2026-09-19" />
          </div>

          <button id="load-comparison-button" class="comparison-load-button">
            🛰️ Query Satellite Scenes
          </button>
        </div>

        <div id="comparison-status-banner" class="comparison-status-banner" style="display:none;"></div>

        <div class="comparison-grid" id="comparison-grid">
          <!-- S1 Before -->
          <div class="comparison-card" id="card-before-s1">
            <div class="comparison-card-header">
              <h3>🛰️ Sentinel-1 Before</h3>
              <span class="comparison-date-badge" id="before-s1-date">--</span>
            </div>
            <div class="satellite-preview" id="before-s1-preview">
              <img id="before-sentinel1-image" class="satellite-comparison-image" style="display:none;" />
              <div class="satellite-placeholder" id="before-s1-placeholder">
                <span>🛰️</span><strong>Sentinel-1 Before</strong>
                <small>Awaiting query</small>
              </div>
            </div>
            <div class="comparison-info" id="before-s1-info">
              <p><strong>Product:</strong> <span id="before-s1-product">--</span></p>
              <p><strong>Source:</strong> <span class="provenance-tag tag-stac">Copernicus STAC</span></p>
            </div>
          </div>

          <!-- S1 After -->
          <div class="comparison-card" id="card-after-s1">
            <div class="comparison-card-header">
              <h3>🛰️ Sentinel-1 After</h3>
              <span class="comparison-date-badge" id="after-s1-date">--</span>
            </div>
            <div class="satellite-preview" id="after-s1-preview">
              <img id="after-sentinel1-image" class="satellite-comparison-image" style="display:none;" />
              <div class="satellite-placeholder" id="after-s1-placeholder">
                <span>🛰️</span><strong>Sentinel-1 After</strong>
                <small>Awaiting query</small>
              </div>
            </div>
            <div class="comparison-info" id="after-s1-info">
              <p><strong>Product:</strong> <span id="after-s1-product">--</span></p>
              <p><strong>Source:</strong> <span class="provenance-tag tag-stac">Copernicus STAC</span></p>
            </div>
          </div>

          <!-- S2 Before -->
          <div class="comparison-card" id="card-before-s2">
            <div class="comparison-card-header">
              <h3>🌍 Sentinel-2 Before</h3>
              <span class="comparison-date-badge" id="before-s2-date">--</span>
            </div>
            <div class="satellite-preview" id="before-s2-preview">
              <img id="before-sentinel2-image" class="satellite-comparison-image" style="display:none;" />
              <div class="satellite-placeholder" id="before-s2-placeholder">
                <span>🌍</span><strong>Sentinel-2 Before</strong>
                <small>Awaiting query</small>
              </div>
            </div>
            <div class="comparison-info" id="before-s2-info">
              <p><strong>Product:</strong> <span id="before-s2-product">--</span></p>
              <p><strong>Source:</strong> <span class="provenance-tag tag-stac">Copernicus STAC</span></p>
            </div>
          </div>

          <!-- S2 After -->
          <div class="comparison-card" id="card-after-s2">
            <div class="comparison-card-header">
              <h3>🌍 Sentinel-2 After</h3>
              <span class="comparison-date-badge" id="after-s2-date">--</span>
            </div>
            <div class="satellite-preview" id="after-s2-preview">
              <img id="after-sentinel2-image" class="satellite-comparison-image" style="display:none;" />
              <div class="satellite-placeholder" id="after-s2-placeholder">
                <span>🌍</span><strong>Sentinel-2 After</strong>
                <small>Awaiting query</small>
              </div>
            </div>
            <div class="comparison-info" id="after-s2-info">
              <p><strong>Product:</strong> <span id="after-s2-product">--</span></p>
              <p><strong>Source:</strong> <span class="provenance-tag tag-stac">Copernicus STAC</span></p>
            </div>
          </div>
        </div>

        <div class="change-result" id="change-result-panel">
          <h3>📊 Change Analysis</h3>
          <div class="change-stats">
            <div class="change-stat">
              <span>Source Observation</span>
              <strong id="change-area">Evaluated on request</strong>
            </div>
            <div class="change-stat">
              <span>Visual Image Difference</span>
              <strong id="change-percentage">--</strong>
            </div>
            <div class="change-stat">
              <span>Verification Status</span>
              <strong id="change-status">AWAITING QUERY</strong>
            </div>
          </div>
        </div>
      </section>

      <!-- AI ENVIRONMENTAL INSIGHT -->
      <section class="insight-section">
        <div class="insight-header">
          <div>
            <h2>🤖 AI Environmental & Atmospheric Insight</h2>
            <p>Composite live meteorological, air quality & surface indices.</p>
          </div>
          <span class="insight-badge">● Active Telemetry</span>
        </div>

        <div class="insight-grid">
          <div class="insight-card">
            <h3>Overall Condition</h3>
            <p id="environment-status" class="insight-status">Evaluating...</p>
            <span>Atmospheric and moisture composite</span>
          </div>
          <div class="insight-card">
            <h3>Operational Advisory</h3>
            <p id="ai-recommendation">Gathering environmental telemetry...</p>
            <span>Automated operational recommendation</span>
          </div>
          <div class="insight-card">
            <h3>Risk Assessment</h3>
            <p id="risk-level" class="risk-low">Evaluating...</p>
            <span id="risk-description">No alerts</span>
          </div>
        </div>
      </section>

      <!-- DASHBOARD SYSTEM DATA STATUS -->
      <section class="system-status-section" id="system-status-section">
        <div class="system-status-header">
          <h3>🖥️ System Data Status & Engine Provenance</h3>
          <span class="provenance-tag tag-db">System Integrity</span>
        </div>
        <div class="system-status-grid">
          <div class="system-status-card">
            <div class="system-status-card-header">
              <span class="status-label">Database</span>
              <span class="provenance-tag tag-db">SQL Server</span>
            </div>
            <div class="status-source">SQL Server / EarthWatchAI</div>
            <div class="status-state" id="sys-status-db">
              <span style="color:#10b981;">●</span> Status: Connected
            </div>
          </div>

          <div class="system-status-card">
            <div class="system-status-card-header">
              <span class="status-label">Satellite Search</span>
              <span class="provenance-tag tag-stac">Copernicus STAC</span>
            </div>
            <div class="status-source">Copernicus STAC</div>
            <div class="status-state" id="sys-status-stac">
              <span style="color:#38bdf8;">●</span> Status: Available
            </div>
          </div>

          <div class="system-status-card">
            <div class="system-status-card-header">
              <span class="status-label">Risk Engine</span>
              <span class="provenance-tag tag-proto">Prototype Model</span>
            </div>
            <div class="status-source">Prototype Model</div>
            <div class="status-state" id="sys-status-risk">
              <span style="color:#fbbf24;">●</span> Status: Prototype
            </div>
          </div>

          <div class="system-status-card">
            <div class="system-status-card-header">
              <span class="status-label">Report Engine</span>
              <span class="provenance-tag tag-db">Database Report</span>
            </div>
            <div class="status-source">Database Report</div>
            <div class="status-state" id="sys-status-report">
              <span style="color:#10b981;">●</span> Status: Available
            </div>
          </div>

          <div class="system-status-card">
            <div class="system-status-card-header">
              <span class="status-label">SAR Pipeline</span>
              <span class="provenance-tag tag-stac">Foundation Layer</span>
            </div>
            <div class="status-source">Sentinel-1 GRD / Copernicus STAC</div>
            <div class="status-state" id="sys-status-sar-pipeline">
              <span style="color:#94a3b8;">●</span> Status: Checking...
            </div>
          </div>
        </div>
      </section>

      <!-- SENTINEL-1 SAR ACQUISITION PIPELINE -->
      <section class="sar-pipeline-section" id="sar-pipeline-section">
        <div class="section-title-row">
          <h3 class="section-title">
            📡 Sentinel-1 SAR Acquisition Pipeline
            <span class="provenance-tag tag-stac">COPERNICUS STAC</span>
          </h3>
          <span class="provenance-tag tag-proto">FOUNDATION LAYER — NO S3 DOWNLOAD</span>
        </div>

        <div class="sar-pipeline-info-bar">
          <span>🗄️ Local Scene Registry: <strong id="sar-registry-total">--</strong> scenes discovered</span>
          <span>⏱️ Last Discovery: <strong id="sar-last-discovery">--</strong></span>
          <button id="sar-discover-btn" class="action-btn" style="padding:6px 14px; font-size:12px;">
            🔍 Run Scene Discovery (Bhubaneswar)
          </button>
        </div>

        <div class="sar-pipeline-stages" id="sar-pipeline-stages">
          <div class="state-box">Loading SAR pipeline status...</div>
        </div>

        <div class="sar-registry-table-wrapper" id="sar-registry-table-wrapper" style="display:none;">
          <h4 style="margin:0 0 8px; font-size:13px; color:var(--text-muted);">📋 Catalogued Scenes (Registry)</h4>
          <table class="history-table" id="sar-registry-table">
            <thead>
              <tr>
                <th>Product ID</th>
                <th>Location</th>
                <th>Acquisition Date</th>
                <th>Platform</th>
                <th>VV Asset</th>
                <th>Status</th>
                <th>Discovered At</th>
              </tr>
            </thead>
            <tbody id="sar-registry-tbody">
              <tr><td colspan="7" class="state-box">No scenes catalogued yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- SENTINEL-1 SAR PRODUCT DISCOVERY -->
      <section class="s1-discovery-section" id="s1-discovery-section">
        <div class="section-title-row">
          <h3 class="section-title">
            🛰️ Sentinel-1 SAR Product Discovery
            <span class="provenance-tag tag-stac">COPERNICUS DATA SPACE</span>
          </h3>
          <span class="provenance-tag tag-proto">CONTROLLED PRODUCT ACQUISITION</span>
        </div>

        <div class="s1-discovery-info-bar">
          <div class="s1-discovery-badges">
            <span class="provenance-tag tag-stac">COPERNICUS DATA SPACE</span>
            <span class="provenance-tag tag-proto">CONTROLLED SINGLE-PRODUCT ACQUISITION</span>
          </div>
          <div class="s1-discovery-meta">
            <span>📍 Location: <strong id="s1-location-name">--</strong></span>
            <span>📦 Products Found: <strong id="s1-product-count">--</strong></span>
            <span>📅 Search Window: <strong>Last 7 days</strong></span>
          </div>
          <button id="s1-refresh-btn" class="action-btn" style="padding:6px 14px; font-size:12px;">
            🔍 Refresh Discovery
          </button>
        </div>

        <div class="s1-discovery-notice">
          ⚠️ <strong>Data Honesty Notice:</strong> This panel enables <strong>controlled single-product Sentinel-1 downloads</strong>.
          Products are not automatically downloaded. Select a specific product to download and store locally.
          Downloading a product does not yet perform SAR preprocessing or flood detection.
        </div>

        <div id="s1-discovery-status" class="s1-discovery-status-bar" style="display:none;"></div>

        <div id="s1-products-container" class="s1-products-container">
          <div class="state-box">Querying Copernicus Data Space for Sentinel-1 products...</div>
        </div>
      </section>

    </main>

    <!-- DISASTER ASSESSMENT REPORT MODAL -->
    <div id="report-modal" class="modal-backdrop" style="display:none;">
      <div class="modal-window">
        <div class="modal-header">
          <h3>📑 EarthWatch AI — Disaster Assessment Summary</h3>
          <div class="modal-actions">
            <button id="print-report-btn" class="modal-btn-print">🖨️ Print / Save PDF</button>
            <button id="close-report-btn" class="modal-btn-close">&times;</button>
          </div>
        </div>
        <div class="modal-body" id="report-modal-content">
          <div class="state-box">Generating comprehensive assessment dossier...</div>
        </div>
      </div>
    </div>

    <!-- COPERNICUS DATA SPACE AUTHENTICATION MODAL -->
    <div id="cdse-modal" class="modal-backdrop" style="display:none;">
      <div class="modal-window cdse-modal-window">
        <div class="modal-header">
          <div class="cdse-modal-title-group">
            <h3 style="margin:0; font-size:18px; color:#38bdf8; font-weight:800; letter-spacing:0.5px;">COPERNICUS DATA SPACE</h3>
            <span class="cdse-modal-subtitle" style="font-size:13px; color:#94a3b8;">Sentinel-1 Data Access</span>
          </div>
          <div class="modal-actions">
            <button id="close-cdse-btn" class="modal-btn-close">&times;</button>
          </div>
        </div>

        <div class="modal-body">
          <div class="cdse-panel">

            <!-- Security Notice -->
            <div class="cdse-security-notice">
              <span class="cdse-security-icon">🔒</span>
              <div class="cdse-security-text">
                Copernicus credentials are stored securely on the EarthWatch AI backend and are never exposed in the browser.
              </div>
            </div>

            <!-- Auth Status Card -->
            <div class="cdse-status-card">
              <div class="cdse-status-card-header">
                <span class="cdse-section-label">Authentication Status</span>
                <span class="provenance-tag tag-stac">COPERNICUS DATA SPACE</span>
              </div>
              <div class="cdse-status-display" id="cdse-status-display">
                <span class="cdse-status-text status-not-configured" id="cdse-status-text">● Not Configured</span>
              </div>
              <div class="cdse-status-message" id="cdse-status-message">
                Copernicus Data Space credentials are not configured.
              </div>
            </div>

            <!-- Backend Credentials -->
            <div class="cdse-credentials-card">
              <div class="cdse-section-label">Backend Credentials</div>
              <div class="cdse-credential-banner">
                Configured securely through server environment
              </div>
              <div class="cdse-credentials-info">
                <div class="cdse-credential-row">
                  <span class="cdse-cred-label">Configuration</span>
                  <span class="cdse-cred-value">Managed in <code>backend/.env</code> (server-side only)</span>
                </div>
                <div class="cdse-credential-row">
                  <span class="cdse-cred-label">Variables</span>
                  <span class="cdse-cred-value"><code>CDSE_USERNAME</code> &amp; <code>CDSE_PASSWORD</code></span>
                </div>
                <div class="cdse-credential-row">
                  <span class="cdse-cred-label">Browser Access</span>
                  <span class="cdse-cred-value cdse-cred-secure">✓ None — credentials never leave the server</span>
                </div>
              </div>
              <p class="cdse-no-input-note">
                Security Policy: Username and password inputs are intentionally omitted from this interface.
                Copernicus credentials are stored securely on the EarthWatch AI backend and are never exposed in the browser.
              </p>
            </div>

            <!-- Test Connection Button -->
            <div class="cdse-test-row">
              <button id="cdse-test-btn" class="cdse-test-btn">
                🔗 Test Connection
              </button>
              <span class="cdse-test-hint" id="cdse-test-hint">Tests credentials configured in backend .env</span>
            </div>

            <!-- Download Status Notice -->
            <div class="cdse-download-notice">
              <strong>⛔ Satellite Data Download: Not Enabled</strong><br>
              This task is authentication ONLY. Sentinel-1 product discovery continues using <code>"download_status": "NOT_IMPLEMENTED"</code>. No satellite files or S3 downloads are performed.
            </div>

          </div>
        </div>
    <!-- SENTINEL-1 DOWNLOAD CONFIRMATION MODAL -->
    <div id="s1-download-modal" class="modal-backdrop" style="display:none;">
      <div class="modal-window s1-download-modal-window">
        <div class="modal-header">
          <h3>🛰️ Sentinel-1 Product Download</h3>
          <button id="close-s1-download-btn" class="modal-btn-close">&times;</button>
        </div>
        <div class="modal-body s1-download-modal-body">
          <p style="margin-bottom:12px; font-size:14px; font-weight:600; color:var(--text-main);">
            Sentinel-1 product download
          </p>
          <div class="s1-confirm-detail-row">
            <span class="s1-confirm-label">Product:</span>
            <code id="s1-confirm-product-id" class="s1-confirm-code">--</code>
          </div>
          <div id="s1-confirm-size-row" class="s1-confirm-detail-row" style="display:none;">
            <span class="s1-confirm-label">Estimated Size:</span>
            <span id="s1-confirm-size-val" class="s1-confirm-size">--</span>
          </div>
          <div class="s1-confirm-warning-box">
            <p><strong>This product may be large and will be stored locally.</strong></p>
            <p style="margin-top:6px; font-size:12px; color:var(--text-dim);">Storage destination: <code>backend/data/sentinel1/&lt;product_id&gt;/</code></p>
          </div>
          <p style="margin-top:16px; font-weight:600; font-size:14px; color:var(--text-main);">
            Continue?
          </p>
        </div>
        <div class="modal-actions s1-download-modal-actions">
          <button id="s1-download-cancel-btn" class="modal-btn-secondary">Cancel</button>
          <button id="s1-download-proceed-btn" class="action-btn" style="padding:8px 20px; font-size:13px; background:var(--accent-blue);">Download</button>
        </div>
      </div>
    </div>

  </div>
`;

// ======================================================
// DOM REFERENCES
// ======================================================

const dbLocationSelect = document.querySelector<HTMLSelectElement>("#db-location-select")!;
const locationInput = document.querySelector<HTMLInputElement>("#location-input")!;
const locationButton = document.querySelector<HTMLButtonElement>("#location-button")!;
const metaDistrict = document.querySelector<HTMLElement>("#meta-district")!;
const metaState = document.querySelector<HTMLElement>("#meta-state")!;
const metaCoords = document.querySelector<HTMLElement>("#meta-coords")!;
const systemStatusIndicator = document.querySelector<HTMLElement>("#system-status-indicator")!;

// Metric cards
const floodedAreaElement = document.querySelector<HTMLElement>("#flooded-area")!;
const floodExtentSubtitle = document.querySelector<HTMLElement>("#flood-extent-subtitle")!;
const detectionConfidenceElement = document.querySelector<HTMLElement>("#detection-confidence")!;
const detectionMethodSubtitle = document.querySelector<HTMLElement>("#detection-method-subtitle")!;
const satelliteObservationElement = document.querySelector<HTMLElement>("#satellite-observation")!;
const satelliteMetaSubtitle = document.querySelector<HTMLElement>("#satellite-meta-subtitle")!;
const sarStatusElement = document.querySelector<HTMLElement>("#sar-status")!;
const sarDetailsElement = document.querySelector<HTMLElement>("#sar-details")!;
const floodRiskElement = document.querySelector<HTMLElement>("#flood-risk")!;
const analysisStatusElement = document.querySelector<HTMLElement>("#analysis-status")!;
const rainfallElement = document.querySelector<HTMLElement>("#rainfall")!;
const rainfallStatus = document.querySelector<HTMLElement>("#rainfall-status")!;
const temperatureElement = document.querySelector<HTMLElement>("#temperature")!;
const conditionElement = document.querySelector<HTMLElement>("#condition")!;
const airQualityElement = document.querySelector<HTMLElement>("#air-quality")!;
const airQualityStatus = document.querySelector<HTMLElement>("#air-quality-status")!;
const affectedRegionsElement = document.querySelector<HTMLElement>("#affected-regions")!;
const regionsSubtitle = document.querySelector<HTMLElement>("#regions-subtitle");

// Risk section DOM
const riskScoreValue = document.querySelector<HTMLElement>("#risk-score-value")!;
const riskLevelBadge = document.querySelector<HTMLElement>("#risk-level-badge")!;
const riskModelName = document.querySelector<HTMLElement>("#risk-model-name")!;
const rfRainfall = document.querySelector<HTMLElement>("#rf-rainfall")!;
const rfAccumRain = document.querySelector<HTMLElement>("#rf-accum-rain")!;
const rfTemperature = document.querySelector<HTMLElement>("#rf-temperature");
const rfRiverDist = document.querySelector<HTMLElement>("#rf-river-dist")!;
const rfElevation = document.querySelector<HTMLElement>("#rf-elevation")!;
const rfSlope = document.querySelector<HTMLElement>("#rf-slope")!;
const rfNdvi = document.querySelector<HTMLElement>("#rf-ndvi")!;
const rfNdwi = document.querySelector<HTMLElement>("#rf-ndwi")!;
const rfFreq = document.querySelector<HTMLElement>("#rf-freq")!;
const rfPriorArea = document.querySelector<HTMLElement>("#rf-prior-area")!;

// Alerts section DOM
const alertsContainer = document.querySelector<HTMLElement>("#alerts-container")!;
const alertCountBadge = document.querySelector<HTMLElement>("#alert-count-badge")!;

// Map status DOM
const mapRegionStatus = document.querySelector<HTMLElement>("#map-region-status")!;
const mapActiveCoords = document.querySelector<HTMLElement>("#map-active-coords")!;
const toggleDemoBoundaries = document.querySelector<HTMLInputElement>("#toggle-demo-boundaries")!;

// Comparison DOM
const comparisonLocationSelect = document.querySelector<HTMLSelectElement>("#comparison-location")!;
const beforeDateInput = document.querySelector<HTMLInputElement>("#before-date-input")!;
const afterDateInput = document.querySelector<HTMLInputElement>("#after-date-input")!;
const loadComparisonButton = document.querySelector<HTMLButtonElement>("#load-comparison-button")!;
const beforeSentinel1Image = document.querySelector<HTMLImageElement>("#before-sentinel1-image");
const afterSentinel1Image = document.querySelector<HTMLImageElement>("#after-sentinel1-image");
const beforeSentinel2Image = document.querySelector<HTMLImageElement>("#before-sentinel2-image");
const afterSentinel2Image = document.querySelector<HTMLImageElement>("#after-sentinel2-image");
const beforeS1DateElement = document.querySelector<HTMLElement>("#before-s1-date");
const afterS1DateElement = document.querySelector<HTMLElement>("#after-s1-date");
const beforeS2DateElement = document.querySelector<HTMLElement>("#before-s2-date");
const afterS2DateElement = document.querySelector<HTMLElement>("#after-s2-date");
const beforeS1ProductElement = document.querySelector<HTMLElement>("#before-s1-product");
const afterS1ProductElement = document.querySelector<HTMLElement>("#after-s1-product");
const beforeS2ProductElement = document.querySelector<HTMLElement>("#before-s2-product");
const afterS2ProductElement = document.querySelector<HTMLElement>("#after-s2-product");
const changePercentageElement = document.querySelector<HTMLElement>("#change-percentage");
const changeStatusElement = document.querySelector<HTMLElement>("#change-status");
const changeAreaElement = document.querySelector<HTMLElement>("#change-area");
const comparisonStatusBanner = document.querySelector<HTMLElement>("#comparison-status-banner");

// Action buttons
const detectFloodButton = document.querySelector<HTMLButtonElement>("#detect-flood-button");
const compareButton = document.querySelector<HTMLButtonElement>("#compare-button");
const riskButton = document.querySelector<HTMLButtonElement>("#risk-button");
const historyButton = document.querySelector<HTMLButtonElement>("#history-button");
const alertsButton = document.querySelector<HTMLButtonElement>("#alerts-button");
const reportActionBtn = document.querySelector<HTMLButtonElement>("#report-action-btn");
const generateReportBtn = document.querySelector<HTMLButtonElement>("#generate-report-btn");

// Modal DOM
const reportModal = document.querySelector<HTMLElement>("#report-modal")!;
const reportModalContent = document.querySelector<HTMLElement>("#report-modal-content")!;
const printReportBtn = document.querySelector<HTMLButtonElement>("#print-report-btn")!;
const closeReportBtn = document.querySelector<HTMLButtonElement>("#close-report-btn")!;

// Copernicus Data Space Modal DOM
const cdseModal = document.querySelector<HTMLElement>("#cdse-modal");
const openCdseBtn = document.querySelector<HTMLButtonElement>("#open-cdse-btn");
const cdseActionBtn = document.querySelector<HTMLButtonElement>("#cdse-action-btn");
const closeCdseBtn = document.querySelector<HTMLButtonElement>("#close-cdse-btn");
const cdseTestBtn = document.querySelector<HTMLButtonElement>("#cdse-test-btn");
const cdseStatusText = document.querySelector<HTMLElement>("#cdse-status-text");
const cdseStatusMessage = document.querySelector<HTMLElement>("#cdse-status-message");

// System Data Status DOM
const sysStatusDb = document.querySelector<HTMLElement>("#sys-status-db");
const sysStatusStac = document.querySelector<HTMLElement>("#sys-status-stac");
const sysStatusRisk = document.querySelector<HTMLElement>("#sys-status-risk");
const sysStatusReport = document.querySelector<HTMLElement>("#sys-status-report");

// ======================================================
// LEAFLET MAP INITIALIZATION
// ======================================================

const defaultLat = 20.2961;
const defaultLon = 85.8245;

const map = L.map("map").setView([defaultLat, defaultLon], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors | EarthWatch AI",
  maxZoom: 18,
}).addTo(map);

// Layer groups for clean management
const markerLayerGroup = L.layerGroup().addTo(map);
const floodRegionsLayerGroup = L.layerGroup().addTo(map);
let demoFloodLayer: L.GeoJSON | null = null;

// Initial Demo Flood Layer (added only when explicitly toggled on)
demoFloodLayer = L.geoJSON(demoFloodArea as any, {
  style: {
    color: "#00f0ff",
    weight: 2,
    dashArray: "4, 4",
    fillColor: "#0284c7",
    fillOpacity: 0.25,
  },
  onEachFeature: (_feature, layer) => {
    layer.bindPopup(`
      <b>🌊 Demo Flood Extent</b><br>
      <span class="provenance-tag tag-demo">DEMO / PROTOTYPE</span><br>
      <small style="color:#64748b;">Synthetic demonstration polygon. Not a live alert.</small>
    `);
  },
});

toggleDemoBoundaries?.addEventListener("change", (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  if (demoFloodLayer) {
    if (checked) {
      map.addLayer(demoFloodLayer);
    } else {
      map.removeLayer(demoFloodLayer);
    }
  }
});

// ======================================================
// BACKEND API CLIENTS (FASTAPI & SQL SERVER)
// ======================================================

async function fetchDbLocations(): Promise<LocationRecord[]> {
  const response = await axios.get(`${BACKEND_URL}/database/locations`);
  return response.data?.locations || [];
}

async function fetchDbSatelliteObservations(): Promise<SatelliteObservation[]> {
  const response = await axios.get(`${BACKEND_URL}/database/satellite-observations`);
  return response.data?.observations || [];
}

async function fetchDbFloodDetections(): Promise<FloodDetectionRecord[]> {
  const response = await axios.get(`${BACKEND_URL}/database/flood-detections`);
  return response.data?.detections || [];
}

async function fetchDbFloodRegions(): Promise<FloodRegionRecord[]> {
  const response = await axios.get(`${BACKEND_URL}/database/flood-regions`);
  return response.data?.regions || [];
}

async function fetchDbRiskPredictions(): Promise<RiskPredictionRecord[]> {
  const response = await axios.get(`${BACKEND_URL}/database/risk-predictions`);
  return response.data?.predictions || [];
}

async function fetchDbHistoricalFloods(): Promise<HistoricalFloodRecord[]> {
  const response = await axios.get(`${BACKEND_URL}/database/historical-floods`);
  return response.data?.historical_floods || [];
}

async function fetchDbAlerts(): Promise<AlertRecord[]> {
  const response = await axios.get(`${BACKEND_URL}/database/alerts`);
  return response.data?.alerts || [];
}

async function fetchReportSummary(locationId: number): Promise<ReportSummary> {
  const response = await axios.get(`${BACKEND_URL}/reports/summary`, {
    params: { location_id: locationId },
  });
  return response.data;
}

async function queryCopernicusSarAsset(location: string, date: string) {
  const response = await axios.get(`${BACKEND_URL}/sar/data`, {
    params: { location, date },
  });
  return response.data;
}

async function fetchSarPipelineSummary(): Promise<SarPipelineSummary> {
  const response = await axios.get(`${BACKEND_URL}/sar/pipeline/summary`);
  return response.data;
}

async function triggerSarDiscovery(location: string, date: string): Promise<any> {
  const response = await axios.post(`${BACKEND_URL}/sar/pipeline/discover`, null, {
    params: { location, date, window_days: 5 },
  });
  return response.data;
}

async function fetchSarRegistryScenes(location?: string): Promise<any[]> {
  const response = await axios.get(`${BACKEND_URL}/sar/pipeline/scenes`, {
    params: { location, limit: 50 },
  });
  return response.data?.scenes || [];
}

async function fetchSentinel1Products(
  locationId: number,
  days: number = 7
): Promise<Sentinel1ProductResponse> {
  const response = await axios.get(`${BACKEND_URL}/sentinel1/products`, {
    params: { location_id: locationId, days },
  });
  return response.data;
}

async function fetchCdseStatus(): Promise<CdseAuthResponse> {
  const response = await axios.get<CdseAuthResponse>(`${BACKEND_URL}/cdse/status`, {
    timeout: 10000,
  });
  return response.data;
}

async function testCdseAuth(): Promise<CdseAuthResponse> {
  const response = await axios.post<CdseAuthResponse>(`${BACKEND_URL}/cdse/test`, null, {
    timeout: 25000,
  });
  return response.data;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "--";
  if (bytes >= 1024 * 1024 * 1024) {
    return `~${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB (${bytes.toLocaleString()} bytes)`;
  }
  if (bytes >= 1024 * 1024) {
    return `~${(bytes / (1024 * 1024)).toFixed(1)} MB (${bytes.toLocaleString()} bytes)`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function fetchSentinel1DownloadInfo(
  productId: string,
  locationId: number
): Promise<Sentinel1DownloadInfoResponse | null> {
  try {
    const response = await axios.get<Sentinel1DownloadInfoResponse>(
      `${BACKEND_URL}/sentinel1/download/info`,
      {
        params: { product_id: productId, location_id: locationId },
        timeout: 8000,
      }
    );
    return response.data;
  } catch {
    return null;
  }
}

async function requestSentinel1Download(
  productId: string,
  locationId: number
): Promise<Sentinel1DownloadResponse> {
  const response = await axios.post<Sentinel1DownloadResponse>(
    `${BACKEND_URL}/sentinel1/download`,
    {
      product_id: productId,
      location_id: locationId,
    },
    {
      timeout: 300000, // 5 minutes for streaming download
      validateStatus: (status) => status < 500, // Handle 200, 400, 404 cleanly
    }
  );
  return response.data;
}

// ======================================================
// WEATHER & AIR QUALITY (OPENWEATHER API)
// ======================================================

async function fetchLiveWeather(lat: number, lon: number) {
  if (!API_KEY) {
    throw new Error("OpenWeather API key not configured.");
  }
  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
  );
  if (!res.ok) throw new Error("Weather request failed.");
  return res.json();
}

async function fetchLiveAirQuality(lat: number, lon: number) {
  if (!API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.list?.[0]?.main?.aqi as number | undefined;
  } catch {
    return null;
  }
}

// ======================================================
// UI RENDERERS
// ======================================================

function updateInsightCard(temperature: number, aqi: number | null | undefined, riskLevel: string) {
  const environmentStatus = document.querySelector<HTMLElement>("#environment-status");
  const riskLevelEl = document.querySelector<HTMLElement>("#risk-level");
  const riskDescEl = document.querySelector<HTMLElement>("#risk-description");
  const recommendationEl = document.querySelector<HTMLElement>("#ai-recommendation");

  if (environmentStatus) {
    environmentStatus.textContent =
      riskLevel === "HIGH" || riskLevel === "VERY HIGH"
        ? "Attention: Flood Watch Active"
        : "Atmospheric Telemetry Stable";
  }

  if (riskLevelEl) {
    riskLevelEl.textContent = `${riskLevel} Risk`;
    riskLevelEl.className =
      riskLevel === "HIGH" || riskLevel === "VERY HIGH"
        ? "risk-tag-high"
        : riskLevel === "MEDIUM"
        ? "risk-tag-med"
        : "risk-tag-low";
  }

  if (riskDescEl) {
    riskDescEl.textContent = `Temp: ${temperature}°C | AQI Index: ${aqi ?? "N/A"}`;
  }

  if (recommendationEl) {
    if (riskLevel === "HIGH" || riskLevel === "VERY HIGH") {
      recommendationEl.textContent =
        "High flood probability indicated. Prioritize surface runoff drainage inspections and river basin telemetry.";
    } else {
      recommendationEl.textContent =
        "Normal operational baseline. Continue routine satellite pass acquisition and atmospheric monitoring.";
    }
  }
}

function renderLocationPins(locations: LocationRecord[], activeLocId: number) {
  markerLayerGroup.clearLayers();

  locations.forEach((loc) => {
    const isSelected = loc.location_id === activeLocId;

    const customIcon = L.divIcon({
      className: "custom-map-pin",
      html: `
        <div style="
          background:${isSelected ? "#00f0ff" : "#0284c7"};
          color:#060c16;
          border:2px solid white;
          border-radius:50%;
          width:24px;
          height:24px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight:bold;
          font-size:11px;
          box-shadow:0 0 10px ${isSelected ? "rgba(0,240,255,0.9)" : "rgba(0,0,0,0.5)"};
        ">📍</div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const m = L.marker([loc.latitude, loc.longitude], { icon: customIcon });
    m.bindPopup(`
      <div style="color:#0f172a; font-family:sans-serif; min-width:180px;">
        <h4 style="margin:0 0 4px; color:#0369a1;">${loc.location_name} ${isSelected ? "• Active" : ""}</h4>
        <p style="margin:0; font-size:12px;"><strong>District:</strong> ${loc.district}, ${loc.state}</p>
        <p style="margin:2px 0 0; font-size:11px; color:#64748b;">${loc.latitude.toFixed(4)}°N, ${loc.longitude.toFixed(4)}°E</p>
        <div style="margin-top:6px; font-size:11px; color:${isSelected ? "#10b981" : "#0284c7"}; font-weight:600;">
          ${isSelected ? "✓ Active Monitored Location" : "Click to focus this location"}
        </div>
      </div>
    `);

    m.on("click", () => {
      selectMonitoredLocation(loc.location_id);
    });

    markerLayerGroup.addLayer(m);

    if (isSelected) {
      setTimeout(() => m.openPopup(), 150);
    }
  });
}

function renderHistoricalCharts(records: HistoricalFloodRecord[]) {
  const areaContainer = document.querySelector<HTMLElement>("#chart-area-container");
  const rainContainer = document.querySelector<HTMLElement>("#chart-rainfall-container");
  const tableBody = document.querySelector<HTMLElement>("#history-table-body");

  if (!areaContainer || !rainContainer || !tableBody) return;

  if (records.length === 0) {
    areaContainer.innerHTML = `<div class="state-box">No historical flood records available for this location.</div>`;
    rainContainer.innerHTML = `<div class="state-box">No historical flood records available for this location.</div>`;
    tableBody.innerHTML = `<tr><td colspan="8" class="state-box">No historical flood records available for this location.</td></tr>`;
    return;
  }

  // Sort chronological
  const sorted = [...records].sort((a, b) => a.flood_year - b.flood_year);

  // 1. Flooded Area SVG Bar Chart
  const maxArea = Math.max(...sorted.map((r) => r.flooded_area_km2 || 1), 6);
  const chartWidth = 460;
  const chartHeight = 180;
  const barWidth = sorted.length === 1 ? 52 : Math.min(44, Math.floor(260 / sorted.length));
  const totalBarsWidth = sorted.length * barWidth;
  const gap = Math.max(20, (chartWidth - 60 - totalBarsWidth) / (sorted.length + 1));
  const startX = 25;

  let areaSvg = `
    <svg viewBox="0 0 ${chartWidth} ${chartHeight}" style="width:100%; height:100%;">
      <line x1="20" y1="${chartHeight - 30}" x2="${chartWidth - 10}" y2="${chartHeight - 30}" stroke="#1e3a56" stroke-width="1"/>
  `;

  sorted.forEach((r, idx) => {
    const val = r.flooded_area_km2 || 0;
    const h = Math.max(6, (val / maxArea) * (chartHeight - 65));
    const x = startX + gap + idx * (barWidth + gap);
    const y = chartHeight - 30 - h;
    const color =
      r.severity === "VERY HIGH"
        ? "#ef4444"
        : r.severity === "HIGH"
        ? "#f97316"
        : "#38bdf8";

    areaSvg += `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${color}" rx="4">
        <title>${r.location_name} ${r.flood_year}: ${val} km² (${r.severity})</title>
      </rect>
      <text x="${x + barWidth / 2}" y="${y - 6}" font-size="10" font-weight="700" fill="#cbd5e1" text-anchor="middle">${val} km²</text>
      <text x="${x + barWidth / 2}" y="${chartHeight - 12}" font-size="10" fill="#94a3b8" text-anchor="middle">${r.flood_year}</text>
    `;
  });
  areaSvg += `</svg>`;
  areaContainer.innerHTML = areaSvg;

  // 2. Rainfall SVG Bar Chart
  const maxRain = Math.max(...sorted.map((r) => r.rainfall_mm || 100), 200);
  let rainSvg = `
    <svg viewBox="0 0 ${chartWidth} ${chartHeight}" style="width:100%; height:100%;">
      <line x1="20" y1="${chartHeight - 30}" x2="${chartWidth - 10}" y2="${chartHeight - 30}" stroke="#1e3a56" stroke-width="1"/>
  `;

  sorted.forEach((r, idx) => {
    const val = r.rainfall_mm || 0;
    const h = Math.max(6, (val / maxRain) * (chartHeight - 65));
    const x = startX + gap + idx * (barWidth + gap);
    const y = chartHeight - 30 - h;

    rainSvg += `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="#0284c7" rx="4">
        <title>${r.location_name} ${r.flood_year}: ${val} mm</title>
      </rect>
      <text x="${x + barWidth / 2}" y="${y - 6}" font-size="10" font-weight="700" fill="#38bdf8" text-anchor="middle">${val} mm</text>
      <text x="${x + barWidth / 2}" y="${chartHeight - 12}" font-size="10" fill="#94a3b8" text-anchor="middle">${r.flood_year}</text>
    `;
  });
  rainSvg += `</svg>`;
  rainContainer.innerHTML = rainSvg;

  // 3. Table Rows
  tableBody.innerHTML = sorted
    .map((r) => {
      const pillClass =
        r.severity === "VERY HIGH" || r.severity === "HIGH"
          ? "pill-high"
          : r.severity === "MEDIUM"
          ? "pill-medium"
          : "pill-low";
      return `
        <tr>
          <td><strong>${r.flood_year}</strong></td>
          <td>${r.flood_date}</td>
          <td><strong>${r.location_name}</strong></td>
          <td><strong>${r.flooded_area_km2 !== null ? `${r.flooded_area_km2} km²` : "--"}</strong></td>
          <td>${r.rainfall_mm !== null ? `${r.rainfall_mm} mm` : "--"}</td>
          <td>${r.duration_days !== null ? `${r.duration_days} days` : "--"}</td>
          <td><span class="alert-pill ${pillClass}">${r.severity}</span></td>
          <td><small style="color:var(--text-dim);">${r.source}</small></td>
        </tr>
      `;
    })
    .join("");
}

function renderAlerts(alerts: AlertRecord[], locId: number) {
  if (!alertsContainer || !alertCountBadge) return;

  const locAlerts = alerts.filter((a) => a.location_id === locId);

  if (locAlerts.length === 0) {
    alertCountBadge.textContent = "0 Active";
    alertsContainer.innerHTML = `
      <div class="state-box" style="grid-column: 1 / -1;">
        No alerts for this location.
      </div>
    `;
    return;
  }

  alertCountBadge.textContent = `${locAlerts.length} Active`;

  alertsContainer.innerHTML = locAlerts
    .map((a) => {
      const severityClass =
        a.alert_level === "HIGH" || a.alert_level === "CRITICAL"
          ? "high"
          : a.alert_level === "MEDIUM"
          ? "medium"
          : "low";

      const pillClass =
        a.alert_level === "HIGH" || a.alert_level === "CRITICAL"
          ? "pill-high"
          : a.alert_level === "MEDIUM"
          ? "pill-medium"
          : "pill-low";

      return `
        <div class="alert-card ${severityClass}">
          <div class="alert-card-header">
            <span class="alert-pill ${pillClass}">${a.alert_level} • ${a.alert_type}</span>
            <span class="alert-date">${a.alert_date}</span>
          </div>
          <p class="alert-message">${a.alert_message}</p>
          <div class="alert-footer">
            <span>Location: <strong>${a.location_name}</strong></span>
            <span>Status: <strong>${a.is_resolved ? "Resolved" : "Active Emergency"}</strong></span>
          </div>
        </div>
      `;
    })
    .join("");
}

function showLocationLoadingState(locationName: string) {
  floodedAreaElement.textContent = "Loading...";
  floodedAreaElement.className = "value no-data";
  floodExtentSubtitle.textContent = `Loading ${locationName} flood records...`;

  detectionConfidenceElement.textContent = "Loading...";
  detectionConfidenceElement.className = "value no-data";
  detectionMethodSubtitle.textContent = `Loading ${locationName} telemetry...`;

  satelliteObservationElement.textContent = "Loading...";
  satelliteObservationElement.className = "value no-data";
  satelliteMetaSubtitle.textContent = `Loading ${locationName} satellite observations...`;

  floodRiskElement.textContent = "Loading...";
  floodRiskElement.className = "value no-data";
  analysisStatusElement.textContent = `Loading ${locationName} risk model...`;

  affectedRegionsElement.textContent = "Loading...";
  affectedRegionsElement.className = "value no-data";
  if (regionsSubtitle) regionsSubtitle.textContent = `Loading ${locationName} sub-regions...`;

  mapRegionStatus.textContent = `Loading ${locationName} geospatial telemetry...`;

  if (alertsContainer) {
    alertsContainer.innerHTML = `<div class="state-box" style="grid-column: 1 / -1;">Loading alerts for ${locationName}...</div>`;
  }
  if (alertCountBadge) {
    alertCountBadge.textContent = "Loading...";
  }

  const areaContainer = document.querySelector<HTMLElement>("#chart-area-container");
  const rainContainer = document.querySelector<HTMLElement>("#chart-rainfall-container");
  const tableBody = document.querySelector<HTMLElement>("#history-table-body");

  if (areaContainer) areaContainer.innerHTML = `<div class="state-box">Loading historical data for ${locationName}...</div>`;
  if (rainContainer) rainContainer.innerHTML = `<div class="state-box">Loading historical data for ${locationName}...</div>`;
  if (tableBody) tableBody.innerHTML = `<tr><td colspan="8" class="state-box">Loading historical records for ${locationName}...</td></tr>`;

  riskScoreValue.textContent = "--";
  riskLevelBadge.textContent = "LOADING";
  riskLevelBadge.className = "alert-pill pill-medium";
  riskModelName.textContent = `Loading risk prediction for ${locationName}...`;

  const resetFactor = (el: HTMLElement | null) => {
    if (!el) return;
    el.textContent = "--";
    el.classList.add("no-data");
  };

  resetFactor(rfRainfall);
  resetFactor(rfAccumRain);
  resetFactor(rfTemperature);
  resetFactor(rfRiverDist);
  resetFactor(rfElevation);
  resetFactor(rfSlope);
  resetFactor(rfNdvi);
  resetFactor(rfNdwi);
  resetFactor(rfFreq);
  resetFactor(rfPriorArea);
}

// ======================================================
// LOCATION SYNC ORCHESTRATION
// ======================================================

async function selectMonitoredLocation(locationIdentifier: number | string) {
  const activeLoc = dbLocations.find(
    (l) =>
      l.location_id === Number(locationIdentifier) ||
      l.location_name.toLowerCase() === String(locationIdentifier).toLowerCase()
  );

  if (!activeLoc) {
    console.warn(`Location not found in database: ${locationIdentifier}`);
    return;
  }

  // Update central state
  selectedLocationId = activeLoc.location_id;
  selectedLocationName = activeLoc.location_name;
  selectedLatitude = activeLoc.latitude;
  selectedLongitude = activeLoc.longitude;

  if (dbLocationSelect) {
    dbLocationSelect.value = String(activeLoc.location_id);
  }
  if (comparisonLocationSelect) {
    comparisonLocationSelect.value = activeLoc.location_name;
  }

  // Show clear loading state
  showLocationLoadingState(activeLoc.location_name);

  // 1. Map & Meta Sync
  metaDistrict.textContent = activeLoc.district;
  metaState.textContent = activeLoc.state;
  metaCoords.textContent = `${activeLoc.latitude.toFixed(4)}° N, ${activeLoc.longitude.toFixed(4)}° E`;
  mapActiveCoords.textContent = `${activeLoc.latitude.toFixed(4)}° N, ${activeLoc.longitude.toFixed(4)}° E`;

  map.flyTo([activeLoc.latitude, activeLoc.longitude], 12, { duration: 1.2 });
  renderLocationPins(dbLocations, activeLoc.location_id);

  // 2. Satellite Observations (Filtered by LocationID)
  const locObservations = allObservations.filter(
    (s) => s.location_id === activeLoc.location_id
  );

  if (locObservations.length > 0) {
    const latest = locObservations[0];
    satelliteObservationElement.className = "value";
    satelliteObservationElement.textContent = `${latest.satellite} (${latest.sensor})`;
    const cloudTxt = latest.cloud_cover !== null ? ` • Cloud Cover ${latest.cloud_cover}%` : "";
    satelliteMetaSubtitle.textContent = `Acquired: ${latest.acquisition_date}${cloudTxt} • Product: ${latest.product_id} • Source: ${latest.data_source}`;
  } else {
    satelliteObservationElement.textContent = "No data available";
    satelliteObservationElement.className = "value no-data";
    satelliteMetaSubtitle.textContent = "No satellite observations available for this location.";
  }

  // 3. Flood Detections (Filtered by LocationID)
  const locFloods = allFloodDetections.filter(
    (f) => f.location_id === activeLoc.location_id
  );

  if (locFloods.length > 0) {
    const floodRecord = locFloods[0];
    floodedAreaElement.className = "value";
    floodedAreaElement.textContent = `${floodRecord.flooded_area_km2 ?? 0} km²`;
    floodExtentSubtitle.textContent = `Status: ${floodRecord.status} (${floodRecord.flood_percentage ?? 0}%) • ${floodRecord.satellite} ${floodRecord.sensor} (${floodRecord.detection_date})`;

    detectionConfidenceElement.className = "value";
    detectionConfidenceElement.textContent =
      floodRecord.confidence !== null ? `${Math.round(floodRecord.confidence * 100)}%` : "No data available";
    const methodDesc = floodRecord.detection_method === "SAR Threshold Baseline"
      ? "Prototype / Baseline Detection"
      : `${floodRecord.detection_method} [Prototype]`;
    detectionMethodSubtitle.textContent = methodDesc;
  } else {
    floodedAreaElement.textContent = "No data available";
    floodedAreaElement.className = "value no-data";
    floodExtentSubtitle.textContent = "No flood detection record available for this location.";

    detectionConfidenceElement.textContent = "No data available";
    detectionConfidenceElement.className = "value no-data";
    detectionMethodSubtitle.textContent = "No flood detection record available for this location.";
  }

  // 4. Flood Regions (Filtered by LocationID)
  const locRegions = allFloodRegions.filter(
    (r) => r.location_id === activeLoc.location_id
  );

  floodRegionsLayerGroup.clearLayers();

  if (locRegions.length > 0) {
    affectedRegionsElement.className = "value";
    affectedRegionsElement.textContent = String(locRegions.length);
    if (regionsSubtitle) regionsSubtitle.textContent = `${locRegions.length} database sub-regions recorded`;
    mapRegionStatus.textContent = `${locRegions.length} flood sub-regions mapped from database.`;
  } else {
    affectedRegionsElement.textContent = "No data available";
    affectedRegionsElement.className = "value no-data";
    if (regionsSubtitle) regionsSubtitle.textContent = "No database flood-region records available.";
    mapRegionStatus.textContent = "No database flood-region records available.";
  }

  // 5. Risk Predictions (Filtered by LocationID)
  const locRisks = allRiskPredictions.filter(
    (r) => r.location_id === activeLoc.location_id
  );

  let currentRiskLevel = "LOW";

  const setFactor = (el: HTMLElement | null, val: string | number | null, unit: string = "") => {
    if (!el) return;
    if (val !== null && val !== undefined && val !== "") {
      el.textContent = `${val}${unit ? ` ${unit}` : ""}`;
      el.classList.remove("no-data");
    } else {
      el.textContent = "No data available";
      el.classList.add("no-data");
    }
  };

  const clearFactor = (el: HTMLElement | null) => {
    if (!el) return;
    el.textContent = "No data available";
    el.classList.add("no-data");
  };

  if (locRisks.length > 0) {
    const riskRecord = locRisks[0];
    currentRiskLevel = riskRecord.risk_level;
    const scorePct = riskRecord.risk_score !== null ? Math.round(riskRecord.risk_score * 100) : null;

    floodRiskElement.textContent = riskRecord.risk_level;
    floodRiskElement.className = `value ${
      riskRecord.risk_level === "HIGH" || riskRecord.risk_level === "VERY HIGH"
        ? "risk-tag-high"
        : riskRecord.risk_level === "MEDIUM"
        ? "risk-tag-med"
        : "risk-tag-low"
    }`;
    analysisStatusElement.textContent = scorePct !== null ? `Prototype Risk Score: ${scorePct}%` : "Prototype Risk Score: --";

    riskScoreValue.textContent = scorePct !== null ? `${scorePct}%` : "--";
    riskLevelBadge.textContent = `${riskRecord.risk_level} RISK`;
    riskLevelBadge.className = `alert-pill ${
      riskRecord.risk_level === "HIGH" || riskRecord.risk_level === "VERY HIGH"
        ? "pill-high"
        : riskRecord.risk_level === "MEDIUM"
        ? "pill-medium"
        : "pill-low"
    }`;
    riskModelName.textContent = `Model: ${riskRecord.model_name} (Prediction Date: ${riskRecord.prediction_date})`;

    setFactor(rfRainfall, riskRecord.rainfall_mm, "mm");
    setFactor(rfAccumRain, riskRecord.accumulated_rainfall_mm, "mm");
    setFactor(rfTemperature, riskRecord.temperature_c, "°C");
    setFactor(rfRiverDist, riskRecord.river_distance_km, "km");
    setFactor(rfElevation, riskRecord.elevation_m, "m");
    setFactor(rfSlope, riskRecord.slope_degree, "°");
    setFactor(rfNdvi, riskRecord.ndvi);
    setFactor(rfNdwi, riskRecord.ndwi);
    setFactor(rfFreq, riskRecord.historical_flood_frequency, "events");
    setFactor(rfPriorArea, riskRecord.previous_flooded_area_km2, "km²");
  } else {
    floodRiskElement.textContent = "No data available";
    floodRiskElement.className = "value no-data";
    analysisStatusElement.textContent = "No risk prediction available for this location.";

    riskScoreValue.textContent = "--";
    riskLevelBadge.textContent = "N/A";
    riskLevelBadge.className = "alert-pill pill-low";
    riskModelName.textContent = "No risk prediction available for this location.";

    clearFactor(rfRainfall);
    clearFactor(rfAccumRain);
    clearFactor(rfTemperature);
    clearFactor(rfRiverDist);
    clearFactor(rfElevation);
    clearFactor(rfSlope);
    clearFactor(rfNdvi);
    clearFactor(rfNdwi);
    clearFactor(rfFreq);
    clearFactor(rfPriorArea);
  }

  // 6. Historical Floods & Charts (Filtered by LocationID)
  const locHistory = allHistoricalFloods.filter(
    (h) => h.location_id === activeLoc.location_id
  );
  renderHistoricalCharts(locHistory);

  // 7. Alerts (Filtered by LocationID)
  renderAlerts(allAlerts, activeLoc.location_id);

  // 8. Copernicus SAR Discovery (existing query)
  loadCopernicusSarAsset(activeLoc.location_name);

  // 9b. Sentinel-1 Product Discovery (new endpoint by location_id)
  loadSentinel1Discovery(activeLoc.location_id, activeLoc.location_name);

  // 9. Live Weather & Atmospheric Telemetry
  try {
    const weather = await fetchLiveWeather(activeLoc.latitude, activeLoc.longitude);
    temperatureElement.textContent = `${Math.round(weather.main.temp)}°C`;
    conditionElement.textContent = weather.weather?.[0]?.description || "Fair";

    const rainVal = weather.rain?.["1h"] ?? weather.rain?.["3h"] ?? 0;
    rainfallElement.textContent = `${rainVal} mm`;
    rainfallStatus.textContent = `OpenWeather 1h/3h precipitation (${activeLoc.location_name})`;

    const aqi = await fetchLiveAirQuality(activeLoc.latitude, activeLoc.longitude);
    const aqiLabels: Record<number, string> = {
      1: "Good",
      2: "Fair",
      3: "Moderate",
      4: "Poor",
      5: "Very Poor",
    };
    if (aqi) {
      airQualityElement.textContent = aqiLabels[aqi] || "Fair";
      airQualityStatus.textContent = `AQI Index Level ${aqi}`;
    } else {
      airQualityElement.textContent = "Fair";
      airQualityStatus.textContent = "AQI Normal";
    }

    updateInsightCard(Math.round(weather.main.temp), aqi, currentRiskLevel);
  } catch {
    temperatureElement.textContent = "--";
    conditionElement.textContent = "Weather API unavailable";
    airQualityElement.textContent = "--";
    updateInsightCard(28, null, currentRiskLevel);
  }
}

async function loadCopernicusSarAsset(locationName: string) {
  try {
    sarStatusElement.textContent = "Querying STAC...";
    sarDetailsElement.textContent = "Connecting to Copernicus Data Space...";

    const res = await queryCopernicusSarAsset(locationName, "2026-09-19");
    if (res && res.available) {
      sarStatusElement.textContent = "Available";
      sarDetailsElement.textContent = `VV • ${res.acquisition_date?.slice(0, 10) ?? "Found"} (Copernicus STAC)`;
      if (sysStatusStac) {
        sysStatusStac.innerHTML = `<span style="color:#10b981;">●</span> Status: Available`;
      }
    } else {
      sarStatusElement.textContent = "Not Available";
      sarDetailsElement.textContent = res?.message || "No scenes within STAC date range";
      if (sysStatusStac && res?.available === false) {
        // Query succeeded, just no scenes on that specific date
        sysStatusStac.innerHTML = `<span style="color:#10b981;">●</span> Status: Available`;
      }
    }
  } catch {
    sarStatusElement.textContent = "STAC Offline";
    sarDetailsElement.textContent = "Copernicus STAC query timeout";
  }
}

// ======================================================
// SENTINEL-1 PRODUCT DISCOVERY PANEL
// ======================================================

function renderSentinel1Products(data: Sentinel1ProductResponse) {
  const container = document.querySelector<HTMLElement>("#s1-products-container");
  const locationNameEl = document.querySelector<HTMLElement>("#s1-location-name");
  const productCountEl = document.querySelector<HTMLElement>("#s1-product-count");
  const statusBar = document.querySelector<HTMLElement>("#s1-discovery-status");

  if (!container) return;

  if (locationNameEl) {
    locationNameEl.textContent = data.location?.name || "--";
  }
  if (productCountEl) {
    productCountEl.textContent = String(data.count ?? 0);
  }

  if (data.count === 0) {
    container.innerHTML = `
      <div class="state-box">
        No Sentinel-1 products found for this location in the last
        ${data.query?.days ?? 7} days.
        <br><small style="color:var(--text-dim);">
          No Sentinel-1 products found for this location and time window.
        </small>
      </div>
    `;
    if (statusBar) {
      statusBar.style.display = "block";
      statusBar.className = "s1-discovery-status-bar s1-status-info";
      statusBar.textContent = `Copernicus STAC query completed — 0 products found for last ${data.query?.days ?? 7} days.`;
    }
    return;
  }

  if (statusBar) {
    statusBar.style.display = "block";
    statusBar.className = "s1-discovery-status-bar s1-status-success";
    statusBar.textContent = `Copernicus Data Space returned ${data.count} Sentinel-1 GRD product(s) — metadata only, no data downloaded.`;
  }

  container.innerHTML = data.products
    .map((p, i) => {
      const acqDate = p.acquisition_date ? p.acquisition_date.slice(0, 10) : "--";
      const productIdShort =
        p.product_id && p.product_id.length > 60
          ? p.product_id.slice(0, 57) + "..."
          : (p.product_id || "--");
      const bboxStr = p.bbox ? p.bbox.map((v) => v.toFixed(4)).join(", ") : "--";

      return `
        <div class="s1-product-card">
          <div class="s1-product-header">
            <span class="s1-product-index">#${i + 1}</span>
            <span class="s1-product-type">${p.product_type || "GRD"} · SAR</span>
            <span class="provenance-tag tag-stac" style="font-size:10px;">COPERNICUS DATA SPACE</span>
            <span class="provenance-tag tag-proto" style="font-size:10px; margin-left:4px;">DISCOVERY ONLY</span>
          </div>
          <div class="s1-product-grid">
            <div class="s1-field">
              <span class="s1-field-label">Product ID</span>
              <code class="s1-field-value" title="${p.product_id || ''}">${productIdShort}</code>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Acquisition Date</span>
              <span class="s1-field-value s1-date">${acqDate}</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Platform</span>
              <span class="s1-field-value">${p.platform || "--"}</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Product Type</span>
              <span class="s1-field-value">${p.product_type || "--"}</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Polarization</span>
              <span class="s1-field-value">${p.polarization || "--"}</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Orbit Direction</span>
              <span class="s1-field-value">${p.orbit_direction || "--"}</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Relative Orbit</span>
              <span class="s1-field-value">${p.relative_orbit !== null && p.relative_orbit !== undefined ? p.relative_orbit : "--"}</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Sensor Mode</span>
              <span class="s1-field-value">${p.sensor || "SAR"}</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Cloud Cover</span>
              <span class="s1-field-value s1-dim">N/A (SAR)</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Bounding Box</span>
              <span class="s1-field-value s1-dim" style="font-family:monospace; font-size:10px;">[${bboxStr}]</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Data Source</span>
              <span class="s1-field-value" style="color:var(--accent-blue);">${p.data_source}</span>
            </div>
            <div class="s1-field">
              <span class="s1-field-label">Download Status</span>
              <span class="s1-field-value s1-not-downloaded" id="s1-dl-badge-${i}">NOT DOWNLOADED</span>
            </div>
          </div>
          <div class="s1-product-footer">
            <div class="s1-product-footer-actions">
              <button 
                class="s1-download-btn" 
                id="s1-download-btn-${i}" 
                data-product-id="${p.product_id || ''}"
                data-location-id="${data.location?.location_id || selectedLocationId}"
                data-index="${i}"
              >
                📥 Download
              </button>
              <span class="s1-download-msg" id="s1-download-msg-${i}"></span>
            </div>
            ${p.stac_item_url ? `
            <a href="${p.stac_item_url}" target="_blank" rel="noopener noreferrer"
               class="s1-stac-link">
              🔗 View STAC Metadata
            </a>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  // Attach download button listeners to discovered cards
  const downloadBtns = container.querySelectorAll<HTMLButtonElement>(".s1-download-btn");
  downloadBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const prodId = btn.getAttribute("data-product-id");
      const locIdStr = btn.getAttribute("data-location-id");
      const idxStr = btn.getAttribute("data-index");
      if (!prodId) return;
      const locId = locIdStr ? parseInt(locIdStr, 10) : selectedLocationId;
      const idx = idxStr ? parseInt(idxStr, 10) : 0;
      handleInitiateSentinel1Download(prodId, locId, idx);
    });
  });
}

// ──────────────────────────────────────────────────────────────
// SENTINEL-1 CONTROLLED SINGLE-PRODUCT DOWNLOAD HANDLERS
// ──────────────────────────────────────────────────────────────

let pendingDownloadProductId: string | null = null;
let pendingDownloadLocationId: number | null = null;
let pendingDownloadCardIndex: number | null = null;
let isDownloadingSentinel1: boolean = false;

function closeSentinel1DownloadModal() {
  const modalEl = document.querySelector<HTMLElement>("#s1-download-modal");
  if (modalEl) modalEl.style.display = "none";
  pendingDownloadProductId = null;
  pendingDownloadLocationId = null;
  pendingDownloadCardIndex = null;
}

async function handleInitiateSentinel1Download(
  productId: string,
  locationId: number,
  cardIndex: number
) {
  if (isDownloadingSentinel1) {
    alert("A Sentinel-1 download is currently in progress. Please wait for it to complete.");
    return;
  }

  pendingDownloadProductId = productId;
  pendingDownloadLocationId = locationId;
  pendingDownloadCardIndex = cardIndex;

  const modalEl = document.querySelector<HTMLElement>("#s1-download-modal");
  const confirmProdIdEl = document.querySelector<HTMLElement>("#s1-confirm-product-id");
  const confirmSizeRowEl = document.querySelector<HTMLElement>("#s1-confirm-size-row");
  const confirmSizeValEl = document.querySelector<HTMLElement>("#s1-confirm-size-val");

  if (confirmProdIdEl) confirmProdIdEl.textContent = productId;
  if (confirmSizeRowEl) confirmSizeRowEl.style.display = "none";

  // Display confirmation modal before starting download
  if (modalEl) modalEl.style.display = "flex";

  // Pre-fetch product size asynchronously if available
  try {
    const info = await fetchSentinel1DownloadInfo(productId, locationId);
    if (info && info.expected_size_bytes && confirmSizeRowEl && confirmSizeValEl) {
      confirmSizeValEl.textContent = formatBytes(info.expected_size_bytes);
      confirmSizeRowEl.style.display = "flex";
    }
  } catch {
    // If size cannot be determined beforehand, modal still displays size warning
  }
}

async function handleProceedSentinel1Download() {
  const modalEl = document.querySelector<HTMLElement>("#s1-download-modal");
  if (modalEl) modalEl.style.display = "none";

  const productId = pendingDownloadProductId;
  const locationId = pendingDownloadLocationId;
  const cardIndex = pendingDownloadCardIndex;

  if (!productId || locationId === null || cardIndex === null) return;

  const btn = document.querySelector<HTMLButtonElement>(`#s1-download-btn-${cardIndex}`);
  const msgEl = document.querySelector<HTMLElement>(`#s1-download-msg-${cardIndex}`);
  const badgeEl = document.querySelector<HTMLElement>(`#s1-dl-badge-${cardIndex}`);

  // Transition to downloading state
  isDownloadingSentinel1 = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Downloading...";
  }
  if (msgEl) {
    msgEl.className = "s1-download-msg s1-dl-status s1-dl-loading";
    msgEl.textContent = "Downloading Sentinel-1 product...";
  }

  try {
    const result = await requestSentinel1Download(productId, locationId);

    if (result.status === "downloaded") {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "✓ Downloaded";
      }
      if (msgEl) {
        msgEl.className = "s1-download-msg s1-dl-status s1-dl-success";
        msgEl.textContent = "✓ Sentinel-1 product downloaded successfully.";
      }
      if (badgeEl) {
        badgeEl.className = "s1-field-value s1-downloaded";
        badgeEl.textContent = "COMPLETED";
      }
    } else if (result.status === "already_downloaded") {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "✓ Downloaded";
      }
      if (msgEl) {
        msgEl.className = "s1-download-msg s1-dl-status s1-dl-info";
        msgEl.textContent = "✓ Product already downloaded.";
      }
      if (badgeEl) {
        badgeEl.className = "s1-field-value s1-downloaded";
        badgeEl.textContent = "ALREADY EXISTS";
      }
    } else if (result.status === "authentication_failed") {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Download";
      }
      if (msgEl) {
        msgEl.className = "s1-download-msg s1-dl-status s1-dl-error";
        msgEl.textContent = "✕ Copernicus authentication failed.";
      }
    } else {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Download";
      }
      if (msgEl) {
        msgEl.className = "s1-download-msg s1-dl-status s1-dl-error";
        msgEl.textContent = "✕ Unable to download Sentinel-1 product.";
      }
    }
  } catch (err: any) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Download";
    }
    if (msgEl) {
      msgEl.className = "s1-download-msg s1-dl-status s1-dl-error";
      if (err?.response?.data?.status === "authentication_failed") {
        msgEl.textContent = "✕ Copernicus authentication failed.";
      } else {
        msgEl.textContent = "✕ Unable to download Sentinel-1 product.";
      }
    }
  } finally {
    isDownloadingSentinel1 = false;
    pendingDownloadProductId = null;
    pendingDownloadLocationId = null;
    pendingDownloadCardIndex = null;
  }
}

async function loadSentinel1Discovery(
  locationId: number,
  locationName: string
) {
  const container = document.querySelector<HTMLElement>("#s1-products-container");
  const locationNameEl = document.querySelector<HTMLElement>("#s1-location-name");
  const productCountEl = document.querySelector<HTMLElement>("#s1-product-count");
  const statusBar = document.querySelector<HTMLElement>("#s1-discovery-status");

  if (!container) return;

  // Show loading state
  if (locationNameEl) locationNameEl.textContent = locationName;
  if (productCountEl) productCountEl.textContent = "--";
  if (statusBar) statusBar.style.display = "none";
  container.innerHTML = `
    <div class="state-box">
      <div class="state-loading">
        <div class="spinner"></div>
        <span>Querying Copernicus Data Space for Sentinel-1 products near ${locationName}...</span>
      </div>
    </div>
  `;

  try {
    const data = await fetchSentinel1Products(locationId, 7);
    renderSentinel1Products(data);
  } catch (err: any) {
    if (statusBar) {
      statusBar.style.display = "block";
      statusBar.className = "s1-discovery-status-bar s1-status-error";
    }

    let errorMsg = "Unable to connect to EarthWatch AI backend.";
    let detail = "";

    if (err?.response?.status === 404) {
      errorMsg = "Location not found.";
      detail = `No Locations record for location_id=${locationId}.`;
    } else if (err?.response?.status === 502) {
      errorMsg = "Unable to retrieve Sentinel-1 products from Copernicus Data Space.";
      detail = err?.response?.data?.detail || "";
    } else if (!err?.response && (err?.code === "ERR_NETWORK" || err?.message?.includes("Network Error"))) {
      errorMsg = "Unable to connect to EarthWatch AI backend.";
      detail = "Ensure FastAPI backend is running on port 8000.";
    }

    if (statusBar) statusBar.textContent = errorMsg;

    container.innerHTML = `
      <div class="state-box" style="color:#ef4444;">
        <div style="font-size:14px; font-weight:700; margin-bottom:4px;">${errorMsg}</div>
        <small style="color:#94a3b8;">${detail || err?.message || ""}</small>
      </div>
    `;
  }
}

// ======================================================
// SAR PIPELINE STATUS LOADER
// ======================================================

function renderSarPipelineStages(stages: SarPipelineStage[]) {
  const container = document.querySelector<HTMLElement>("#sar-pipeline-stages");
  if (!container) return;

  const stageColors: Record<string, string> = {
    IMPLEMENTED:      "#10b981",
    FOUNDATION_READY: "#38bdf8",
    NOT_IMPLEMENTED:  "#64748b",
  };

  const stageIcons: Record<string, string> = {
    IMPLEMENTED:      "✅",
    FOUNDATION_READY: "🔷",
    NOT_IMPLEMENTED:  "⬜",
  };

  container.innerHTML = stages
    .map((s) => {
      const color = stageColors[s.status] || "#94a3b8";
      const icon  = stageIcons[s.status]  || "○";
      return `
        <div class="sar-pipeline-stage">
          <div class="sar-stage-header">
            <span class="sar-stage-num">Stage ${s.stage}</span>
            <span class="sar-stage-name">${s.name}</span>
            <span class="sar-stage-status" style="color:${color};">${icon} ${s.status.replace(/_/g, " ")}</span>
          </div>
          <p class="sar-stage-desc">${s.description}</p>
        </div>
      `;
    })
    .join("");
}

function renderSarRegistryTable(scenes: any[]) {
  const wrapper = document.querySelector<HTMLElement>("#sar-registry-table-wrapper");
  const tbody   = document.querySelector<HTMLElement>("#sar-registry-tbody");
  if (!wrapper || !tbody) return;

  if (scenes.length === 0) {
    wrapper.style.display = "none";
    return;
  }

  wrapper.style.display = "block";
  tbody.innerHTML = scenes
    .map((s) => {
      const productShort =
        s.id && s.id.length > 50 ? s.id.slice(0, 47) + "..." : (s.id || "--");
      const hasVv = s.vv_href ? "✅ VV Available" : "⚠️ No VV";
      const acqDate = s.acquisition_dt ? s.acquisition_dt.slice(0, 10) : "--";
      const discoveredAt = s.discovered_at ? s.discovered_at.slice(0, 19).replace("T", " ") : "--";
      return `
        <tr>
          <td><code style="font-size:11px;" title="${s.id || ''}">${productShort}</code></td>
          <td>${s.location || "--"}</td>
          <td>${acqDate}</td>
          <td>${s.platform || "--"}</td>
          <td><small style="color:${s.vv_href ? '#10b981' : '#f97316'};">${hasVv}</small></td>
          <td><span class="alert-pill pill-low" style="font-size:10px;">${s.status || "PENDING"}</span></td>
          <td><small style="color:var(--text-dim);">${discoveredAt} UTC</small></td>
        </tr>
      `;
    })
    .join("");
}

async function loadSarPipelineStatus() {
  const sysStatusSarPipeline = document.querySelector<HTMLElement>("#sys-status-sar-pipeline");
  const registryTotal   = document.querySelector<HTMLElement>("#sar-registry-total");
  const lastDiscovery   = document.querySelector<HTMLElement>("#sar-last-discovery");

  try {
    const summary = await fetchSarPipelineSummary();

    // System status card
    if (sysStatusSarPipeline) {
      sysStatusSarPipeline.innerHTML =
        `<span style="color:#38bdf8;">●</span> Foundation Ready · ${summary.total_scenes} scene(s) catalogued`;
    }

    // Info bar
    if (registryTotal) registryTotal.textContent = String(summary.total_scenes);
    if (lastDiscovery) {
      lastDiscovery.textContent = summary.last_discovery
        ? summary.last_discovery.slice(0, 19).replace("T", " ") + " UTC"
        : "Never";
    }

    // Stage cards
    renderSarPipelineStages(summary.pipeline_stages);

    // Registry table
    const scenes = await fetchSarRegistryScenes();
    renderSarRegistryTable(scenes);

  } catch {
    if (sysStatusSarPipeline) {
      sysStatusSarPipeline.innerHTML =
        `<span style="color:#94a3b8;">●</span> Status: Offline`;
    }
    const container = document.querySelector<HTMLElement>("#sar-pipeline-stages");
    if (container) {
      container.innerHTML = `<div class="state-box">SAR pipeline API unavailable. Ensure FastAPI backend is running.</div>`;
    }
  }
}

// ======================================================
// DISASTER REPORT SUMMARY GENERATOR
// ======================================================

function escapeHtml(text: any): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ======================================================
// COPERNICUS DATA SPACE AUTHENTICATION PANEL
// ======================================================

function renderCdseStatus(
  status: "not_configured" | "connected" | "authentication_failed" | "unavailable",
  message?: string
) {
  if (!cdseStatusText || !cdseStatusMessage) return;

  cdseStatusText.className = "cdse-status-text";

  switch (status) {
    case "connected":
      cdseStatusText.textContent = "✓ Connected";
      cdseStatusText.classList.add("status-connected");
      cdseStatusMessage.textContent =
        message || "Copernicus Data Space authentication successful.";
      break;

    case "authentication_failed":
      cdseStatusText.textContent = "✕ Authentication Failed";
      cdseStatusText.classList.add("status-failed");
      cdseStatusMessage.textContent =
        message || "Unable to authenticate with Copernicus Data Space.";
      break;

    case "unavailable":
      cdseStatusText.textContent = "✕ Backend Unavailable";
      cdseStatusText.classList.add("status-unavailable");
      cdseStatusMessage.textContent =
        "Unable to connect to EarthWatch AI backend.";
      break;

    case "not_configured":
    default:
      cdseStatusText.textContent = "● Not Configured";
      cdseStatusText.classList.add("status-not-configured");
      cdseStatusMessage.textContent =
        message || "Copernicus Data Space credentials are not configured.";
      break;
  }
}

async function loadCdseStatus(): Promise<void> {
  try {
    const data = await fetchCdseStatus();
    renderCdseStatus(data.status, data.message);
  } catch {
    renderCdseStatus("unavailable");
  }
}

async function handleTestCdseConnection(): Promise<void> {
  if (!cdseTestBtn) return;
  cdseTestBtn.disabled = true;
  const originalHtml = cdseTestBtn.innerHTML;
  cdseTestBtn.innerHTML = `<span>⏳ Testing...</span>`;

  try {
    const data = await testCdseAuth();
    renderCdseStatus(data.status, data.message);
  } catch {
    renderCdseStatus("unavailable");
  } finally {
    if (cdseTestBtn) {
      cdseTestBtn.disabled = false;
      cdseTestBtn.innerHTML = originalHtml;
    }
  }
}

function openCdseModal() {
  if (!cdseModal) return;
  cdseModal.style.display = "flex";
  loadCdseStatus().catch(() => {});
}

function closeCdseModal() {
  if (!cdseModal) return;
  cdseModal.style.display = "none";
}

async function openReportDossier() {
  if (!reportModal || !reportModalContent) return;

  reportModal.style.display = "flex";
  reportModalContent.innerHTML = `
    <div class="state-box">
      <div class="state-loading">
        <div class="spinner"></div>
        <span>Compiling structured disaster assessment report from database...</span>
      </div>
    </div>
  `;

  try {
    const reportResponse = await fetchReportSummary(selectedLocationId);
    const r = reportResponse.report;
    const loc = r.location;

    // 1. Satellite Observations
    const satHtml =
      r.satellite_observations && r.satellite_observations.length > 0
        ? r.satellite_observations
            .map(
              (s) =>
                `<div class="report-item">` +
                `• <strong>${escapeHtml(s.satellite)}</strong> (${escapeHtml(s.sensor)}) | ` +
                `Acquisition: ${escapeHtml(s.acquisition_date)} | Product ID: <code>${escapeHtml(s.product_id)}</code> | ` +
                `Cloud Cover: ${s.cloud_cover !== null && s.cloud_cover !== undefined ? s.cloud_cover + "%" : "N/A"} | ` +
                `Source: ${escapeHtml(s.data_source)}` +
                `</div>`
            )
            .join("")
        : `<p class="report-empty-text">No records available for this location.</p>`;

    // 2. Flood Detection
    const floodHtml =
      r.flood_detections && r.flood_detections.length > 0
        ? r.flood_detections
            .map(
              (f) =>
                `<div class="report-item">` +
                `• Status: <strong>${escapeHtml(f.status)}</strong> | ` +
                `Flooded Area: <strong>${f.flooded_area_km2 !== null && f.flooded_area_km2 !== undefined ? f.flooded_area_km2 + " km²" : "N/A"}</strong> | ` +
                `Flood Percentage: ${f.flood_percentage !== null && f.flood_percentage !== undefined ? f.flood_percentage + "%" : "N/A"} | ` +
                `Confidence: ${f.confidence !== null && f.confidence !== undefined ? Math.round(f.confidence * 100) + "%" : "N/A"} | ` +
                `Method: ${escapeHtml(f.detection_method)} | Source: ${escapeHtml(f.source)} | Date: ${escapeHtml(f.detection_date)}` +
                `</div>`
            )
            .join("")
        : `<p class="report-empty-text">No records available for this location.</p>`;

    // 3. Flood Regions (Affected Regions)
    const regionsHtml =
      r.flood_regions && r.flood_regions.length > 0
        ? r.flood_regions
            .map(
              (reg) =>
                `<div class="report-item">` +
                `• <strong>${escapeHtml(reg.region_name)}</strong> (${escapeHtml(reg.district)}) | ` +
                `Affected Area: <strong>${reg.affected_area_km2 !== null && reg.affected_area_km2 !== undefined ? reg.affected_area_km2 + " km²" : "N/A"}</strong> | ` +
                `Severity: <strong>${escapeHtml(reg.severity)}</strong> | ` +
                `Population Affected: ${reg.population_affected !== null && reg.population_affected !== undefined ? Number(reg.population_affected).toLocaleString() : "N/A"}` +
                `</div>`
            )
            .join("")
        : `<p class="report-empty-text">No records available for this location.</p>`;

    // 4. Risk Assessment
    const riskHtml =
      r.risk_predictions && r.risk_predictions.length > 0
        ? r.risk_predictions
            .map(
              (rp) =>
                `<div class="report-item">` +
                `• Risk Level: <strong>${escapeHtml(rp.risk_level)}</strong> | ` +
                `Prototype Risk Score: <strong>${rp.risk_score !== null && rp.risk_score !== undefined ? Math.round(rp.risk_score * 100) + "%" : "N/A"}</strong> | ` +
                `Model: ${escapeHtml(rp.model_name)} | Date: ${escapeHtml(rp.prediction_date)}<br>` +
                `&nbsp;&nbsp;Rainfall: ${rp.rainfall_mm !== null && rp.rainfall_mm !== undefined ? rp.rainfall_mm + " mm" : "N/A"} | ` +
                `Accumulated: ${rp.accumulated_rainfall_mm !== null && rp.accumulated_rainfall_mm !== undefined ? rp.accumulated_rainfall_mm + " mm" : "N/A"} | ` +
                `Temperature: ${rp.temperature_c !== null && rp.temperature_c !== undefined ? rp.temperature_c + "°C" : "N/A"} | ` +
                `Elevation: ${rp.elevation_m !== null && rp.elevation_m !== undefined ? rp.elevation_m + " m" : "N/A"} | ` +
                `Slope: ${rp.slope_degree !== null && rp.slope_degree !== undefined ? rp.slope_degree + "°" : "N/A"} | ` +
                `River Distance: ${rp.river_distance_km !== null && rp.river_distance_km !== undefined ? rp.river_distance_km + " km" : "N/A"}<br>` +
                `&nbsp;&nbsp;NDVI: ${rp.ndvi !== null && rp.ndvi !== undefined ? rp.ndvi : "N/A"} | ` +
                `NDWI: ${rp.ndwi !== null && rp.ndwi !== undefined ? rp.ndwi : "N/A"} | ` +
                `Historical Flood Frequency: ${rp.historical_flood_frequency !== null && rp.historical_flood_frequency !== undefined ? rp.historical_flood_frequency : "N/A"} | ` +
                `Previous Flooded Area: ${rp.previous_flooded_area_km2 !== null && rp.previous_flooded_area_km2 !== undefined ? rp.previous_flooded_area_km2 + " km²" : "N/A"}` +
                `</div>`
            )
            .join("")
        : `<p class="report-empty-text">No records available for this location.</p>`;

    // 5. Historical Floods
    const historyHtml =
      r.historical_floods && r.historical_floods.length > 0
        ? r.historical_floods
            .map(
              (h) =>
                `<div class="report-item">` +
                `• <strong>Year ${h.flood_year}</strong> (${escapeHtml(h.flood_date)}) | ` +
                `Flooded Area: <strong>${h.flooded_area_km2 !== null && h.flooded_area_km2 !== undefined ? h.flooded_area_km2 + " km²" : "N/A"}</strong> | ` +
                `Severity: <strong>${escapeHtml(h.severity)}</strong> | ` +
                `Rainfall: ${h.rainfall_mm !== null && h.rainfall_mm !== undefined ? h.rainfall_mm + " mm" : "N/A"} | ` +
                `Duration: ${h.duration_days !== null && h.duration_days !== undefined ? h.duration_days + " days" : "N/A"} | ` +
                `Source: ${escapeHtml(h.source)}<br>` +
                (h.description ? `&nbsp;&nbsp;<em>${escapeHtml(h.description)}</em>` : "") +
                `</div>`
            )
            .join("")
        : `<p class="report-empty-text">No records available for this location.</p>`;

    // 6. Alerts
    const alertsHtml =
      r.alerts && r.alerts.length > 0
        ? r.alerts
            .map(
              (a) =>
                `<div class="report-item">` +
                `• [${escapeHtml(a.alert_level)} • ${escapeHtml(a.alert_type)}] ` +
                `<strong>${escapeHtml(a.alert_message)}</strong> | ` +
                `Date: ${escapeHtml(a.alert_date)} | Status: <strong>${a.is_resolved ? "RESOLVED" : "ACTIVE"}</strong>` +
                `</div>`
            )
            .join("")
        : `<p class="report-empty-text">No records available for this location.</p>`;

    // Render Clean Comprehensive Document
    reportModalContent.innerHTML = `
      <div class="report-doc">
        <div class="report-header-banner">
          <div>
            <h2 style="margin:0 0 4px; font-size:22px; color:#38bdf8; font-weight:800; letter-spacing:0.5px;">EARTHWATCH AI</h2>
            <h3 style="margin:0 0 6px; font-size:16px; color:#f8fafc; font-weight:700;">DISASTER ASSESSMENT REPORT</h3>
            <p style="margin:0; font-size:13px; color:#94a3b8;">
              Location: <strong>${escapeHtml(loc.name)}</strong> | 
              District: <strong>${escapeHtml(loc.district)}</strong> | 
              State: <strong>${escapeHtml(loc.state)}</strong>
            </p>
            <p style="margin:2px 0 0; font-size:12px; color:#64748b;">
              Coordinates: <strong>${loc.latitude}° N, ${loc.longitude}° E</strong>
            </p>
          </div>
          <div style="text-align:right;">
            <span class="provenance-tag tag-db">SQL DATABASE</span><br>
            <small style="font-size:11px; color:#64748b;">Generated: ${escapeHtml(r.generated_at)}</small>
          </div>
        </div>

        <div class="report-section">
          <h4>SATELLITE OBSERVATIONS</h4>
          ${satHtml}
        </div>

        <div class="report-section">
          <h4>FLOOD DETECTION</h4>
          ${floodHtml}
        </div>

        <div class="report-section">
          <h4>AFFECTED REGIONS</h4>
          ${regionsHtml}
        </div>

        <div class="report-section">
          <h4>RISK ASSESSMENT</h4>
          ${riskHtml}
          <p style="margin:6px 0 0; font-size:11px; color:#64748b;">
            Note: Prototype Risk Score is an experimental predictive model and is not a scientifically certified meteorological probability.
          </p>
        </div>

        <div class="report-section">
          <h4>HISTORICAL FLOODS</h4>
          ${historyHtml}
        </div>

        <div class="report-section">
          <h4>ALERTS</h4>
          ${alertsHtml}
        </div>

        <div class="report-section" style="border-top:1px solid #1e3a56; padding-top:14px; margin-bottom:0;">
          <h4>DATA SOURCES</h4>
          <p style="font-size:12px; color:#94a3b8; margin:0 0 4px; line-height:1.5;">
            • <strong>Database Records:</strong> ${escapeHtml(r.data_provenance.database)}<br>
            • <strong>Satellite Discovery:</strong> ${escapeHtml(r.data_provenance.satellite)}<br>
            • <strong>Risk Model:</strong> ${escapeHtml(r.data_provenance.risk_model)}
          </p>
          <p style="font-size:11px; color:#64748b; margin:4px 0 0;">
            Data provenance notice: Database records reflect archived telemetry and historical events stored within EarthWatchAI SQL Server.
          </p>
        </div>
      </div>
    `;
  } catch (err: any) {
    let errorMsg = "Unable to generate disaster assessment report.";
    if (err?.response?.status === 404) {
      errorMsg = "Location not found.";
    } else if (!err?.response && (err?.code === "ERR_NETWORK" || err?.message?.includes("Network Error"))) {
      errorMsg = "Unable to connect to EarthWatch AI backend.";
    }

    reportModalContent.innerHTML = `
      <div class="state-box" style="color:#ef4444; padding:28px 20px;">
        <div style="font-size:16px; font-weight:700; margin-bottom:6px;">${errorMsg}</div>
        <small style="color:#94a3b8;">${err?.response?.data?.detail || err?.message || ""}</small>
      </div>
    `;
  }
}

// ======================================================
// SATELLITE COMPARISON (COPERNICUS STAC)
// ======================================================

/**
 * Clear all comparison state: hide images, reset placeholders,
 * reset dates/products/change stats. Prevents stale data.
 */
function clearComparisonState(mode: "reset" | "loading" | "error" = "reset") {
  // All four panel configs
  const panels = [
    { img: beforeSentinel1Image, placeholderId: "#before-s1-placeholder", dateEl: beforeS1DateElement, productEl: beforeS1ProductElement, icon: "🛰️", label: "Sentinel-1 Before" },
    { img: afterSentinel1Image, placeholderId: "#after-s1-placeholder", dateEl: afterS1DateElement, productEl: afterS1ProductElement, icon: "🛰️", label: "Sentinel-1 After" },
    { img: beforeSentinel2Image, placeholderId: "#before-s2-placeholder", dateEl: beforeS2DateElement, productEl: beforeS2ProductElement, icon: "🌍", label: "Sentinel-2 Before" },
    { img: afterSentinel2Image, placeholderId: "#after-s2-placeholder", dateEl: afterS2DateElement, productEl: afterS2ProductElement, icon: "🌍", label: "Sentinel-2 After" },
  ];

  for (const panel of panels) {
    // Hide image, clear src to prevent stale display
    if (panel.img) {
      panel.img.style.display = "none";
      panel.img.removeAttribute("src");
      panel.img.onload = null;
      panel.img.onerror = null;
    }

    // Show placeholder with appropriate message
    const placeholder = document.querySelector<HTMLElement>(panel.placeholderId);
    if (placeholder) {
      placeholder.style.display = "flex";
      if (mode === "loading") {
        placeholder.innerHTML = `
          <div class="state-loading"><div class="spinner"></div></div>
          <strong>${panel.label}</strong>
          <small>Searching Copernicus STAC...</small>
        `;
      } else if (mode === "error") {
        placeholder.innerHTML = `
          <span>⚠️</span>
          <strong>${panel.label}</strong>
          <small>Unable to retrieve satellite scenes.</small>
        `;
      } else {
        placeholder.innerHTML = `
          <span>${panel.icon}</span><strong>${panel.label}</strong>
          <small>Awaiting query</small>
        `;
      }
    }

    // Reset text
    if (panel.dateEl) panel.dateEl.textContent = "--";
    if (panel.productEl) panel.productEl.textContent = "--";
  }

  // Reset change stats
  if (changeAreaElement) changeAreaElement.textContent = "Evaluated on request";
  if (changePercentageElement) changePercentageElement.textContent = "--";
  if (changeStatusElement) changeStatusElement.textContent = mode === "loading" ? "LOADING..." : "AWAITING QUERY";

  // Hide status banner
  if (comparisonStatusBanner) comparisonStatusBanner.style.display = "none";
}

/**
 * Render a single comparison panel based on the backend scene data.
 * Each panel independently handles AVAILABLE / UNAVAILABLE states.
 */
function renderComparisonPanel(
  sceneData: any,
  img: HTMLImageElement | null,
  placeholderId: string,
  dateEl: HTMLElement | null,
  productEl: HTMLElement | null,
  icon: string,
  label: string,
  requestedDate: string | null
) {
  const placeholder = document.querySelector<HTMLElement>(placeholderId);

  // ---- UNAVAILABLE: no scene returned or available === false ----
  if (!sceneData || sceneData.available === false) {
    if (img) {
      img.style.display = "none";
      img.removeAttribute("src");
    }
    if (placeholder) {
      placeholder.style.display = "flex";
      const msg = sceneData?.message || "No matching Copernicus scene was returned for this date/location.";
      placeholder.innerHTML = `
        <span style="font-size:24px; opacity:0.5;">🚫</span>
        <strong style="color:var(--text-muted);">Scene unavailable</strong>
        <small style="max-width:200px; text-align:center;">${msg}</small>
      `;
    }
    if (dateEl) dateEl.textContent = "N/A";
    if (productEl) productEl.textContent = "N/A";
    return;
  }

  // ---- AVAILABLE ----
  // Date: always use actual acquisition date from API
  if (dateEl) {
    const actualDate = sceneData.date;
    if (actualDate && requestedDate && actualDate !== requestedDate) {
      dateEl.textContent = `${actualDate} (nearest)`;
    } else if (actualDate) {
      dateEl.textContent = actualDate;
    } else {
      dateEl.textContent = "Date unknown";
    }
  }

  // Product ID
  if (productEl) {
    productEl.textContent = sceneData.product || "Unknown";
    // Truncate long product IDs for display
    if (productEl.textContent.length > 60) {
      productEl.title = productEl.textContent;
      productEl.textContent = productEl.textContent.slice(0, 57) + "...";
    }
  }

  // Image
  const imageUrl = sceneData.image_url;
  if (!img || !imageUrl) {
    // Scene is available in STAC catalogue but no preview image
    if (img) {
      img.style.display = "none";
      img.removeAttribute("src");
    }
    if (placeholder) {
      placeholder.style.display = "flex";
      placeholder.innerHTML = `
        <span>${icon}</span>
        <strong style="color:var(--text-muted);">Scene found — no preview</strong>
        <small>STAC record exists but no thumbnail asset available.</small>
      `;
    }
    return;
  }

  // Set up image loading with proper error handling
  // Keep image hidden until loaded
  img.style.display = "none";
  img.onload = () => {
    img.style.display = "block";
    if (placeholder) placeholder.style.display = "none";
  };
  img.onerror = () => {
    img.style.display = "none";
    img.removeAttribute("src");
    if (placeholder) {
      placeholder.style.display = "flex";
      placeholder.innerHTML = `
        <span>⚠️</span>
        <strong style="color:var(--text-muted);">Image load failed</strong>
        <small>The satellite image could not be loaded from Copernicus.</small>
      `;
    }
  };
  img.alt = label;
  img.src = imageUrl;
}

/**
 * Process the full /api/compare response.
 * Validates each scene independently and renders the change analysis
 * only when the backend provides valid data.
 */
function displaySatelliteImages(data: any) {
  // Guard: check if response indicates an error at the top level
  if (data.status === "satellite_api_error" || data.status === "invalid_request" || data.status === "error") {
    clearComparisonState("error");
    if (comparisonStatusBanner) {
      comparisonStatusBanner.style.display = "block";
      comparisonStatusBanner.className = "comparison-status-banner comparison-status-error";
      comparisonStatusBanner.textContent = data.message || "Unable to retrieve satellite scenes.";
    }
    if (changeAreaElement) changeAreaElement.textContent = data.message || "Error";
    if (changeStatusElement) changeStatusElement.textContent = data.change?.status || "ERROR";
    return;
  }

  // Extract scene data — handle empty objects from error responses
  const beforeS1 = data.before?.sentinel_1 || null;
  const afterS1 = data.after?.sentinel_1 || null;
  const beforeS2 = data.before?.sentinel_2 || null;
  const afterS2 = data.after?.sentinel_2 || null;

  const requestedBeforeDate = data.before?.requested_date || null;
  const requestedAfterDate = data.after?.requested_date || null;

  // Render each panel independently
  renderComparisonPanel(beforeS1, beforeSentinel1Image, "#before-s1-placeholder", beforeS1DateElement, beforeS1ProductElement, "🛰️", "Sentinel-1 Before", requestedBeforeDate);
  renderComparisonPanel(afterS1, afterSentinel1Image, "#after-s1-placeholder", afterS1DateElement, afterS1ProductElement, "🛰️", "Sentinel-1 After", requestedAfterDate);
  renderComparisonPanel(beforeS2, beforeSentinel2Image, "#before-s2-placeholder", beforeS2DateElement, beforeS2ProductElement, "🌍", "Sentinel-2 Before", requestedBeforeDate);
  renderComparisonPanel(afterS2, afterSentinel2Image, "#after-s2-placeholder", afterS2DateElement, afterS2ProductElement, "🌍", "Sentinel-2 After", requestedAfterDate);

  // Render change analysis — only from backend data
  const change = data?.change;
  if (changeAreaElement) {
    changeAreaElement.textContent = change?.message || "Evaluated on request";
  }
  if (changePercentageElement) {
    const p = change?.change_percentage;
    if (p !== null && p !== undefined && Number.isFinite(Number(p))) {
      changePercentageElement.textContent = `${Number(p).toFixed(2)}%`;
    } else {
      changePercentageElement.textContent = "N/A";
    }
  }
  if (changeStatusElement) {
    const status = change?.status || "INSUFFICIENT_DATA";
    changeStatusElement.textContent = status;
    // Color-code the status
    if (status === "HIGH_CHANGE") {
      changeStatusElement.style.color = "var(--risk-high)";
    } else if (status === "MODERATE_CHANGE") {
      changeStatusElement.style.color = "var(--risk-med)";
    } else if (status === "LOW_CHANGE" || status === "STABLE") {
      changeStatusElement.style.color = "var(--risk-low)";
    } else {
      changeStatusElement.style.color = "var(--text-muted)";
    }
  }

  // Show success banner
  if (comparisonStatusBanner) {
    comparisonStatusBanner.style.display = "block";
    comparisonStatusBanner.className = "comparison-status-banner comparison-status-success";
    comparisonStatusBanner.textContent = `Comparison completed for ${data.location || "selected location"} — ${data.message || ""}`;
  }
}

// ======================================================
// EVENT LISTENERS & INITIALIZATION
// ======================================================

// Database Location Select
dbLocationSelect?.addEventListener("change", (e) => {
  const val = (e.target as HTMLSelectElement).value;
  if (val) {
    selectMonitoredLocation(val);
  }
});

// City Geocoding Search
locationButton?.addEventListener("click", async () => {
  const query = locationInput.value.trim();
  if (!query) return;

  locationButton.disabled = true;
  locationButton.textContent = "Searching...";

  try {
    const res = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${API_KEY}`
    );
    const results = await res.json();
    if (!results || results.length === 0) {
      alert(`Location "${query}" not found.`);
      return;
    }

    const { lat, lon, name, state, country } = results[0];
    metaDistrict.textContent = name;
    metaState.textContent = state || country;
    metaCoords.textContent = `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`;

    map.flyTo([lat, lon], 12);
    selectMonitoredLocation(name);
  } catch (err) {
    console.error("Geocoding failed", err);
    alert("Geocoding request failed. Please check network.");
  } finally {
    locationButton.disabled = false;
    locationButton.textContent = "Search City";
  }
});

locationInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    locationButton.click();
  }
});

// Quick Action Buttons
detectFloodButton?.addEventListener("click", () => {
  selectMonitoredLocation(selectedLocationName);
  const mapSec = document.querySelector(".map-section");
  mapSec?.scrollIntoView({ behavior: "smooth" });
});

compareButton?.addEventListener("click", () => {
  const compSec = document.querySelector("#comparison-section");
  compSec?.scrollIntoView({ behavior: "smooth" });
});

riskButton?.addEventListener("click", () => {
  const riskSec = document.querySelector("#risk-section");
  riskSec?.scrollIntoView({ behavior: "smooth" });
});

historyButton?.addEventListener("click", () => {
  const histSec = document.querySelector("#history-section");
  histSec?.scrollIntoView({ behavior: "smooth" });
});

alertsButton?.addEventListener("click", () => {
  const alertSec = document.querySelector("#alert-center-section");
  alertSec?.scrollIntoView({ behavior: "smooth" });
});

reportActionBtn?.addEventListener("click", openReportDossier);
generateReportBtn?.addEventListener("click", openReportDossier);

closeReportBtn?.addEventListener("click", () => {
  if (reportModal) reportModal.style.display = "none";
});

// Copernicus Data Space Listeners
openCdseBtn?.addEventListener("click", openCdseModal);
cdseActionBtn?.addEventListener("click", openCdseModal);
closeCdseBtn?.addEventListener("click", closeCdseModal);
cdseTestBtn?.addEventListener("click", handleTestCdseConnection);

cdseModal?.addEventListener("click", (e) => {
  if (e.target === cdseModal) {
    closeCdseModal();
  }
});

// Sentinel-1 Download Modal Listeners
const closeS1DlBtn = document.querySelector<HTMLButtonElement>("#close-s1-download-btn");
const cancelS1DlBtn = document.querySelector<HTMLButtonElement>("#s1-download-cancel-btn");
const proceedS1DlBtn = document.querySelector<HTMLButtonElement>("#s1-download-proceed-btn");
const s1DlModal = document.querySelector<HTMLElement>("#s1-download-modal");

closeS1DlBtn?.addEventListener("click", closeSentinel1DownloadModal);
cancelS1DlBtn?.addEventListener("click", closeSentinel1DownloadModal);
proceedS1DlBtn?.addEventListener("click", handleProceedSentinel1Download);

s1DlModal?.addEventListener("click", (e) => {
  if (e.target === s1DlModal) {
    closeSentinel1DownloadModal();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (cdseModal && cdseModal.style.display !== "none") {
      closeCdseModal();
    }
    if (reportModal && reportModal.style.display !== "none") {
      reportModal.style.display = "none";
    }
    if (s1DlModal && s1DlModal.style.display !== "none") {
      closeSentinel1DownloadModal();
    }
  }
});

printReportBtn?.addEventListener("click", () => {
  window.print();
});

// Satellite Comparison Loader
loadComparisonButton?.addEventListener("click", async () => {
  const loc = comparisonLocationSelect?.value?.trim() || selectedLocationName;
  const bDate = beforeDateInput.value;
  const aDate = afterDateInput.value;

  if (!loc || !bDate || !aDate) {
    alert("Please select location and both before/after dates.");
    return;
  }

  // 1. Disable button and show loading
  loadComparisonButton.disabled = true;
  loadComparisonButton.textContent = "🛰️ Searching Copernicus STAC...";

  // 2. Clear all previous comparison state and show loading in panels
  clearComparisonState("loading");

  try {
    const res = await axios.get(`${BACKEND_URL}/compare`, {
      params: { location: loc, before_date: bDate, after_date: aDate },
    });
    // 3. Validate and render response
    displaySatelliteImages(res.data);
    if (sysStatusStac) {
      sysStatusStac.innerHTML = `<span style="color:#10b981;">●</span> Status: Available`;
    }
  } catch (err) {
    console.error("Compare error", err);
    if (sysStatusStac) {
      sysStatusStac.innerHTML = `<span style="color:#ef4444;">●</span> Status: Unavailable`;
    }
    // 4. Show error state in all panels (not an alert that blocks the UI)
    clearComparisonState("error");
    if (comparisonStatusBanner) {
      comparisonStatusBanner.style.display = "block";
      comparisonStatusBanner.className = "comparison-status-banner comparison-status-error";
      comparisonStatusBanner.textContent = "Unable to retrieve satellite scenes. Please check your network connection and try again.";
    }
    if (changeAreaElement) changeAreaElement.textContent = "Request failed";
    if (changeStatusElement) {
      changeStatusElement.textContent = "ERROR";
      changeStatusElement.style.color = "var(--risk-high)";
    }
  } finally {
    loadComparisonButton.disabled = false;
    loadComparisonButton.textContent = "🛰️ Query Satellite Scenes";
  }
});

// SAR Discover Button
document.querySelector<HTMLButtonElement>("#sar-discover-btn")?.addEventListener("click", async () => {
  const btn = document.querySelector<HTMLButtonElement>("#sar-discover-btn");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "⏳ Discovering...";
  try {
    const today = new Date().toISOString().slice(0, 10);
    await triggerSarDiscovery("bhubaneswar", today);
    await loadSarPipelineStatus();
    btn.textContent = "✅ Discovery Done — Refreshed";
    setTimeout(() => { btn.textContent = "🔍 Run Scene Discovery (Bhubaneswar)"; }, 3000);
  } catch {
    btn.textContent = "❌ Discovery Failed";
    setTimeout(() => { btn.textContent = "🔍 Run Scene Discovery (Bhubaneswar)"; }, 3000);
  } finally {
    btn.disabled = false;
  }
});

// Sentinel-1 Product Discovery Refresh Button
document.querySelector<HTMLButtonElement>("#s1-refresh-btn")?.addEventListener("click", async () => {
  const btn = document.querySelector<HTMLButtonElement>("#s1-refresh-btn");
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "⏳ Querying...";
  try {
    await loadSentinel1Discovery(selectedLocationId, selectedLocationName);
    btn.textContent = "✅ Refreshed";
    setTimeout(() => { btn.textContent = "🔍 Refresh Discovery"; }, 2500);
  } catch {
    btn.textContent = "❌ Query Failed";
    setTimeout(() => { btn.textContent = "🔍 Refresh Discovery"; }, 2500);
  } finally {
    btn.disabled = false;
  }
});

// ======================================================
// BOOTSTRAP APPLICATION
// ======================================================

async function initializeEarthWatch() {
  try {
    // 1. Check Backend Health
    const healthRes = await axios.get(`${BACKEND_URL}/health`);
    if (healthRes.data?.status === "ok") {
      systemStatusIndicator.textContent = "System Online";
      systemStatusIndicator.style.color = "#10b981";
    }

    // 2. Fetch all database datasets concurrently
    const [locations, observations, floods, regions, risks, history, alerts] =
      await Promise.all([
        fetchDbLocations(),
        fetchDbSatelliteObservations(),
        fetchDbFloodDetections(),
        fetchDbFloodRegions(),
        fetchDbRiskPredictions(),
        fetchDbHistoricalFloods(),
        fetchDbAlerts(),
      ]);

    dbLocations = locations;
    allObservations = observations;
    allFloodDetections = floods;
    allFloodRegions = regions;
    allRiskPredictions = risks;
    allHistoricalFloods = history;
    allAlerts = alerts;

    if (sysStatusDb) {
      sysStatusDb.innerHTML = `<span style="color:#10b981;">●</span> Status: Connected`;
    }
    if (sysStatusReport) {
      sysStatusReport.innerHTML = `<span style="color:#10b981;">●</span> Status: Available`;
    }
    if (sysStatusRisk) {
      sysStatusRisk.innerHTML = `<span style="color:#fbbf24;">●</span> Status: Prototype`;
    }

    // 3. Populate Database Location Selector
    if (dbLocations.length > 0) {
      // Monitored locations generated directly from GET /api/database/locations using location_id
      dbLocationSelect.innerHTML = dbLocations
        .map(
          (loc) =>
            `<option value="${loc.location_id}">${loc.location_name} (${loc.district})</option>`
        )
        .join("");

      // Comparison section queries specific STAC coordinates by location name
      if (comparisonLocationSelect) {
        comparisonLocationSelect.innerHTML = dbLocations
          .map(
            (loc) =>
              `<option value="${loc.location_name}">${loc.location_name} (${loc.district})</option>`
          )
          .join("");
      }

      // Default to first monitored location from database
      const firstLoc = dbLocations[0];
      selectedLocationId = firstLoc.location_id;
      selectedLocationName = firstLoc.location_name;
      selectedLatitude = firstLoc.latitude;
      selectedLongitude = firstLoc.longitude;
      dbLocationSelect.value = String(firstLoc.location_id);
      if (comparisonLocationSelect) {
        comparisonLocationSelect.value = firstLoc.location_name;
      }
      await selectMonitoredLocation(firstLoc.location_id);
    } else {
      dbLocationSelect.innerHTML = `<option value="">No locations in database</option>`;
      if (comparisonLocationSelect) {
        comparisonLocationSelect.innerHTML = `<option value="">No locations in database</option>`;
      }
    }
    // Load SAR pipeline status (non-blocking — fires after main init)
    loadSarPipelineStatus().catch(() => {});

    // Load Sentinel-1 product discovery for initial location (non-blocking)
    loadSentinel1Discovery(
      selectedLocationId,
      selectedLocationName
    ).catch(() => {});

    // Prime Copernicus Data Space authentication status (non-blocking)
    loadCdseStatus().catch(() => {});

  } catch (error) {
    console.error("EarthWatch initialization error:", error);
    systemStatusIndicator.textContent = "Backend Offline / Check SQL Server";
    systemStatusIndicator.style.color = "#ef4444";
    alertsContainer.innerHTML = `
      <div class="state-box" style="color:#ef4444; grid-column:1/-1;">
        Unable to connect to EarthWatch AI FastAPI backend or SQL Server database.<br>
        Ensure FastAPI is running on port 8000.
      </div>
    `;
  }
}

// Start application
initializeEarthWatch();
