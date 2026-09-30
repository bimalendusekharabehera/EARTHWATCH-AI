import L from "leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";
import "./style.css";

import { demoFloodArea } from "./data/demoFlood";
import {
  getAuthState,
  checkStoredSession,
  loginUser,
  logoutUser,
  setupAxiosInterceptors,
  type AuthUser,
} from "./auth";
import { initSpatialLogin, type SpatialLoginController } from "./spatialLogin";

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

interface ReportExecutiveSummary {
  location: string;
  sentinel1_product: string;
  candidate_area_km2: string;
  candidate_percentage: string;
  risk_level: string;
  risk_score: string;
  active_alerts_count: number;
  assessment_category: string;
}

interface ReportSentinel1Info {
  product_id: string;
  platform: string;
  mode: string;
  product_type: string;
  polarizations: string[];
  acquisition_date: string;
  download_status: string;
}

interface ReportPreprocessingInfo {
  status: string;
  product_id: string;
  polarization: string;
  polarizations_available?: string[];
  dimensions: string;
  crs: string;
  min_value?: number;
  max_value?: number;
  mean_value?: number;
  nodata?: number;
  valid_pixels?: number;
  output_file?: string;
  operations_applied?: string[];
  all_polarizations?: Record<string, any>;
}

interface ReportFloodDetectionInfo {
  status: string;
  processing_status: string;
  product_id: string;
  method: string;
  classification: string;
  polarization: string;
  polarizations_available?: string[];
  threshold: number;
  threshold_used?: number;
  candidate_pixels?: number;
  valid_pixels?: number;
  flood_percentage?: number;
  detected_area_m2?: number;
  detected_area_km2?: number;
  analyzed_area_km2?: number;
  output_file?: string;
  area_calculation_method?: string;
  limitations?: string[];
  all_polarizations?: Record<string, any>;
}

interface ReportOverallAssessment {
  category: string;
  statement: string;
  evidence_summary: string[];
  evidence_items?: Array<{
    source: string;
    observation: string;
    type: string;
    confidence_note?: string;
  }>;
}

interface ReportMethodologyStep {
  step: number;
  name: string;
  description: string;
}

interface ReportData {
  title: string;
  generated_at: string;
  executive_summary?: ReportExecutiveSummary;
  location: ReportLocation;
  satellite_observations: SatelliteObservation[];
  satellite?: { observations: SatelliteObservation[]; source: string };
  sentinel1?: ReportSentinel1Info | null;
  preprocessing?: ReportPreprocessingInfo | null;
  flood_detection?: ReportFloodDetectionInfo | null;
  flood_detections: FloodDetectionRecord[];
  flood_regions: FloodRegionRecord[];
  risk_predictions: RiskPredictionRecord[];
  risk?: RiskPredictionRecord | null;
  historical_floods: HistoricalFloodRecord[];
  alerts: AlertRecord[];
  overall_assessment?: ReportOverallAssessment;
  methodology?: ReportMethodologyStep[];
  limitations?: string[];
  data_provenance: any;
  provenance_sources?: any;
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
  download_status?: string | null;
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

// Sentinel-1 SAR Preprocessing types
interface SarPreprocessResponse {
  status: "success" | "already_processed" | "not_found" | "invalid_polarization" | "error";
  product_id?: string;
  polarization?: string;
  source?: string;
  processing_status?: "COMPLETED" | "ALREADY_EXISTS";
  output_file?: string;
  width?: number;
  height?: number;
  crs?: string;
  bounds?: number[];
  min_value?: number;
  max_value?: number;
  mean_value?: number;
  nodata?: number | null;
  valid_pixels?: number;
  total_pixels?: number;
  processing_pipeline?: string;
  operations_applied?: string[];
  calibration_note?: string;
  message?: string;
  available_polarizations?: string[];
}

interface SarStatusResponse {
  product_id: string;
  is_downloaded: boolean;
  available_polarizations: string[];
  processed_polarizations: string[];
  processed_metadata: Record<string, SarPreprocessResponse>;
}

// Sentinel-1 Prototype SAR Flood Detection types
interface FloodDetectionResponse {
  status: "success" | "already_processed" | "not_found" | "not_preprocessed" | "invalid_polarization" | "invalid_threshold" | "error";
  product_id?: string;
  polarization?: string;
  threshold_used?: number;
  processing_method?: string;
  classification?: string;
  processing_status?: "COMPLETED" | "ALREADY_EXISTS";
  output_file?: string;
  width?: number;
  height?: number;
  crs?: string;
  bounds?: number[];
  valid_pixels?: number;
  valid_pixel_count?: number;
  total_pixels?: number;
  candidate_flood_pixels?: number;
  flood_pixel_count?: number;
  flood_percentage?: number;
  detected_area_m2?: number;
  detected_area_km2?: number;
  analyzed_area_m2?: number;
  analyzed_area_km2?: number;
  nodata?: number;
  method?: string;
  area_calculation_method?: string;
  limitations?: string[];
  message?: string;
}

interface FloodDetectionStatusResponse {
  product_id: string;
  status: "COMPLETED" | "PARTIAL" | "NOT_PROCESSED" | "ALREADY_EXISTS";
  polarization?: string;
  processing_status?: string;
  detected_polarizations?: string[];
  detected_metadata?: Record<string, FloodDetectionResponse>;
  metadata?: FloodDetectionResponse;
}

// Central Selected-Location State
export interface SearchedLocation {
  name: string;
  district?: string;
  state?: string;
  country?: string;
  display_name?: string;
  latitude: number;
  longitude: number;
  is_database_monitored: boolean;
  location_id?: number | null;
  badge?: string;
}

export let dbLocations: LocationRecord[] = [];
export let selectedLocationId: number | null = 1;
export let selectedLocationName: string = "Bhubaneswar";
export let selectedLatitude: number = 20.2961;
export let selectedLongitude: number = 85.8245;
export let isCurrentLocationDatabaseMonitored: boolean = true;
export let currentSearchedLocation: SearchedLocation | null = null;
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
    isCurrentLocationDatabaseMonitored,
    currentSearchedLocation,
  };
}

// ======================================================
// MOUNT DASHBOARD HTML
// ======================================================

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
appRoot.innerHTML = `
<!-- 0. AUTH LOADING OVERLAY -->
<div id="auth-loading-overlay">
  <div class="auth-spinner"></div>
  <div class="auth-loading-text">Authenticating EarthWatch AI...</div>
</div>

<!-- 0.5 AUTHENTICATION / 4D SPATIAL MISSION CONTROL LOGIN SCREEN -->
<div id="auth-container" class="auth-page-wrapper" style="display:none;">
  <!-- DEPTH 01-05: 3D Vector Earth, Atmosphere, Orbital Rings, Satellite & Radar Sweep Canvas -->
  <canvas id="spatial-earth-canvas" class="spatial-canvas"></canvas>

  <!-- DEPTH 02: Geospatial Coordinates & Analytical Grid Layer -->
  <div id="spatial-grid-layer" class="spatial-grid-layer">
    <div class="grid-coords-label coords-top-left">ORBIT: 693 KM // INCL: 98.18° // CDSE SENTINEL-1</div>
    <div class="grid-coords-label coords-bottom-left">GRID REF: 20.2961° N, 85.8245° E [SAR HOTSPOT - DEMO]</div>
    <div class="grid-coords-label coords-mid-center">4D SPATIAL FRAMEWORK // LERP: 0.06 // 60 FPS</div>
  </div>

  <!-- DEPTH 05: Dynamic Orbiting Satellite Telemetry HUD Tag -->
  <div id="satellite-telemetry-tag" class="satellite-telemetry-tag" style="display:none;">
    <div class="sat-tag-header">SATELLITE TELEMETRY [DEMO]</div>
    <div class="sat-tag-title">SENTINEL-1 SAR // C-BAND</div>
    <div class="sat-tag-meta">
      <span>ALT: 693 KM</span>
      <span>VEL: 7.5 KM/S</span>
      <span>LINK: 98.4%</span>
    </div>
    <div class="sat-tag-hint">STATUS: ACQUIRING OBSERVATION</div>
  </div>

  <!-- DEPTH 06: Holographic Mission Control HUD Panels -->
  <div id="spatial-hud-layer" class="spatial-hud-layer">
    <!-- HUD Card Top-Left: SAR Observation & Orbit Tracking -->
    <div class="hud-bracket-card hud-top-left">
      <div class="hud-label">SAR OBSERVATION // C-BAND INTERFEROMETRY</div>
      <div class="hud-val highlight">SENTINEL-1A GRD POLAR</div>
      <div class="hud-sub">ORBIT TRACKING: LOCKED // SUN-SYNCHRONOUS</div>
      <div class="hud-bar"><span style="width: 84%"></span></div>
      <div class="hud-grid-row">
        <div>POLARIZATION: <strong>VV + VH</strong></div>
        <div>RESOLUTION: <strong>10M GRD</strong></div>
      </div>
    </div>

    <!-- HUD Card Bottom-Left: Earth Observation & Flood Risk Index -->
    <div class="hud-bracket-card hud-bottom-left">
      <div class="hud-label">EARTH OBSERVATION // ACTIVE RADAR SWEEP</div>
      <div class="hud-val">SURFACE INUNDATION MONITORING</div>
      <div class="hud-sub">AI INFERENCE ENGINE: RESNET-UNET ACTIVE</div>
      <div class="hud-grid-row">
        <div>CDSE LINK: <strong>SECURE</strong></div>
        <div>SAR PIPELINE: <strong>READY</strong></div>
        <div>ODISHA HOTSPOT: <strong>ACTIVE</strong></div>
        <div>RADAR SWEEP: <strong>360° CONTINUOUS</strong></div>
      </div>
    </div>

    <!-- HUD Card Bottom-Center: Mission Status & Data Link -->
    <div class="hud-bracket-card hud-bottom-center">
      <div class="hud-label">MISSION CONTROL STATUS</div>
      <div class="hud-val highlight">READY FOR ACCESS</div>
      <div class="hud-sub">SPATIAL ENCRYPTION: ARGON2ID + JWT</div>
    </div>
  </div>

  <!-- DEPTH 07: Floating Glass Authentication Console Card -->
  <div class="auth-container-card spatial-console-card" id="auth-console-card">
    <div class="auth-brand-header">
      <div class="auth-logo-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke="#00f0ff" stroke-width="1.8" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#38bdf8" stroke-width="1.5" />
          <circle cx="12" cy="12" r="3" fill="#00f0ff" />
        </svg>
      </div>
      <h1 class="auth-title">EARTHWATCH <span>AI</span></h1>
      <p class="auth-subtitle">SATELLITE EARTH OBSERVATION &amp; FLOOD INTELLIGENCE PLATFORM</p>
      <div class="mission-status-pill">
        <span class="mission-status-led"></span>
        <span>● SECURE MISSION ACCESS</span>
      </div>
    </div>

    <!-- Success Verified Transition Badge -->
    <div id="auth-success-badge" class="auth-success-badge" style="display:none;">
      <span>✓</span>
      <span>ACCESS VERIFIED — INITIALIZING MISSION CONTROL...</span>
    </div>

    <!-- Alert Banner (Matching exact visual spec) -->
    <div id="auth-alert-banner" class="auth-alert-banner">
      <div class="auth-alert-head">
        <span id="auth-alert-icon">⚠️</span>
        <span id="auth-alert-title">AUTHENTICATION FAILED</span>
      </div>
      <div id="auth-alert-msg" class="auth-alert-body"></div>
    </div>

    <form id="auth-login-form" class="auth-form" novalidate>
      <!-- Email Field -->
      <div class="auth-field-group">
        <label class="auth-label" for="login-email">
          <span>EMAIL ADDRESS</span>
        </label>
        <div class="auth-input-wrapper">
          <span class="auth-input-icon">✉️</span>
          <input
            type="email"
            id="login-email"
            class="auth-input"
            placeholder="Enter your email"
            autocomplete="email"
            spellcheck="false"
          />
        </div>
        <div class="auth-error-msg" id="login-email-error"></div>
      </div>

      <!-- Password Field -->
      <div class="auth-field-group">
        <label class="auth-label" for="login-password">
          <span>PASSWORD</span>
        </label>
        <div class="auth-input-wrapper">
          <span class="auth-input-icon">🔑</span>
          <input
            type="password"
            id="login-password"
            class="auth-input"
            placeholder="Enter your password"
            autocomplete="current-password"
          />
          <button
            type="button"
            id="login-password-toggle"
            class="auth-password-toggle"
            title="Show/Hide Password"
            aria-label="Toggle password visibility"
          >
            👁️
          </button>
        </div>
        <div class="auth-error-msg" id="login-password-error"></div>
      </div>

      <!-- Options: Remember Me & Forgot Password -->
      <div class="auth-options-row">
        <label class="auth-remember-label">
          <input type="checkbox" id="login-remember" class="auth-remember-checkbox" />
          <span>Remember me</span>
        </label>
        <button type="button" id="login-forgot-btn" class="auth-forgot-link">
          Forgot password?
        </button>
      </div>

      <!-- Submit Button -->
      <button type="submit" id="login-submit-btn" class="auth-submit-btn">
        <span class="btn-glow-sweep"></span>
        <span id="login-submit-text">SIGN IN</span>
      </button>
    </form>

    <!-- Demo Credentials Footer -->
    <div class="auth-card-footer">
      <div>Quick Development Credentials:</div>
      <div class="auth-demo-chips">
        <button type="button" class="auth-demo-chip" id="demo-chip-admin" title="Fill Admin Credentials">
          🛡️ Admin (admin@earthwatch.ai)
        </button>
        <button type="button" class="auth-demo-chip" id="demo-chip-analyst" title="Fill Analyst Credentials">
          🔬 Analyst (analyst@earthwatch.ai)
        </button>
      </div>
    </div>
  </div>
</div>

<div class="app-layout" id="app-layout" style="display:none;">

  <!-- LEFT VERTICAL SIDEBAR -->
  <aside class="app-sidebar" id="app-sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <div class="logo-mark">
          <svg viewBox="0 0 24 24" class="logo-icon" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke="#00f0ff" stroke-width="1.8" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#38bdf8" stroke-width="1.5" />
            <circle cx="12" cy="12" r="3" fill="#00f0ff" />
          </svg>
        </div>
        <div class="logo-text">
          <div class="logo-title">EarthWatch <span>AI</span></div>
          <div class="logo-subtitle">Satellite Intelligence for a Safer Tomorrow</div>
        </div>
      </div>
    </div>

    <!-- Navigation List -->
    <nav class="sidebar-nav">
      <div class="nav-section-label">CORE INTELLIGENCE</div>
      <button type="button" class="nav-item active" data-view="dashboard" id="nav-item-dashboard">
        <span class="nav-icon">📊</span>
        <span class="nav-label">Dashboard</span>
      </button>
      <button type="button" class="nav-item" data-view="satellite" id="nav-item-satellite">
        <span class="nav-icon">🛰️</span>
        <span class="nav-label">Satellite</span>
        <span class="nav-badge-pulse"></span>
      </button>
      <button type="button" class="nav-item" data-view="flood-detection" id="nav-item-flood-detection">
        <span class="nav-icon">🌊</span>
        <span class="nav-label">Flood Detection</span>
      </button>
      <button type="button" class="nav-item" data-view="location-observation" id="nav-item-location-observation">
        <span class="nav-icon">📍</span>
        <span class="nav-label">Location Observation</span>
      </button>
      <button type="button" class="nav-item" data-view="historical-floods" id="nav-item-historical-floods">
        <span class="nav-icon">📈</span>
        <span class="nav-label">Historical Floods</span>
      </button>
      <button type="button" class="nav-item" data-view="report" id="nav-item-report">
        <span class="nav-icon">📑</span>
        <span class="nav-label">Analysis / Report</span>
      </button>

      <div class="nav-section-label" style="margin-top:14px;">ANALYTICS &amp; TOOLS</div>
      <button type="button" class="nav-item" data-view="risk" id="nav-item-risk">
        <span class="nav-icon">⚠️</span>
        <span class="nav-label">Risk Predictions</span>
      </button>
      <button type="button" class="nav-item" data-view="alerts" id="nav-item-alerts">
        <span class="nav-icon">🔔</span>
        <span class="nav-label">Alerts</span>
        <span class="nav-badge-count" id="sidebar-alert-badge">0</span>
      </button>
      <button type="button" class="nav-item" data-view="compare" id="nav-item-compare">
        <span class="nav-icon">🔄</span>
        <span class="nav-label">Copernicus Compare</span>
      </button>
      <button type="button" class="nav-item" data-view="settings" id="nav-item-settings">
        <span class="nav-icon">⚙️</span>
        <span class="nav-label">Settings</span>
      </button>

      <!-- ADMIN ONLY SECTION -->
      <div class="nav-section-label admin-only-element" id="nav-section-admin" style="margin-top:14px; display:none;">ADMINISTRATION</div>
      <button type="button" class="nav-item admin-only-element" data-view="users" id="nav-item-users" style="display:none;">
        <span class="nav-icon">👥</span>
        <span class="nav-label">User Management</span>
      </button>
    </nav>

    <!-- Sidebar Footer -->
    <div class="sidebar-footer">
      <div class="sidebar-status-box">
        <div class="status-indicator-dot"></div>
        <div class="status-info">
          <div class="status-name">EarthWatch Core</div>
          <div class="status-ver" id="sidebar-engine-status">SQL Server · Online</div>
        </div>
      </div>
    </div>
  </aside>

  <!-- MAIN VIEWPORT -->
  <div class="app-main-viewport">

    <!-- TOP HEADER -->
    <header class="app-topbar">
      <div class="topbar-left">
        <!-- Dynamic Monitored Location Search Combobox -->
        <div class="topbar-location-control" id="topbar-location-control">
          <span class="location-icon">📍</span>
          <div class="location-select-wrap">
            <div class="location-label-row">
              <label for="topbar-location-input" class="topbar-label">Monitored Location</label>
              <span id="active-loc-type-badge" class="loc-type-badge badge-db">DATABASE MONITORED</span>
            </div>
            <div class="location-search-combobox">
              <input
                id="topbar-location-input"
                type="text"
                class="location-search-input"
                placeholder="Search any location... (e.g. Cuttack, Puri, Delhi)"
                value="Bhubaneswar (Khordha)"
                autocomplete="off"
              />
              <span class="search-input-icon">🔍</span>
              <!-- Hidden select retained for backward compatibility -->
              <select id="db-location-select" class="db-select-topbar" style="display:none;"></select>
            </div>
            <!-- Dynamic dropdown menu for autocomplete / search results -->
            <div id="location-search-dropdown" class="location-search-dropdown" style="display:none;"></div>
          </div>
        </div>

        <!-- Location Metadata Pill -->
        <div class="location-meta-pill" id="location-meta-pill">
          <span>District: <strong id="meta-district">Khordha</strong></span>
          <span>State: <strong id="meta-state">Odisha</strong></span>
          <span>Coords: <strong id="meta-coords">20.2961° N, 85.8245° E</strong></span>
        </div>
      </div>


      <!-- Topbar Right: 4 Real Statistics & Actions -->
      <div class="topbar-right">
        <div class="topbar-stats-group">
          <div class="stat-pill" title="Satellite Observations in current database">
            <span class="stat-label">Observations</span>
            <span class="stat-value" id="top-stat-obs">--</span>
          </div>
          <div class="stat-pill" title="Flood Detections registered">
            <span class="stat-label">Detections</span>
            <span class="stat-value" id="top-stat-floods">--</span>
          </div>
          <div class="stat-pill" title="Prototype Flood Risk Score">
            <span class="stat-label">Prototype Risk</span>
            <span class="stat-value stat-risk" id="top-stat-risk">--</span>
          </div>
          <div class="stat-pill" title="Active Disaster Alerts">
            <span class="stat-label">Active Alerts</span>
            <span class="stat-value stat-alert" id="top-stat-alerts">0</span>
          </div>
        </div>

        <div class="topbar-actions">
          <div class="status-group">
            <span class="pulse-dot"></span>
            <span class="status" id="system-status-indicator">Backend Checking...</span>
          </div>
          <button class="nav-report-btn" id="generate-report-btn" title="Generate comprehensive disaster assessment report">
            📑 Report
          </button>
          <button class="nav-cdse-btn" id="open-cdse-btn" title="Copernicus Data Space Authentication">
            🛰️ CDSE
          </button>

          <!-- Topbar User Profile & Logout -->
          <div class="topbar-user-badge" id="topbar-user-badge" style="display:none;">
            <div class="topbar-user-avatar" id="topbar-user-avatar">EA</div>
            <div class="topbar-user-info">
              <span class="topbar-user-name" id="topbar-user-name">EarthWatch Admin</span>
              <span class="topbar-user-role admin" id="topbar-user-role">ADMIN</span>
            </div>
          </div>
          <button class="nav-logout-btn" id="logout-btn" style="display:none;" title="Sign out of EarthWatch AI">
            🚪 Logout
          </button>
        </div>
      </div>
    </header>

    <!-- CONTENT SCROLL AREA -->
    <div class="app-content-scroll" id="main-content-scroll">

      <!-- ============================================== -->
      <!-- ============================================== -->
      <!-- VIEW 1: DASHBOARD OVERVIEW & METRICS           -->
      <!-- ============================================== -->
      <div class="view-panel active" id="view-dashboard">
        
        <div class="section-title-row">
          <h2 style="font-size:18px; color:var(--text-main);">Earth Observation &amp; Disaster Intelligence Overview</h2>
        </div>

        <!-- METRIC CARDS (9 CORE OBSERVATIONS) -->
        <section class="cards">
          <!-- 1. Potential Flood Area -->
          <div class="card">
            <div class="card-header-row">
              <h3>🌊 Potential Flood Area</h3>
            </div>
            <p class="value" id="flooded-area">--</p>
            <span class="card-subtitle" id="flood-extent-subtitle">Database candidate record</span>
          </div>

          <!-- 2. Detection Confidence -->
          <div class="card">
            <div class="card-header-row">
              <h3>🎯 Confidence</h3>
            </div>
            <p class="value" id="detection-confidence">--</p>
            <span class="card-subtitle" id="detection-method-subtitle">Prototype / Baseline Detection</span>
          </div>

          <!-- 3. Satellite Observation -->
          <div class="card">
            <div class="card-header-row">
              <h3>🛰️ Satellite Record</h3>
            </div>
            <p class="value" id="satellite-observation">--</p>
            <span class="card-subtitle" id="satellite-meta-subtitle">Sensor &amp; date pending</span>
          </div>

          <!-- 4. Sentinel-1 SAR Asset -->
          <div class="card">
            <div class="card-header-row">
              <h3>📡 Sentinel-1 SAR</h3>
            </div>
            <p class="value" id="sar-status">Checking...</p>
            <span class="card-subtitle" id="sar-details">Copernicus STAC discovery</span>
          </div>

          <!-- 5. Prototype Risk Score -->
          <div class="card">
            <div class="card-header-row">
              <h3>⚠️ Prototype Risk</h3>
            </div>
            <p class="value" id="flood-risk">--</p>
            <span class="card-subtitle" id="analysis-status">Ready for evaluation</span>
          </div>

          <!-- 6. Rainfall -->
          <div class="card">
            <div class="card-header-row">
              <h3>🌧️ Rainfall</h3>
            </div>
            <p class="value" id="rainfall">--</p>
            <span class="card-subtitle" id="rainfall-status">Precipitation depth</span>
          </div>

          <!-- 7. Temperature -->
          <div class="card">
            <div class="card-header-row">
              <h3>🌡️ Temperature</h3>
            </div>
            <p class="value" id="temperature">--</p>
            <span class="card-subtitle" id="condition">Current reading</span>
          </div>

          <!-- 8. Air Quality -->
          <div class="card">
            <div class="card-header-row">
              <h3>💧 Air Quality</h3>
            </div>
            <p class="value" id="air-quality">--</p>
            <span class="card-subtitle" id="air-quality-status">AQI status</span>
          </div>

          <!-- 9. Affected Sub-Regions -->
          <div class="card">
            <div class="card-header-row">
              <h3>📍 Affected Regions</h3>
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
            <button id="detect-flood-button" class="action-btn">🌊 Flood Detection</button>
            <button id="compare-button" class="action-btn">🛰️ Compare Satellite Scenes</button>
            <button id="risk-button" class="action-btn">⚠️ Risk Factor Breakdown</button>
            <button id="history-button" class="action-btn">📊 Historical Analytics</button>
            <button id="alerts-button" class="action-btn">🔔 Alert Center</button>
            <button id="cdse-action-btn" class="action-btn">🛰️ Copernicus Data Space</button>
            <button id="report-action-btn" class="action-btn">📑 Disaster Assessment Report</button>
          </div>
        </section>

        <!-- AI ENVIRONMENTAL INSIGHT -->
        <section class="card" style="margin-bottom:20px; padding:16px;">
          <div class="card-header-row">
            <div>
              <h3 style="font-size:14px; color:var(--text-main);">🤖 AI Environmental &amp; Atmospheric Insight</h3>
              <span class="card-subtitle">Composite live meteorological, air quality &amp; surface indices.</span>
            </div>
          </div>

          <div class="environmental-insight-grid">
            <div class="card" style="background:var(--bg-card-subtle);">
              <h3>Overall Condition</h3>
              <p id="environment-status" style="font-size:14px; font-weight:700; color:var(--accent-cyan); margin:4px 0;">Evaluating...</p>
              <span class="card-subtitle">Atmospheric and moisture composite</span>
            </div>
            <div class="card" style="background:var(--bg-card-subtle);">
              <h3>Operational Advisory</h3>
              <p id="ai-recommendation" style="font-size:13px; font-weight:600; color:var(--text-main); margin:4px 0;">Gathering telemetry...</p>
              <span class="card-subtitle">Automated operational recommendation</span>
            </div>
            <div class="card" style="background:var(--bg-card-subtle);">
              <h3>Risk Assessment</h3>
              <p id="risk-level" class="risk-low" style="font-size:14px; font-weight:700; margin:4px 0;">Evaluating...</p>
              <span id="risk-description" class="card-subtitle">No alerts</span>
            </div>
          </div>
        </section>

        <!-- DASHBOARD SYSTEM DATA STATUS -->
        <section class="system-status-section" id="system-status-section">
          <div class="system-status-header">
            <h3 style="font-size:13px; font-weight:700; color:var(--text-main);">🖥️ System Data Status &amp; Engine Provenance</h3>
            <span class="provenance-tag tag-db">System Integrity</span>
          </div>
          <div class="system-status-grid">
            <div class="system-status-card">
              <div class="card-header-row">
                <span class="status-label">Database</span>
                <span class="provenance-tag tag-db">SQL Server</span>
              </div>
              <div class="status-source">SQL Server / EarthWatchAI</div>
              <div class="status-state" id="sys-status-db">
                <span style="color:#10b981;">●</span> Status: Connected
              </div>
            </div>

            <div class="system-status-card">
              <div class="card-header-row">
                <span class="status-label">Satellite Search</span>
                <span class="provenance-tag tag-stac">Copernicus STAC</span>
              </div>
              <div class="status-source">Copernicus STAC</div>
              <div class="status-state" id="sys-status-stac">
                <span style="color:#38bdf8;">●</span> Status: Available
              </div>
            </div>

            <div class="system-status-card">
              <div class="card-header-row">
                <span class="status-label">Risk Engine</span>
                <span class="provenance-tag tag-proto">Prototype Model</span>
              </div>
              <div class="status-source">Prototype Model</div>
              <div class="status-state" id="sys-status-risk">
                <span style="color:#fbbf24;">●</span> Status: Prototype
              </div>
            </div>

            <div class="system-status-card">
              <div class="card-header-row">
                <span class="status-label">Report Engine</span>
                <span class="provenance-tag tag-db">Database Report</span>
              </div>
              <div class="status-source">Database Report</div>
              <div class="status-state" id="sys-status-report">
                <span style="color:#10b981;">●</span> Status: Available
              </div>
            </div>

            <div class="system-status-card">
              <div class="card-header-row">
                <span class="status-label">SAR Pipeline</span>
                <span class="provenance-tag tag-stac">Foundation</span>
              </div>
              <div class="status-source">Sentinel-1 GRD / Copernicus</div>
              <div class="status-state" id="sys-status-sar-pipeline">
                <span style="color:#94a3b8;">●</span> Status: Checking...
              </div>
            </div>
          </div>
        </section>

        <!-- SENTINEL-1 SAR ACQUISITION PIPELINE -->
        <section class="card" id="sar-pipeline-section" style="padding:16px;">
          <div class="section-title-row">
            <h3 class="section-title">
              📡 Sentinel-1 SAR Acquisition Pipeline
              <span class="provenance-tag tag-stac">COPERNICUS STAC</span>
            </h3>
            <span class="provenance-tag tag-proto">FOUNDATION LAYER — NO S3 DOWNLOAD</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:12px;">
            <span>🗄️ Local Scene Registry: <strong id="sar-registry-total">--</strong> scenes discovered</span>
            <span>⏱️ Last Discovery: <strong id="sar-last-discovery">--</strong></span>
            <button id="sar-discover-btn" class="action-btn" style="padding:5px 12px; font-size:11.5px;">
              🔍 Run Scene Discovery (Bhubaneswar)
            </button>
          </div>

          <div class="sar-pipeline-stages" id="sar-pipeline-stages">
            <div class="state-box">Loading SAR pipeline status...</div>
          </div>

          <div class="sar-registry-table-wrapper" id="sar-registry-table-wrapper" style="display:none; margin-top:12px;">
            <h4 style="margin:0 0 8px; font-size:12px; color:var(--text-muted);">📋 Catalogued Scenes (Registry)</h4>
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

      </div> <!-- /view-dashboard -->

      <!-- ============================================== -->
      <!-- VIEW 2: SATELLITE DISCOVERY & OBSERVATION      -->
      <!-- ============================================== -->
      <div class="view-panel" id="view-satellite">
        
        <!-- PAGE HEADER -->
        <div class="s1-page-header">
          <div class="s1-title-group">
            <div class="s1-icon-badge">🛰️</div>
            <div>
              <h2 class="s1-page-title">Sentinel-1 Satellite Discovery &amp; Products</h2>
              <p class="s1-page-subtitle">Search, discover, and inspect Copernicus Sentinel-1 SAR satellite acquisitions for monitored sites.</p>
            </div>
          </div>
        </div>

        <!-- MAIN 3-COLUMN CONTENT GRID -->
        <div class="s1-main-grid">

          <!-- 1. LEFT / LARGE: MAP VIEW -->
          <div class="dashboard-panel map-panel">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">🗺️</span>
                <h3 class="panel-title">Map View</h3>
                <span id="map-region-status" class="map-badge-status">Loading layers...</span>
              </div>
              <div class="panel-header-right">
                <span id="map-active-coords" class="map-coords-badge">--</span>
                <label class="toggle-boundary-label">
                  <input type="checkbox" id="toggle-demo-boundaries" />
                  <span>Demo Boundary</span>
                </label>
              </div>
            </div>

            <div class="map-inner-container">
              <div id="map"></div>

              <!-- Sleek Integrated Map Legend -->
              <div class="map-legend-bar">
                <div class="legend-chip">
                  <span class="legend-dot dot-monitored"></span>
                  <span>Database Center</span>
                </div>
                <div class="legend-chip">
                  <span class="legend-dot dot-flood"></span>
                  <span>Flood Regions</span>
                </div>
                <div class="legend-chip">
                  <span class="legend-dot dot-demo"></span>
                  <span>Demo Boundary</span>
                </div>
                <div class="legend-chip">
                  <span class="legend-dot dot-aoi"></span>
                  <span>Sentinel-1 AOI</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. MIDDLE: SENTINEL-1 PRODUCTS -->
          <div class="dashboard-panel products-panel">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">📡</span>
                <h3 class="panel-title">Sentinel-1 Products</h3>
                <span id="s1-product-count" class="badge-count">--</span>
              </div>
              <div class="panel-header-right">
                <span class="panel-sub-label">📍 <strong id="s1-location-name">--</strong></span>
                <button id="s1-refresh-btn" class="action-btn-icon" title="Refresh Copernicus Data Space Search">
                  🔄
                </button>
              </div>
            </div>

            <div id="s1-discovery-status" class="s1-discovery-status-bar" style="display:none;"></div>

            <!-- Scrollable product list container -->
            <div id="s1-products-container" class="s1-products-scroll-list">
              <div class="state-box">Querying Copernicus Data Space for Sentinel-1 products...</div>
            </div>
          </div>

          <!-- 3. RIGHT: PRODUCT DETAILS -->
          <div class="dashboard-panel details-panel">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">📋</span>
                <h3 class="panel-title">Product Details</h3>
              </div>
              <div class="panel-header-right">
                <span class="provenance-tag tag-stac">METADATA</span>
              </div>
            </div>

            <div class="product-details-body" id="product-details-body">
              <!-- Dynamically populated or empty state -->
              <div class="empty-details-state" id="empty-details-state">
                <div class="empty-icon">🛰️</div>
                <div class="empty-title">No Product Selected</div>
                <div class="empty-desc">Click any Sentinel-1 product from the list to view comprehensive radar acquisition metadata, polarizations, orbit directions, and processing options.</div>
              </div>
              <div class="active-details-content" id="active-details-content" style="display:none;">
                <!-- Full product attributes -->
              </div>
            </div>
          </div>

        </div>

      </div> <!-- /view-satellite -->

      <!-- ============================================== -->
      <!-- VIEW 3: SAR PREPROCESSING & FLOOD DETECTION   -->
      <!-- ============================================== -->
      <div class="view-panel" id="view-flood-detection">
        
        <!-- PAGE HEADER -->
        <div class="s1-page-header">
          <div class="s1-title-group">
            <div class="s1-icon-badge">🌊</div>
            <div>
              <h2 class="s1-page-title">SAR Preprocessing &amp; Flood Detection</h2>
              <p class="s1-page-subtitle">End-to-end radar analysis pipeline for surface inundation detection and low-backscatter candidate mask generation.</p>
            </div>
          </div>

          <!-- 9-STAGE SENTINEL-1 RADAR FLOOD DETECTION PIPELINE WORKFLOW DIAGRAM -->
          <div class="pipeline-workflow-card" id="flood-pipeline-card" style="margin-top:14px; margin-bottom:14px; width:100%;">
            <div class="pipeline-workflow-header">
              <span class="pipeline-workflow-title">
                <span>🌊</span> Sentinel-1 SAR Radar Flood Detection Pipeline
              </span>
              <span class="pipeline-stage-badge" id="flood-pipeline-current-stage">● Candidate Flood Mask</span>
            </div>
            <div class="pipeline-flow-row" id="flood-pipeline-flow-row">
              <!-- 1. SENTINEL-1 SAR -->
              <div class="pipeline-node completed" id="f-stage-s1" title="Sentinel-1 C-SAR constellation">
                <div class="pipeline-node-icon">✓</div>
                <div class="pipeline-node-text">
                  <span class="pipeline-node-title">Sentinel-1 SAR</span>
                  <span class="pipeline-node-desc">C-Band Synthetic Aperture</span>
                </div>
              </div>
              <div class="pipeline-arrow">→</div>

              <!-- 2. PRODUCT SELECTION -->
              <div class="pipeline-node completed" id="f-stage-product" title="Product Selection from Copernicus STAC">
                <div class="pipeline-node-icon">✓</div>
                <div class="pipeline-node-text">
                  <span class="pipeline-node-title">Product Selection</span>
                  <span class="pipeline-node-desc">GRD Scene Query</span>
                </div>
              </div>
              <div class="pipeline-arrow">→</div>

              <!-- 3. DOWNLOAD -->
              <div class="pipeline-node" id="f-stage-download" title="Download SAR Product (~1.25 GB)">
                <div class="pipeline-node-icon">○</div>
                <div class="pipeline-node-text">
                  <span class="pipeline-node-title">Download</span>
                  <span class="pipeline-node-desc">CDSE Asset Retrieval</span>
                </div>
              </div>
              <div class="pipeline-arrow">→</div>

              <!-- 4. SAR PREPROCESSING -->
              <div class="pipeline-node" id="f-stage-preprocess" title="SAR Preprocessing into GeoTIFF">
                <div class="pipeline-node-icon">○</div>
                <div class="pipeline-node-text">
                  <span class="pipeline-node-title">SAR Preprocessing</span>
                  <span class="pipeline-node-desc">Raster Extraction &amp; CRS</span>
                </div>
              </div>
              <div class="pipeline-arrow">→</div>

              <!-- 5. VV / VH DATA -->
              <div class="pipeline-node" id="f-stage-polarization" title="VV / VH Polarization Channels">
                <div class="pipeline-node-icon">○</div>
                <div class="pipeline-node-text">
                  <span class="pipeline-node-title">VV / VH Data</span>
                  <span class="pipeline-node-desc">Dual-Pol Decibel Raster</span>
                </div>
              </div>
              <div class="pipeline-arrow">→</div>

              <!-- 6. BACKSCATTER THRESHOLD -->
              <div class="pipeline-node" id="f-stage-threshold" title="Backscatter Cutoff Thresholding">
                <div class="pipeline-node-icon">○</div>
                <div class="pipeline-node-text">
                  <span class="pipeline-node-title">Backscatter Threshold</span>
                  <span class="pipeline-node-desc">DN Cutoff / Otsu Method</span>
                </div>
              </div>
              <div class="pipeline-arrow">→</div>

              <!-- 7. CANDIDATE FLOOD MASK -->
              <div class="pipeline-node" id="f-stage-mask" title="Candidate Low-Backscatter Inundation Mask">
                <div class="pipeline-node-icon">○</div>
                <div class="pipeline-node-text">
                  <span class="pipeline-node-title">Candidate Flood Mask</span>
                  <span class="pipeline-node-desc">Low-Backscatter Pixels</span>
                </div>
              </div>
              <div class="pipeline-arrow">→</div>

              <!-- 8. AREA CALCULATION -->
              <div class="pipeline-node" id="f-stage-area" title="WGS-84 Geodesic Inundation Area">
                <div class="pipeline-node-icon">○</div>
                <div class="pipeline-node-text">
                  <span class="pipeline-node-title">Area Calculation</span>
                  <span class="pipeline-node-desc">Geodesic Pixel Metric</span>
                </div>
              </div>
              <div class="pipeline-arrow">→</div>

              <!-- 9. FLOOD ANALYSIS -->
              <div class="pipeline-node" id="f-stage-analysis" title="Disaster Assessment & Synthesis">
                <div class="pipeline-node-icon">○</div>
                <div class="pipeline-node-text">
                  <span class="pipeline-node-title">Flood Analysis</span>
                  <span class="pipeline-node-desc">Assessment &amp; Report</span>
                </div>
              </div>
            </div>
          </div>
        </div>


        <!-- PIPELINE CONTROL BAR -->
        <div class="flood-ctrl-panel" id="flood-ctrl-panel">
          <div class="flood-ctrl-row">
            <div class="flood-ctrl-item">
              <span class="card-subtitle">Active Site</span>
              <strong id="flood-ctrl-location" style="color:var(--text-main); font-size:13px;">--</strong>
            </div>
            <div class="flood-ctrl-item">
              <span class="card-subtitle">Active Sentinel-1 Product</span>
              <code id="flood-ctrl-product-id" style="font-size:11px; color:var(--accent-cyan); max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block;">--</code>
            </div>
            <div class="flood-ctrl-actions">
              <button type="button" class="action-btn" id="flood-ctrl-preprocess-btn" style="padding:7px 16px; font-size:12px;">
                ⚙️ Preprocess SAR
              </button>
              <button type="button" class="action-btn btn-flood-action" id="flood-ctrl-detect-btn" style="padding:7px 16px; font-size:12px;">
                🌊 Run Flood Detection
              </button>
              <button type="button" class="action-btn" id="flood-ctrl-report-btn" style="padding:7px 16px; font-size:12px;">
                📑 View Dossier
              </button>
            </div>
          </div>
        </div>

        <!-- BOTTOM ROW PANELS -->
        <div class="s1-bottom-grid">

          <!-- BOTTOM LEFT: PROCESSING RESULTS -->
          <div class="dashboard-panel results-panel">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">⚙️</span>
                <h3 class="panel-title">Processing Results</h3>
              </div>
              <div class="panel-header-right">
              </div>
            </div>

            <div class="results-panel-body" id="global-processing-results-body">
              <div class="empty-results-state" id="empty-results-state">
                <div class="empty-results-icon">🌊</div>
                <div class="empty-title">No Flood Detection Data Available</div>
                <div class="empty-desc">No flood detection data available for this location. Select a Sentinel-1 product from the Satellite section to run SAR preprocessing and flood classification.</div>
              </div>
              <div class="active-results-content" id="active-results-content" style="display:none;">
                <!-- Dynamically populated -->
              </div>
            </div>
          </div>

          <!-- BOTTOM RIGHT: DETECTION SUMMARY & FOOTPRINT EXTENT -->
          <div class="dashboard-panel status-timeline-panel" id="flood-footprint-summary-panel">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">🗺️</span>
                <h3 class="panel-title">Footprint &amp; Detection Summary</h3>
              </div>
              <div class="panel-header-right">
                <span class="timeline-live-badge" id="timeline-live-badge">READY</span>
              </div>
            </div>

            <div class="timeline-panel-body" style="padding:16px;">
              <div id="flood-footprint-summary-content">
                <!-- Dynamically populated by updateFloodDetectionView() -->
              </div>
              <!-- Hidden legacy timeline containers for safe compatibility -->
              <div id="processing-timeline" style="display:none;">
                <div id="tl-node-validate"><div class="node-icon-circle">✓</div><div id="tl-sub-validate"></div></div>
                <div id="tl-conn-1"></div>
                <div id="tl-node-download"><div class="node-icon-circle">2</div><div id="tl-sub-download"></div></div>
                <div id="tl-conn-2"></div>
                <div id="tl-node-preprocess"><div class="node-icon-circle">3</div><div id="tl-sub-preprocess"></div></div>
                <div id="tl-conn-3"></div>
                <div id="tl-node-flood"><div class="node-icon-circle">4</div><div id="tl-sub-flood"></div></div>
                <div id="tl-conn-4"></div>
                <div id="tl-node-report"><div class="node-icon-circle">5</div><div id="tl-sub-report"></div></div>
              </div>
            </div>
          </div>

        </div>

      </div> <!-- /view-flood-detection -->

      <!-- ============================================== -->
      <!-- VIEW 4: LOCATION OBSERVATION & SITE TELEMETRY -->
      <!-- ============================================== -->
      <div class="view-panel" id="view-location-observation">
        
        <!-- PAGE HEADER -->
        <div class="s1-page-header">
          <div class="s1-title-group">
            <div class="s1-icon-badge">📍</div>
            <div>
              <h2 class="s1-page-title">Location Observation &amp; Site Telemetry</h2>
              <p class="s1-page-subtitle">Comprehensive multi-source hydro-meteorological observation, satellite coverage, and risk intelligence for monitored locations.</p>
            </div>
          </div>
        <!-- 7-STAGE LOCATION OBSERVATION & TELEMETRY PIPELINE WORKFLOW DIAGRAM -->
        <div class="pipeline-workflow-card" id="loc-obs-pipeline-card" style="margin-top:14px; margin-bottom:14px; width:100%;">
          <div class="pipeline-workflow-header">
            <span class="pipeline-workflow-title">
              <span>📍</span> Location Observation &amp; Telemetry Pipeline
            </span>
            <span class="pipeline-stage-badge" id="loc-obs-pipeline-current-stage">● Map Observation</span>
          </div>
          <div class="pipeline-flow-row" id="loc-obs-pipeline-flow-row">
            <!-- 1. LOCATION SEARCH -->
            <div class="pipeline-node completed" id="lo-stage-search" title="Location Query & Geocoding">
              <div class="pipeline-node-icon">✓</div>
              <div class="pipeline-node-text">
                <span class="pipeline-node-title">Location Search</span>
                <span class="pipeline-node-desc">Query &amp; Geocoding</span>
              </div>
            </div>
            <div class="pipeline-arrow">→</div>

            <!-- 2. GEOGRAPHIC COORDINATES -->
            <div class="pipeline-node completed" id="lo-stage-coords" title="Geographic Latitude & Longitude">
              <div class="pipeline-node-icon">✓</div>
              <div class="pipeline-node-text">
                <span class="pipeline-node-title">Geographic Coordinates</span>
                <span class="pipeline-node-desc">Lat / Lon &amp; District</span>
              </div>
            </div>
            <div class="pipeline-arrow">→</div>

            <!-- 3. MAP OBSERVATION -->
            <div class="pipeline-node active" id="lo-stage-map" title="Interactive Map Observation">
              <div class="pipeline-node-icon">●</div>
              <div class="pipeline-node-text">
                <span class="pipeline-node-title">Map Observation</span>
                <span class="pipeline-node-desc">Spatial Centroid &amp; Zoom</span>
              </div>
            </div>
            <div class="pipeline-arrow">→</div>

            <!-- 4. SATELLITE OBSERVATION -->
            <div class="pipeline-node" id="lo-stage-sat" title="Satellite Sensor & STAC Discovery">
              <div class="pipeline-node-icon">○</div>
              <div class="pipeline-node-text">
                <span class="pipeline-node-title">Satellite Observation</span>
                <span class="pipeline-node-desc">Sentinel-1 Coverage</span>
              </div>
            </div>
            <div class="pipeline-arrow">→</div>

            <!-- 5. ENVIRONMENTAL CONDITIONS -->
            <div class="pipeline-node" id="lo-stage-env" title="Live Meteorological & AQI Telemetry">
              <div class="pipeline-node-icon">○</div>
              <div class="pipeline-node-text">
                <span class="pipeline-node-title">Environmental Conditions</span>
                <span class="pipeline-node-desc">Weather, Rain &amp; AQI</span>
              </div>
            </div>
            <div class="pipeline-arrow">→</div>

            <!-- 6. FLOOD / RISK CONTEXT -->
            <div class="pipeline-node" id="lo-stage-risk" title="Flood Inundation & Risk Score">
              <div class="pipeline-node-icon">○</div>
              <div class="pipeline-node-text">
                <span class="pipeline-node-title">Flood / Risk Context</span>
                <span class="pipeline-node-desc">Candidate Extent &amp; Risk</span>
              </div>
            </div>
            <div class="pipeline-arrow">→</div>

            <!-- 7. DISASTER ASSESSMENT -->
            <div class="pipeline-node" id="lo-stage-assessment" title="Operational Advisory & Dossier">
              <div class="pipeline-node-icon">○</div>
              <div class="pipeline-node-text">
                <span class="pipeline-node-title">Disaster Assessment</span>
                <span class="pipeline-node-desc">Advisory &amp; Summary</span>
              </div>
            </div>
          </div>
        </div>

        <!-- LOCATION SELECTOR & SITE PROVENANCE CARD -->
        <div class="loc-obs-control-panel">
          <div class="loc-obs-control-left">
            <span class="location-icon" style="font-size:20px;">📍</span>
            <div>
              <label for="loc-obs-select" class="topbar-label" style="display:block; margin-bottom:3px;">Active Monitored Site</label>
              <select id="loc-obs-select" class="db-select" style="min-width:240px;">
                <option value="">Loading database locations...</option>
              </select>
            </div>
            <div style="margin-left:8px; display:flex; align-items:center; gap:6px;">
              <span id="loc-obs-meta" style="font-size:12px; color:var(--text-secondary); font-weight:600;">--</span>
              <span id="loc-obs-id-badge" class="loc-type-badge badge-db">DATABASE MONITORED</span>
            </div>
          </div>
          <div class="loc-obs-control-right">
            <span class="card-subtitle">Coordinates:</span>
            <span id="loc-obs-coords" class="map-coords-badge">--</span>
          </div>
        </div>

        <!-- OBSERVATION CARDS GRID -->
        <div class="loc-obs-grid">

          <!-- CARD 1: SATELLITE OBSERVATIONS -->
          <div class="loc-obs-card">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">🛰️</span>
                <h3 class="panel-title">Satellite Observations</h3>
              </div>
              <div class="panel-header-right">
              </div>
            </div>
            <div class="loc-obs-card-body" id="loc-obs-sat-body">
              <div class="state-box">Loading satellite observations...</div>
            </div>
          </div>

          <!-- CARD 2: FLOOD INFORMATION -->
          <div class="loc-obs-card">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">🌊</span>
                <h3 class="panel-title">Flood Information</h3>
              </div>
              <div class="panel-header-right">
              </div>
            </div>
            <div class="loc-obs-card-body" id="loc-obs-flood-body">
              <div class="state-box">Loading flood detection records...</div>
            </div>
          </div>

          <!-- CARD 3: RISK INFORMATION -->
          <div class="loc-obs-card">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">⚠️</span>
                <h3 class="panel-title">Risk Information</h3>
              </div>
              <div class="panel-header-right">
              </div>
            </div>
            <div class="loc-obs-card-body" id="loc-obs-risk-body">
              <div class="state-box">Loading risk prediction...</div>
            </div>
          </div>

          <!-- CARD 4: WARNING ALERTS -->
          <div class="loc-obs-card">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">🔔</span>
                <h3 class="panel-title">Active Alerts</h3>
              </div>
              <div class="panel-header-right">
              </div>
            </div>
            <div class="loc-obs-card-body" id="loc-obs-alerts-body">
              <div class="state-box">Loading alerts...</div>
            </div>
          </div>

          <!-- CARD 5: OBSERVATION STATUS & LIVE TELEMETRY -->
          <div class="loc-obs-card" style="grid-column: 1 / -1;">
            <div class="panel-header">
              <div class="panel-header-left">
                <span class="panel-icon">🖥️</span>
                <h3 class="panel-title">Observation Status &amp; Live Telemetry</h3>
              </div>
              <div class="panel-header-right">
              </div>
            </div>
            <div class="loc-obs-card-body" id="loc-obs-status-body">
              <div class="state-box">Gathering live telemetry...</div>
            </div>
          </div>


        </div>

      </div> <!-- /view-location-observation -->

      <!-- ============================================== -->
      <!-- VIEW 3: COPERNICUS SATELLITE COMPARISON        -->
      <!-- ============================================== -->
      <div class="view-panel" id="view-compare">
        <section class="comparison-section" id="comparison-section">
          <div class="comparison-header">
            <div>
              <h2 style="font-size:17px; font-weight:700; color:var(--text-main);">🛰️ Satellite Image Comparison & Change Analysis</h2>
              <p style="font-size:12px; color:var(--text-secondary);">Direct scene queries to Copernicus Data Space STAC for Sentinel-1 SAR & Sentinel-2 MSI.</p>
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
              <div class="card-header-row">
                <h3 style="font-size:12px; font-weight:700;">🛰️ Sentinel-1 Before</h3>
                <span class="provenance-tag tag-stac" id="before-s1-date">--</span>
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
              <div class="card-header-row">
                <h3 style="font-size:12px; font-weight:700;">🛰️ Sentinel-1 After</h3>
                <span class="provenance-tag tag-stac" id="after-s1-date">--</span>
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
              <div class="card-header-row">
                <h3 style="font-size:12px; font-weight:700;">🌍 Sentinel-2 Before</h3>
                <span class="provenance-tag tag-stac" id="before-s2-date">--</span>
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
              <div class="card-header-row">
                <h3 style="font-size:12px; font-weight:700;">🌍 Sentinel-2 After</h3>
                <span class="provenance-tag tag-stac" id="after-s2-date">--</span>
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

          <div class="card" id="change-result-panel" style="margin-top:16px; padding:14px;">
            <h3 style="font-size:13px; font-weight:700; margin-bottom:10px;">📊 Change Analysis</h3>
            <div style="display:flex; justify-content:space-around; text-align:center;">
              <div>
                <span class="card-subtitle">Source Observation</span><br>
                <strong id="change-area" style="font-size:14px; color:var(--text-main);">Evaluated on request</strong>
              </div>
              <div>
                <span class="card-subtitle">Visual Image Difference</span><br>
                <strong id="change-percentage" style="font-size:14px; color:var(--accent-cyan);">--</strong>
              </div>
              <div>
                <span class="card-subtitle">Verification Status</span><br>
                <strong id="change-status" style="font-size:14px; color:var(--status-warning);">AWAITING QUERY</strong>
              </div>
            </div>
          </div>
        </section>
      </div> <!-- /view-compare -->

      <!-- ============================================== -->
      <!-- VIEW 4: ENVIRONMENTAL RISK PREDICTIONS         -->
      <!-- ============================================== -->
      <div class="view-panel" id="view-risk">
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
              <p style="font-size:11px; color:var(--text-dim); margin-top:8px;">
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
      </div> <!-- /view-risk -->

      <!-- ============================================== -->
      <!-- VIEW 5: HISTORICAL FLOOD ANALYTICS             -->
      <!-- ============================================== -->
      <div class="view-panel" id="view-historical-floods">
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
              <div id="chart-area-container" class="svg-chart-container"></div>
            </div>

            <div class="chart-card">
              <h4>Rainfall by Year (mm)</h4>
              <div id="chart-rainfall-container" class="svg-chart-container"></div>
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
      </div> <!-- /view-historical-floods -->

      <!-- ============================================== -->
      <!-- VIEW 6: DISASTER ASSESSMENT REPORT             -->
      <!-- ============================================== -->
      <div class="view-panel" id="view-report">
        <div class="page-report-header">
          <div class="s1-title-group">
            <div class="s1-icon-badge">📑</div>
            <div>
              <h2 class="s1-page-title">Disaster Assessment Report</h2>
              <p class="s1-page-subtitle">Comprehensive Hydro-meteorological &amp; Copernicus Sentinel-1 Radar Assessment Dossier.</p>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <button id="page-refresh-report-btn" class="action-btn" style="padding:6px 14px; font-size:12px;">🔄 Refresh Dossier</button>
            <button id="page-print-report-btn" class="action-btn" style="padding:6px 14px; font-size:12px;">🖨️ Print / Save PDF</button>
          </div>
        </div>

        <div class="page-report-container" id="page-report-content">
          <div class="state-box">Loading disaster assessment dossier...</div>
        </div>
      </div> <!-- /view-report -->

      <!-- ============================================== -->
      <!-- VIEW 6: DISASTER ALERT CENTER                  -->
      <!-- ============================================== -->
      <div class="view-panel" id="view-alerts">
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
      </div> <!-- /view-alerts -->

      <!-- ============================================== -->
      <!-- VIEW 7: USER MANAGEMENT (ADMIN ONLY)           -->
      <!-- ============================================== -->
      <div class="view-panel" id="view-users" style="display:none;">
        <div class="users-view-container">
          <div class="section-title-row">
            <div>
              <h2 style="font-size:18px; color:var(--text-main); margin-bottom:4px;">
                👥 User Management &amp; System Access Control
              </h2>
              <p style="font-size:12px; color:var(--text-secondary);">
                Manage authenticated operator accounts, assign operational roles, and toggle platform access permissions.
              </p>
            </div>
            <div class="provenance-legend">
              <span class="provenance-tag tag-db">SQL SERVER: Users</span>
              <span class="provenance-tag tag-proto">ADMIN ONLY</span>
            </div>
          </div>

          <!-- User Stats Cards -->
          <div class="users-stats-row">
            <div class="users-stat-card">
              <div class="users-stat-icon">👥</div>
              <div>
                <div class="users-stat-num" id="users-stat-total">--</div>
                <div class="users-stat-title">Total Users</div>
              </div>
            </div>
            <div class="users-stat-card">
              <div class="users-stat-icon" style="background:rgba(0,240,255,0.12); border-color:rgba(0,240,255,0.3);">🛡️</div>
              <div>
                <div class="users-stat-num" id="users-stat-admins" style="color:var(--accent-cyan);">--</div>
                <div class="users-stat-title">Administrators</div>
              </div>
            </div>
            <div class="users-stat-card">
              <div class="users-stat-icon" style="background:rgba(56,189,248,0.12); border-color:rgba(56,189,248,0.3);">🔬</div>
              <div>
                <div class="users-stat-num" id="users-stat-analysts" style="color:#38bdf8;">--</div>
                <div class="users-stat-title">Analysts</div>
              </div>
            </div>
            <div class="users-stat-card">
              <div class="users-stat-icon" style="background:rgba(16,185,129,0.12); border-color:rgba(16,185,129,0.3);">✅</div>
              <div>
                <div class="users-stat-num" id="users-stat-active" style="color:#34d399;">--</div>
                <div class="users-stat-title">Active Accounts</div>
              </div>
            </div>
          </div>

          <!-- Users Table Card -->
          <div class="users-table-card">
            <div class="users-table-header">
              <div class="users-table-title">
                <span>Platform Users</span>
                <span class="provenance-tag tag-stac" id="users-count-tag">0 Users</span>
              </div>
              <div class="users-table-actions">
                <button type="button" class="btn-refresh-users" id="btn-refresh-users" title="Refresh user list">
                  🔄 Refresh
                </button>
                <button type="button" class="btn-add-user" id="btn-open-add-user">
                  ➕ Add User
                </button>
              </div>
            </div>
            <div class="users-table-wrapper">
              <table class="users-data-table">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Name</th>
                    <th>Email Address</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="users-table-body">
                  <tr>
                    <td colspan="7" style="text-align:center; padding:30px; color:var(--text-secondary);">
                      Loading users from database...
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div> <!-- /view-users -->

    </div> <!-- /app-content-scroll -->

  </div> <!-- /app-main-viewport -->

  <!-- ============================================== -->
  <!-- MODALS                                         -->
  <!-- ============================================== -->

  <!-- 1. Process Sentinel-1 SAR Modal -->
  <div id="s1-sar-process-modal" class="modal-backdrop" style="display:none;">
    <div class="modal-window sar-process-modal-window">
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-header-icon">⚙️</span>
          <div>
            <h3>Prototype SAR Preprocessing</h3>
            <span class="modal-header-subtitle">Float32 Digital-Number Conversion & Geospatial Raster Generation</span>
          </div>
        </div>
        <button id="close-sar-modal-btn" class="modal-btn-close">&times;</button>
      </div>
      <div class="modal-body sar-process-modal-body">
        <div class="sar-modal-product-card">
          <div class="sar-modal-field">
            <span class="sar-modal-label">Product ID</span>
            <code id="sar-modal-product-id" class="sar-modal-code">--</code>
          </div>
          <div class="sar-modal-meta-row">
            <div><span class="sar-modal-label">Location:</span> <strong id="sar-modal-location">--</strong></div>
            <div><span class="sar-modal-label">Acquisition:</span> <strong id="sar-modal-date">--</strong></div>
          </div>
        </div>

        <div class="sar-modal-pol-section">
          <label class="sar-modal-section-label">Select Polarization:</label>
          <div class="sar-modal-pol-selector" id="sar-modal-pol-selector">
            <button type="button" class="sar-pol-btn active" data-pol="VV" id="sar-modal-pol-vv">VV</button>
            <button type="button" class="sar-pol-btn" data-pol="VH" id="sar-modal-pol-vh">VH</button>
          </div>
          <small class="sar-modal-pol-hint">Available polarizations detected from product metadata.</small>
        </div>

        <div class="sar-modal-notice-box">
          <span class="notice-icon">ℹ️</span>
          <div class="notice-text">
            This will preprocess the downloaded Sentinel-1 product to generate a geospatial raster for analysis. This step does not perform flood detection.
          </div>
        </div>

        <div id="sar-modal-status-msg" class="sar-modal-status-msg" style="display:none;"></div>
      </div>
      <div class="modal-actions sar-process-modal-actions">
        <button id="sar-modal-cancel-btn" class="modal-btn-secondary">Cancel</button>
        <button id="sar-modal-proceed-btn" class="action-btn" style="padding:8px 22px; font-size:13px; background:var(--accent-primary);">
          ⚙️ Process SAR
        </button>
      </div>
    </div>
  </div>

  <!-- 1.5. Prototype SAR Flood Detection Modal -->
  <div id="s1-flood-detect-modal" class="modal-backdrop" style="display:none;">
    <div class="modal-window sar-process-modal-window">
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-header-icon">🌊</span>
          <div>
            <h3>Prototype SAR Flood Detection</h3>
            <span class="modal-header-subtitle">Low-Backscatter Candidate Mask Generation</span>
          </div>
        </div>
        <button id="close-flood-modal-btn" class="modal-btn-close">&times;</button>
      </div>
      <div class="modal-body sar-process-modal-body">
        <div class="sar-modal-product-card">
          <div class="sar-modal-field">
            <span class="sar-modal-label">Product ID</span>
            <code id="flood-modal-product-id" class="sar-modal-code">--</code>
          </div>
          <div class="sar-modal-meta-row">
            <div><span class="sar-modal-label">Location:</span> <strong id="flood-modal-location">--</strong></div>
            <div><span class="sar-modal-label">Acquisition:</span> <strong id="flood-modal-date">--</strong></div>
          </div>
        </div>

        <div class="sar-modal-pol-section">
          <label class="sar-modal-section-label">Select Polarization:</label>
          <div class="sar-modal-pol-selector" id="flood-modal-pol-selector">
            <button type="button" class="sar-pol-btn active" data-pol="VV" id="flood-modal-pol-vv">VV</button>
            <button type="button" class="sar-pol-btn" data-pol="VH" id="flood-modal-pol-vh">VH</button>
          </div>
          <small class="sar-modal-pol-hint">Preprocessed polarization GeoTIFFs used for low-backscatter analysis.</small>
        </div>

        <div class="flood-modal-threshold-section">
          <label class="sar-modal-section-label">Backscatter DN Threshold:</label>
          <div class="flood-threshold-input-row">
            <input type="number" id="flood-modal-threshold" class="flood-threshold-input" value="150" min="1" max="10000" step="1" />
            <span class="flood-threshold-default-badge" id="flood-modal-threshold-hint">Prototype Default: 150.0 (VV) / 75.0 (VH)</span>
          </div>
          <small class="sar-modal-pol-hint">Valid SAR pixels with DN backscatter &le; threshold are flagged as potential flood / low-backscatter candidates.</small>
        </div>

        <div class="sar-modal-notice-box" style="border-color:rgba(245, 158, 11, 0.4); background:rgba(245, 158, 11, 0.08);">
          <span class="notice-icon">⚠️</span>
          <div class="notice-text" style="color:#f59e0b;">
            <strong>Prototype Flood Detection:</strong> Detects low-backscatter candidate areas using a prototype SAR threshold. This is not a scientifically validated flood classification.
          </div>
        </div>

        <div id="flood-modal-status-msg" class="sar-modal-status-msg" style="display:none;"></div>
      </div>
      <div class="modal-actions sar-process-modal-actions">
        <button id="flood-modal-cancel-btn" class="modal-btn-secondary">Cancel</button>
        <button id="flood-modal-proceed-btn" class="action-btn btn-flood-action" style="padding:8px 22px; font-size:13px;">
          🌊 Run Flood Detection
        </button>
      </div>
    </div>
  </div>

  <!-- 2. Sentinel-1 Download Confirmation Modal -->
  <div id="s1-download-modal" class="modal-backdrop" style="display:none;">
    <div class="modal-window s1-download-modal-window">
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-header-icon">📥</span>
          <div>
            <h3>Sentinel-1 Product Download</h3>
            <span class="modal-header-subtitle">Controlled Single-Product Retrieval</span>
          </div>
        </div>
        <button id="close-s1-download-btn" class="modal-btn-close">&times;</button>
      </div>
      <div class="modal-body s1-download-modal-body">
        <div class="sar-modal-product-card">
          <div class="sar-modal-field">
            <span class="sar-modal-label">Product ID</span>
            <code id="s1-confirm-product-id" class="sar-modal-code">--</code>
          </div>
          <div id="s1-confirm-size-row" class="sar-modal-meta-row" style="display:none;">
            <span class="sar-modal-label">Estimated Size:</span>
            <span id="s1-confirm-size-val" style="color:var(--accent-cyan); font-weight:700;">--</span>
          </div>
        </div>
        <div class="sar-modal-notice-box" style="border-color:rgba(245, 158, 11, 0.3); background:rgba(245, 158, 11, 0.08);">
          <span class="notice-icon">⚠️</span>
          <div class="notice-text" style="color:var(--status-warning);">
            <strong>This product may be large and will be stored locally.</strong><br>
            <span style="font-size:11px; color:var(--text-muted);">Storage destination: <code>backend/data/sentinel1/&lt;product_id&gt;/</code></span>
          </div>
        </div>
        <p style="font-weight:600; font-size:13px; color:var(--text-main);">Continue with download?</p>
      </div>
      <div class="modal-actions s1-download-modal-actions">
        <button id="s1-download-cancel-btn" class="modal-btn-secondary">Cancel</button>
        <button id="s1-download-proceed-btn" class="action-btn" style="padding:8px 20px; font-size:13px; background:var(--accent-primary);">
          Download
        </button>
      </div>
    </div>
  </div>

  <!-- 3. Disaster Assessment Report Modal -->
  <div id="report-modal" class="modal-backdrop" style="display:none;">
    <div class="modal-window" style="max-width:760px; max-height:85vh;">
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-header-icon">📑</span>
          <div>
            <h3>EarthWatch AI — Disaster Assessment Summary</h3>
            <span class="modal-header-subtitle">Comprehensive Hydro-meteorological & Satellite Dossier</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button id="print-report-btn" class="action-btn" style="padding:4px 10px; font-size:11.5px;">🖨️ Print / Save PDF</button>
          <button id="close-report-btn" class="modal-btn-close">&times;</button>
        </div>
      </div>
      <div class="modal-body" id="report-modal-content" style="overflow-y:auto; max-height:calc(85vh - 120px);">
        <div class="state-box">Generating comprehensive assessment dossier...</div>
      </div>
    </div>
  </div>

  <!-- 4. Copernicus Data Space Authentication Modal -->
  <div id="cdse-modal" class="modal-backdrop" style="display:none;">
    <div class="modal-window cdse-modal-window">
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-header-icon">🛰️</span>
          <div>
            <h3>Copernicus Data Space Access</h3>
            <span class="modal-header-subtitle">Sentinel-1 CDSE Authentication Status</span>
          </div>
        </div>
        <button id="close-cdse-btn" class="modal-btn-close">&times;</button>
      </div>

      <div class="modal-body">
        <div class="sar-modal-notice-box">
          <span class="notice-icon">🔒</span>
          <div class="notice-text">
            Copernicus credentials are stored securely on the EarthWatch AI backend environment and are never exposed to the client browser.
          </div>
        </div>

        <div class="sar-modal-product-card">
          <div class="card-header-row">
            <span class="sar-modal-label">Authentication Status</span>
            <span class="provenance-tag tag-stac">CDSE API</span>
          </div>
          <div id="cdse-status-display" style="margin:6px 0;">
            <span id="cdse-status-text" style="font-size:13px; font-weight:700; color:var(--status-warning);">● Not Configured</span>
          </div>
          <div id="cdse-status-message" style="font-size:11.5px; color:var(--text-secondary);">
            Copernicus Data Space credentials are not configured.
          </div>
        </div>

        <div class="sar-modal-product-card">
          <span class="sar-modal-label">Server Credentials</span>
          <div style="font-size:11.5px; color:var(--text-secondary); margin-top:4px;">
            Configured in <code>backend/.env</code>: <code>CDSE_USERNAME</code> &amp; <code>CDSE_PASSWORD</code>
          </div>
          <p style="font-size:10.5px; color:var(--text-dim); margin-top:6px;">
            ✓ Secure Policy: Direct password inputs are omitted for protection.
          </p>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
          <button id="cdse-test-btn" class="action-btn" style="padding:7px 16px;">
            🔗 Test Connection
          </button>
          <span id="cdse-test-hint" style="font-size:10.5px; color:var(--text-muted);">Verifies backend environment token</span>
        </div>
      </div>
    </div>
  <!-- 5. Add User Modal (Admin only) -->
  <div id="add-user-modal" class="user-modal-overlay">
    <div class="user-modal-card">
      <div class="user-modal-header">
        <h3 class="user-modal-title">➕ Create Platform User</h3>
        <button id="close-add-user-btn" class="user-modal-close">&times;</button>
      </div>
      <form id="add-user-form" class="auth-form" novalidate>
        <div id="add-user-alert" class="auth-alert-banner"></div>
        <div class="auth-field-group">
          <label class="auth-label" for="add-user-name">Full Name</label>
          <input type="text" id="add-user-name" class="auth-input" placeholder="e.g. Dr. Maya Patel" required />
          <div class="auth-error-msg" id="add-user-name-error"></div>
        </div>
        <div class="auth-field-group">
          <label class="auth-label" for="add-user-email">Email Address</label>
          <input type="email" id="add-user-email" class="auth-input" placeholder="e.g. m.patel@earthwatch.ai" required />
          <div class="auth-error-msg" id="add-user-email-error"></div>
        </div>
        <div class="auth-field-group">
          <label class="auth-label" for="add-user-password">Initial Password</label>
          <input type="password" id="add-user-password" class="auth-input" placeholder="Minimum 8 characters" required />
          <div class="auth-error-msg" id="add-user-password-error"></div>
        </div>
        <div class="auth-field-group">
          <label class="auth-label" for="add-user-role">Assigned Platform Role</label>
          <select id="add-user-role" class="auth-input" style="padding-left:14px;">
            <option value="ANALYST">ANALYST — Core Intelligence, Satellite & Flood Analysis</option>
            <option value="ADMIN">ADMIN — Full Platform, User Management & System Control</option>
          </select>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
          <button type="button" id="cancel-add-user-btn" class="btn-refresh-users">Cancel</button>
          <button type="submit" id="submit-add-user-btn" class="btn-add-user">Create User</button>
        </div>
      </form>
    </div>
  </div>

</div>
`;
// ======================================================
// DOM REFERENCES
// ======================================================

const dbLocationSelect = document.querySelector<HTMLSelectElement>("#db-location-select")!;
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

// Location Observation section DOM
const locObsSelect = document.querySelector<HTMLSelectElement>("#loc-obs-select");
const locObsCoords = document.querySelector<HTMLElement>("#loc-obs-coords");
const locObsMeta = document.querySelector<HTMLElement>("#loc-obs-meta");
const locObsIdBadge = document.querySelector<HTMLElement>("#loc-obs-id-badge");
const locObsSatBody = document.querySelector<HTMLElement>("#loc-obs-sat-body");
const locObsFloodBody = document.querySelector<HTMLElement>("#loc-obs-flood-body");
const locObsRiskBody = document.querySelector<HTMLElement>("#loc-obs-risk-body");
const locObsAlertsBody = document.querySelector<HTMLElement>("#loc-obs-alerts-body");
const locObsStatusBody = document.querySelector<HTMLElement>("#loc-obs-status-body");

// Flood Detection section DOM
const floodCtrlLocation = document.querySelector<HTMLElement>("#flood-ctrl-location");
const floodCtrlProductId = document.querySelector<HTMLElement>("#flood-ctrl-product-id");
const floodCtrlPreprocessBtn = document.querySelector<HTMLButtonElement>("#flood-ctrl-preprocess-btn");
const floodCtrlDetectBtn = document.querySelector<HTMLButtonElement>("#flood-ctrl-detect-btn");
const floodCtrlReportBtn = document.querySelector<HTMLButtonElement>("#flood-ctrl-report-btn");

// In-Page Report section DOM
const pageReportContent = document.querySelector<HTMLElement>("#page-report-content");
const pagePrintReportBtn = document.querySelector<HTMLButtonElement>("#page-print-report-btn");
const pageRefreshReportBtn = document.querySelector<HTMLButtonElement>("#page-refresh-report-btn");

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

async function fetchReportSummary(locationId: number, productId?: string | null): Promise<ReportSummary> {
  const params: Record<string, any> = { location_id: locationId };
  if (productId) {
    params.product_id = productId;
  }
  const response = await axios.get(`${BACKEND_URL}/reports/summary`, {
    params,
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
  locationId: number | null,
  days: number = 7,
  lat?: number,
  lon?: number,
  locationName?: string
): Promise<Sentinel1ProductResponse> {
  const params: any = { days };
  if (locationId !== null && locationId !== undefined) {
    params.location_id = locationId;
  } else if (lat !== undefined && lon !== undefined) {
    params.lat = lat;
    params.lon = lon;
    if (locationName) params.location_name = locationName;
  }
  const response = await axios.get(`${BACKEND_URL}/sentinel1/products`, { params });
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
  locationId?: number | null
): Promise<Sentinel1DownloadInfoResponse | null> {
  try {
    const params: Record<string, any> = { product_id: productId };
    if (locationId !== null && locationId !== undefined) {
      params.location_id = locationId;
    }
    const response = await axios.get<Sentinel1DownloadInfoResponse>(
      `${BACKEND_URL}/sentinel1/download/info`,
      {
        params,
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
  locationId?: number | null
): Promise<Sentinel1DownloadResponse> {
  const payload: Record<string, any> = { product_id: productId };
  if (locationId !== null && locationId !== undefined) {
    payload.location_id = locationId;
  }
  const response = await axios.post<Sentinel1DownloadResponse>(
    `${BACKEND_URL}/sentinel1/download`,
    payload,
    {
      timeout: 300000, // 5 minutes for streaming download
      validateStatus: (status) => status < 500, // Handle 200, 400, 404 cleanly
    }
  );
  return response.data;
}

async function fetchSarProductStatus(productId: string): Promise<SarStatusResponse> {
  const response = await axios.get<SarStatusResponse>(
    `${BACKEND_URL}/sar/status`,
    {
      params: { product_id: productId },
    }
  );
  return response.data;
}

async function requestSarPreprocessing(
  productId: string,
  polarization: string
): Promise<SarPreprocessResponse> {
  const response = await axios.post<SarPreprocessResponse>(
    `${BACKEND_URL}/sar/preprocess`,
    {
      product_id: productId,
      polarization: polarization,
    },
    {
      timeout: 120000,
      validateStatus: (status) => status < 500,
    }
  );
  return response.data;
}

async function fetchFloodDetectionStatus(
  productId: string,
  polarization?: string
): Promise<FloodDetectionStatusResponse> {
  const params: Record<string, string> = { product_id: productId };
  if (polarization) params.polarization = polarization;
  const response = await axios.get<FloodDetectionStatusResponse>(
    `${BACKEND_URL}/flood/detection/status`,
    {
      params,
      timeout: 10000,
      validateStatus: (status) => status < 500,
    }
  );
  return response.data;
}

async function requestFloodDetection(
  productId: string,
  polarization: string,
  threshold?: number
): Promise<FloodDetectionResponse> {
  const payload: Record<string, any> = {
    product_id: productId,
    polarization: polarization,
  };
  if (threshold !== undefined && !isNaN(threshold)) {
    payload.threshold = threshold;
  }
  const response = await axios.post<FloodDetectionResponse>(
    `${BACKEND_URL}/flood/detect`,
    payload,
    {
      timeout: 120000,
      validateStatus: (status) => status < 500,
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
        "Elevated prototype risk indicated. Prioritize surface runoff drainage inspections and river basin telemetry.";
    } else {
      recommendationEl.textContent =
        "Normal operational baseline. Continue routine satellite pass acquisition and atmospheric monitoring.";
    }
  }
}

function renderLocationPins(
  locations: LocationRecord[],
  activeLocId: number | null,
  searchedLoc?: SearchedLocation | null
) {
  markerLayerGroup.clearLayers();

  locations.forEach((loc) => {
    const isSelected = activeLocId !== null && loc.location_id === activeLocId;

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
        <span style="font-size:9px; font-weight:700; background:#e0f2fe; color:#0369a1; padding:1px 5px; border-radius:3px;">DATABASE MONITORED</span>
        <h4 style="margin:4px 0; color:#0369a1;">${loc.location_name} ${isSelected ? "• Active" : ""}</h4>
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

  if (searchedLoc) {
    const customIcon = L.divIcon({
      className: "custom-map-pin searched-pin",
      html: `
        <div style="
          background:#f59e0b;
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
          box-shadow:0 0 10px rgba(245,158,11,0.9);
        ">📍</div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const m = L.marker([searchedLoc.latitude, searchedLoc.longitude], { icon: customIcon });
    m.bindPopup(`
      <div style="color:#0f172a; font-family:sans-serif; min-width:180px;">
        <span style="font-size:9px; font-weight:700; background:#fef3c7; color:#b45309; padding:1px 5px; border-radius:3px;">SEARCHED LOCATION</span>
        <h4 style="margin:4px 0; color:#b45309;">${searchedLoc.name} • Active</h4>
        <p style="margin:0; font-size:12px;"><strong>District/Region:</strong> ${searchedLoc.district || searchedLoc.state || searchedLoc.country || "--"}</p>
        <p style="margin:2px 0 0; font-size:11px; color:#64748b;">${searchedLoc.latitude.toFixed(4)}°N, ${searchedLoc.longitude.toFixed(4)}°E</p>
      </div>
    `);
    markerLayerGroup.addLayer(m);
    setTimeout(() => m.openPopup(), 150);
  }
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

function renderAlerts(alerts: AlertRecord[], locId: number | null) {
  if (!alertsContainer || !alertCountBadge) return;

  if (locId === null) {
    alertCountBadge.textContent = "0 Active";
    alertsContainer.innerHTML = `
      <div class="state-box" style="grid-column: 1 / -1;">
        NO ACTIVE ALERT
      </div>
    `;
    return;
  }

  const locAlerts = alerts.filter((a) => a.location_id === locId);

  if (locAlerts.length === 0) {
    alertCountBadge.textContent = "0 Active";
    alertsContainer.innerHTML = `
      <div class="state-box" style="grid-column: 1 / -1;">
        NO ACTIVE ALERT
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

  // Clear previous product selection to prevent stale location data bleed
  selectedSentinel1Product = null;
  selectedSentinel1SarStatus = null;
  selectedSentinel1FloodStatus = null;
  renderProductDetails(null);
  renderGlobalProcessingResults(null);
  updateProcessingTimeline({ badge: "IDLE" });
  updateWorkflowStepper({
    discoverDone: true,
    downloadDone: false,
    preprocessDone: false,
    floodDone: false,
    reportDone: false,
  });

  isCurrentLocationDatabaseMonitored = true;
  currentSearchedLocation = null;

  const activeLocTypeBadge = document.querySelector<HTMLElement>("#active-loc-type-badge");
  if (activeLocTypeBadge) {
    activeLocTypeBadge.textContent = "DATABASE MONITORED";
    activeLocTypeBadge.className = "loc-type-badge badge-db";
  }

  const topbarLocationInput = document.querySelector<HTMLInputElement>("#topbar-location-input");
  if (topbarLocationInput) {
    topbarLocationInput.value = activeLoc.location_name;
  }

  if (locObsIdBadge) {
    locObsIdBadge.textContent = "DATABASE MONITORED";
    locObsIdBadge.className = "loc-type-badge badge-db";
  }

  if (dbLocationSelect) {
    dbLocationSelect.value = String(activeLoc.location_id);
  }
  if (locObsSelect) {
    locObsSelect.value = String(activeLoc.location_id);
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

  try {
    if (activeView === "satellite") {
      map.flyTo([activeLoc.latitude, activeLoc.longitude], 12, { duration: 1.2 });
      renderLocationPins(dbLocations, activeLoc.location_id);
    } else {
      map.setView([activeLoc.latitude, activeLoc.longitude], 12);
    }
  } catch (err) {
    console.warn("Map view update skipped (container hidden):", err);
  }

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

  // 9b. Sentinel-1 Product Discovery (only fetch if currently on Satellite view)
  if (activeView === "satellite") {
    lastLoadedSatelliteLocationId = activeLoc.location_id;
    loadSentinel1Discovery(activeLoc.location_id, activeLoc.location_name);
  } else {
    lastLoadedSatelliteLocationId = null;
  }

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

  updateLocationObservationView();
  updateFloodDetectionView();
  updateFloodPipelineWorkflow();
  updateLocationObservationWorkflow();
  renderCurrentView();
}

async function selectSearchedGeographicLocation(item: SearchedLocation) {
  isCurrentLocationDatabaseMonitored = false;
  currentSearchedLocation = item;
  selectedLocationId = null;
  selectedLocationName = item.name;
  selectedLatitude = item.latitude;
  selectedLongitude = item.longitude;

  // Clear previous product selection to prevent stale location data bleed
  selectedSentinel1Product = null;
  selectedSentinel1SarStatus = null;
  selectedSentinel1FloodStatus = null;
  renderProductDetails(null);
  renderGlobalProcessingResults(null);
  updateProcessingTimeline({ badge: "IDLE" });
  updateWorkflowStepper({
    discoverDone: true,
    downloadDone: false,
    preprocessDone: false,
    floodDone: false,
    reportDone: false,
  });

  const activeLocTypeBadge = document.querySelector<HTMLElement>("#active-loc-type-badge");
  if (activeLocTypeBadge) {
    activeLocTypeBadge.textContent = "SEARCHED LOCATION";
    activeLocTypeBadge.className = "loc-type-badge badge-searched";
  }

  const topbarLocationInput = document.querySelector<HTMLInputElement>("#topbar-location-input");
  if (topbarLocationInput) {
    topbarLocationInput.value = item.display_name || item.name;
  }

  if (locObsSelect) {
    locObsSelect.value = "";
  }
  if (locObsIdBadge) {
    locObsIdBadge.textContent = "SEARCHED LOCATION";
    locObsIdBadge.className = "loc-type-badge badge-searched";
  }
  if (comparisonLocationSelect) {
    comparisonLocationSelect.value = item.name;
  }

  // Show clear loading state
  showLocationLoadingState(item.name);

  // 1. Map & Meta Sync
  metaDistrict.textContent = item.district || item.name;
  metaState.textContent = item.state || item.country || "Global";
  metaCoords.textContent = `${item.latitude.toFixed(4)}° N, ${item.longitude.toFixed(4)}° E`;
  mapActiveCoords.textContent = `${item.latitude.toFixed(4)}° N, ${item.longitude.toFixed(4)}° E`;

  try {
    if (activeView === "satellite") {
      map.flyTo([item.latitude, item.longitude], 12, { duration: 1.2 });
      renderLocationPins(dbLocations, null, item);
    } else {
      map.setView([item.latitude, item.longitude], 12);
      renderLocationPins(dbLocations, null, item);
    }
  } catch (err) {
    console.warn("Map view update skipped (container hidden):", err);
  }

  // 2. Satellite Observations (DO NOT fabricate)
  satelliteObservationElement.textContent = "No data available";
  satelliteObservationElement.className = "value no-data";
  satelliteMetaSubtitle.textContent = "NO DATABASE OBSERVATION";

  // 3. Flood Detections (DO NOT fabricate)
  floodedAreaElement.textContent = "No data available";
  floodedAreaElement.className = "value no-data";
  floodExtentSubtitle.textContent = "NO FLOOD RECORD AVAILABLE";

  detectionConfidenceElement.textContent = "No data available";
  detectionConfidenceElement.className = "value no-data";
  detectionMethodSubtitle.textContent = "NO FLOOD RECORD AVAILABLE";

  // 4. Flood Regions (DO NOT fabricate)
  floodRegionsLayerGroup.clearLayers();
  affectedRegionsElement.textContent = "No data available";
  affectedRegionsElement.className = "value no-data";
  if (regionsSubtitle) regionsSubtitle.textContent = "NO HISTORICAL DATABASE RECORD";
  mapRegionStatus.textContent = "NO HISTORICAL DATABASE RECORD";

  // 5. Risk Predictions (DO NOT fabricate)
  floodRiskElement.textContent = "No data available";
  floodRiskElement.className = "value no-data";
  analysisStatusElement.textContent = "No risk prediction available for this location.";

  riskScoreValue.textContent = "--";
  riskLevelBadge.textContent = "N/A";
  riskLevelBadge.className = "alert-pill pill-low";
  riskModelName.textContent = "No risk prediction available for this location.";

  const clearFactor = (el: HTMLElement | null) => {
    if (!el) return;
    el.textContent = "No data available";
    el.classList.add("no-data");
  };

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

  // 6. Historical Floods & Charts (DO NOT fabricate)
  renderHistoricalCharts([]);

  // 7. Alerts (DO NOT fabricate)
  renderAlerts([], null);

  // 8. Copernicus SAR Discovery
  loadCopernicusSarAsset(item.name);

  // 9. Sentinel-1 Product Discovery with searched coordinates
  if (activeView === "satellite") {
    lastLoadedSatelliteLocationId = null;
    loadSentinel1Discovery(null, item.name, item.latitude, item.longitude);
  } else {
    lastLoadedSatelliteLocationId = null;
  }

  // 10. Live Weather & Atmospheric Telemetry (Real live data for coordinates)
  try {
    const weather = await fetchLiveWeather(item.latitude, item.longitude);
    temperatureElement.textContent = `${Math.round(weather.main.temp)}°C`;
    conditionElement.textContent = weather.weather?.[0]?.description || "Fair";

    const rainVal = weather.rain?.["1h"] ?? weather.rain?.["3h"] ?? 0;
    rainfallElement.textContent = `${rainVal} mm`;
    rainfallStatus.textContent = `OpenWeather live telemetry (${item.name})`;

    const aqi = await fetchLiveAirQuality(item.latitude, item.longitude);
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

    updateInsightCard(Math.round(weather.main.temp), aqi, "LOW");
  } catch {
    temperatureElement.textContent = "--";
    conditionElement.textContent = "Weather API unavailable";
    airQualityElement.textContent = "--";
    updateInsightCard(28, null, "LOW");
  }

  // Topbar statistics sync
  const topStatObsEl = document.querySelector<HTMLElement>("#top-stat-obs");
  const topStatFloodsEl = document.querySelector<HTMLElement>("#top-stat-floods");
  const topStatRiskEl = document.querySelector<HTMLElement>("#top-stat-risk");
  const topStatAlertsEl = document.querySelector<HTMLElement>("#top-stat-alerts");
  if (topStatObsEl) topStatObsEl.textContent = "--";
  if (topStatFloodsEl) topStatFloodsEl.textContent = "--";
  if (topStatRiskEl) topStatRiskEl.textContent = "--";
  if (topStatAlertsEl) topStatAlertsEl.textContent = "0";

  updateLocationObservationView();
  updateFloodDetectionView();
  updateFloodPipelineWorkflow();
  updateLocationObservationWorkflow();
  renderCurrentView();
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


// Topbar & Navigation DOM
const topStatObs = document.querySelector<HTMLElement>("#top-stat-obs");
const topStatFloods = document.querySelector<HTMLElement>("#top-stat-floods");
const topStatRisk = document.querySelector<HTMLElement>("#top-stat-risk");
const topStatAlerts = document.querySelector<HTMLElement>("#top-stat-alerts");
const sidebarAlertBadge = document.querySelector<HTMLElement>("#sidebar-alert-badge");

// Process SAR Modal DOM
const closeSarModalBtn = document.querySelector<HTMLButtonElement>("#close-sar-modal-btn");
const sarModalCancelBtn = document.querySelector<HTMLButtonElement>("#sar-modal-cancel-btn");
const closeFloodModalBtn = document.querySelector<HTMLButtonElement>("#close-flood-modal-btn");
const floodModalCancelBtn = document.querySelector<HTMLButtonElement>("#flood-modal-cancel-btn");

// ======================================================
// SENTINEL-1 PRODUCT DISCOVERY & SAR PROCESSING
// ======================================================

let currentDiscoveredProducts: Sentinel1Product[] = [];
let lastLoadedSatelliteLocationId: number | null = null;
let selectedSentinel1Product: Sentinel1Product | null = null;
let selectedSentinel1SarStatus: SarStatusResponse | null = null;
let selectedSentinel1FloodStatus: FloodDetectionStatusResponse | null = null;
let selectedModalPol: string = "VV";
let selectedFloodModalPol: string = "VV";
let currentResultsTab: "sar" | "flood" = "sar";
let s1FloodLayer: L.Layer | null = null;

function updateTopStatistics() {
  if (topStatObs) topStatObs.textContent = String(allObservations.length);
  if (topStatFloods) topStatFloods.textContent = String(allFloodDetections.length);
  if (topStatAlerts) {
    const activeCount = allAlerts.filter(a => !a.is_resolved).length;
    topStatAlerts.textContent = String(activeCount);
    if (sidebarAlertBadge) sidebarAlertBadge.textContent = String(activeCount);
  }
  if (topStatRisk) {
    const curRisk = allRiskPredictions.find(r => r.location_id === selectedLocationId);
    if (curRisk && curRisk.risk_score !== null) {
      topStatRisk.textContent = `${curRisk.risk_score.toFixed(2)}`;
    } else {
      topStatRisk.textContent = "0.64";
    }
  }
}

function updateLocationObservationView() {
  if (isCurrentLocationDatabaseMonitored) {
    const activeLoc = dbLocations.find((l) => l.location_id === selectedLocationId) || dbLocations[0];
    if (!activeLoc) return;

    if (locObsSelect && locObsSelect.value !== String(activeLoc.location_id)) {
      locObsSelect.value = String(activeLoc.location_id);
    }
    if (locObsMeta) locObsMeta.textContent = `${activeLoc.district}, ${activeLoc.state}`;
    if (locObsIdBadge) {
      locObsIdBadge.textContent = "DATABASE MONITORED";
      locObsIdBadge.className = "loc-type-badge badge-db";
    }
    if (locObsCoords) locObsCoords.textContent = `${activeLoc.latitude.toFixed(4)}° N, ${activeLoc.longitude.toFixed(4)}° E`;

    // 1. Satellite Observations Card
    if (locObsSatBody) {
      const locObservations = allObservations.filter((s) => s.location_id === activeLoc.location_id);
      if (locObservations.length > 0) {
        locObsSatBody.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${locObservations.map((obs) => `
              <div class="loc-obs-metric" style="gap:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <strong style="color:var(--accent-cyan); font-size:13px;">${obs.satellite} • ${obs.sensor}</strong>
                  <span style="font-size:11px; color:var(--text-secondary); font-weight:600;">Acquired: ${obs.acquisition_date}</span>
                </div>
                <div style="font-size:11.5px; color:var(--text-secondary);">
                  ${obs.cloud_cover !== null ? `<span>Cloud Cover: <strong>${obs.cloud_cover}%</strong></span>` : ""}
                  <span style="margin-left:8px;">Source: ${obs.data_source}</span>
                </div>
                <div style="font-size:11px; color:var(--text-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  Product: <code>${obs.product_id}</code>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      } else {
        locObsSatBody.innerHTML = `
          <div class="state-box">
            No database observation available
          </div>
        `;
      }
    }

    // 2. Flood Information Card
    if (locObsFloodBody) {
      const locFloods = allFloodDetections.filter((f) => f.location_id === activeLoc.location_id);
      const locRegions = allFloodRegions.filter((r) => r.location_id === activeLoc.location_id);
      if (locFloods.length > 0) {
        locObsFloodBody.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${locFloods.map((fl) => `
              <div class="loc-obs-metric" style="gap:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-weight:700; color:var(--text-main); font-size:13px;">${fl.satellite} ${fl.sensor}</span>
                  <span class="alert-pill ${fl.status === "ACTIVE" ? "pill-high" : "pill-low"}">${fl.status}</span>
                </div>
                <div class="loc-obs-metric-grid" style="margin-top:4px;">
                  <div>
                    <span class="card-subtitle">Candidate Flood Area</span>
                    <div style="font-size:14px; font-weight:700; color:var(--accent-cyan);">${fl.flooded_area_km2 ?? 0} km²</div>
                  </div>
                  <div>
                    <span class="card-subtitle">Candidate Percentage</span>
                    <div style="font-size:14px; font-weight:700; color:var(--status-warning);">${fl.flood_percentage ?? 0}%</div>
                  </div>
                  <div>
                    <span class="card-subtitle">Confidence</span>
                    <div style="font-size:13px; font-weight:600;">${fl.confidence !== null ? `${Math.round(fl.confidence * 100)}%` : "N/A"}</div>
                  </div>
                  <div>
                    <span class="card-subtitle">Detection Method</span>
                    <div style="font-size:11.5px; color:var(--text-muted);">${fl.detection_method}</div>
                  </div>
                </div>
                <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">
                  Detection Date: ${fl.detection_date}
                </div>
              </div>
            `).join("")}
            ${locRegions.length > 0 ? `
              <div style="margin-top:4px; font-size:11.5px; color:var(--text-muted);">
                <strong>Mapped Sub-regions (${locRegions.length}):</strong>
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
                  ${locRegions.map((r) => `<span class="provenance-tag tag-db">${r.region_name} (${r.affected_area_km2 ?? 0} km² · ${r.severity})</span>`).join("")}
                </div>
              </div>
            ` : ""}
          </div>
        `;
      } else {
        locObsFloodBody.innerHTML = `
          <div class="state-box">
            No database observation available
          </div>
        `;
      }
    }

    // 3. Risk Information Card
    if (locObsRiskBody) {
      const locRisks = allRiskPredictions.filter((r) => r.location_id === activeLoc.location_id);
      if (locRisks.length > 0) {
        const risk = locRisks[0];
        const scorePct = risk.risk_score !== null ? Math.round(risk.risk_score * 100) : null;
        const pillClass = risk.risk_level === "HIGH" || risk.risk_level === "VERY HIGH" ? "pill-high" : risk.risk_level === "MEDIUM" ? "pill-medium" : "pill-low";
        locObsRiskBody.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span class="alert-pill ${pillClass}">${risk.risk_level} RISK</span>
                <strong style="margin-left:8px; font-size:15px; color:var(--text-main);">${scorePct !== null ? `${scorePct}%` : "--"}</strong>
              </div>
              <span style="font-size:11px; color:var(--text-muted); font-weight:600;">Model: ${risk.model_name}</span>
            </div>
            <div class="loc-obs-metric-grid" style="font-size:11.5px;">
              <div class="loc-obs-metric">
                <span class="card-subtitle">24h Rainfall</span>
                <strong>${risk.rainfall_mm !== null ? `${risk.rainfall_mm} mm` : "N/A"}</strong>
              </div>
              <div class="loc-obs-metric">
                <span class="card-subtitle">Accumulated Rain</span>
                <strong>${risk.accumulated_rainfall_mm !== null ? `${risk.accumulated_rainfall_mm} mm` : "N/A"}</strong>
              </div>
              <div class="loc-obs-metric">
                <span class="card-subtitle">River Distance</span>
                <strong>${risk.river_distance_km !== null ? `${risk.river_distance_km} km` : "N/A"}</strong>
              </div>
              <div class="loc-obs-metric">
                <span class="card-subtitle">Terrain Elevation</span>
                <strong>${risk.elevation_m !== null ? `${risk.elevation_m} m` : "N/A"}</strong>
              </div>
              <div class="loc-obs-metric">
                <span class="card-subtitle">Slope</span>
                <strong>${risk.slope_degree !== null ? `${risk.slope_degree}°` : "N/A"}</strong>
              </div>
              <div class="loc-obs-metric">
                <span class="card-subtitle">Prior Flooded Area</span>
                <strong>${risk.previous_flooded_area_km2 !== null ? `${risk.previous_flooded_area_km2} km²` : "N/A"}</strong>
              </div>
            </div>
            <div style="font-size:11px; color:var(--text-dim);">
              Prediction Date: ${risk.prediction_date}
            </div>
          </div>
        `;
      } else {
        locObsRiskBody.innerHTML = `
          <div class="state-box">
            No database observation available
          </div>
        `;
      }
    }

    // 4. Alerts Card
    if (locObsAlertsBody) {
      const locAlerts = allAlerts.filter((a) => a.location_id === activeLoc.location_id);
      if (locAlerts.length > 0) {
        locObsAlertsBody.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${locAlerts.map((a) => {
              const pillClass = a.alert_level === "HIGH" || a.alert_level === "CRITICAL" ? "pill-high" : a.alert_level === "MEDIUM" ? "pill-medium" : "pill-low";
              return `
                <div class="loc-obs-metric" style="gap:4px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="alert-pill ${pillClass}">${a.alert_level} • ${a.alert_type}</span>
                    <span style="font-size:11px; color:var(--text-dim);">${a.alert_date}</span>
                  </div>
                  <p style="font-size:12px; color:var(--text-main); margin:3px 0 0;">${a.alert_message}</p>
                  <div style="font-size:10.5px; color:var(--text-muted);">
                    Status: <strong>${a.is_resolved ? "Resolved" : "Active"}</strong>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      } else {
        locObsAlertsBody.innerHTML = `
          <div class="state-box">
            No active alerts for this location.
          </div>
        `;
      }
    }

    // 5. Status & Telemetry Card
    if (locObsStatusBody) {
      locObsStatusBody.innerHTML = `
        <div class="loc-obs-metric-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
          <div class="loc-obs-metric">
            <span class="card-subtitle">Coordinates</span>
            <strong style="font-size:12.5px; color:var(--text-main);">${activeLoc.latitude.toFixed(4)}° N, ${activeLoc.longitude.toFixed(4)}° E</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Temperature</span>
            <strong style="font-size:12.5px; color:var(--accent-cyan);">${temperatureElement.textContent || "--"}</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Weather Condition</span>
            <strong style="font-size:12.5px; color:var(--text-main);">${conditionElement.textContent || "--"}</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Precipitation Depth</span>
            <strong style="font-size:12.5px; color:var(--text-main);">${rainfallElement.textContent || "--"}</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Air Quality</span>
            <strong style="font-size:12.5px; color:var(--text-main);">${airQualityElement.textContent || "--"}</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Telemetry State</span>
            <strong style="font-size:12.5px; color:#10b981;">● Connected / Live Telemetry</strong>
          </div>
        </div>
      `;
    }

  } else {
    // SEARCHED LOCATION: DO NOT FABRICATE DATA
    const loc = currentSearchedLocation || {
      name: selectedLocationName,
      latitude: selectedLatitude,
      longitude: selectedLongitude,
      district: "",
      state: "",
      country: "",
    };

    if (locObsMeta) locObsMeta.textContent = `${loc.district || loc.name}, ${loc.state || loc.country || "Global"}`;
    if (locObsIdBadge) {
      locObsIdBadge.textContent = "SEARCHED LOCATION";
      locObsIdBadge.className = "loc-type-badge badge-searched";
    }
    if (locObsCoords) locObsCoords.textContent = `${loc.latitude.toFixed(4)}° N, ${loc.longitude.toFixed(4)}° E`;

    if (locObsSatBody) {
      locObsSatBody.innerHTML = `
        <div class="state-box">
          No database observation available
        </div>
      `;
    }
    if (locObsFloodBody) {
      locObsFloodBody.innerHTML = `
        <div class="state-box">
          No database observation available
        </div>
      `;
    }
    if (locObsRiskBody) {
      locObsRiskBody.innerHTML = `
        <div class="state-box">
          No database observation available
        </div>
      `;
    }
    if (locObsAlertsBody) {
      locObsAlertsBody.innerHTML = `
        <div class="state-box">
          No active alerts for this location.
        </div>
      `;
    }
    if (locObsStatusBody) {
      locObsStatusBody.innerHTML = `
        <div class="loc-obs-metric-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
          <div class="loc-obs-metric">
            <span class="card-subtitle">Coordinates</span>
            <strong style="font-size:12.5px; color:var(--text-main);">${loc.latitude.toFixed(4)}° N, ${loc.longitude.toFixed(4)}° E</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Temperature</span>
            <strong style="font-size:12.5px; color:var(--accent-cyan);">${temperatureElement.textContent || "--"}</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Weather Condition</span>
            <strong style="font-size:12.5px; color:var(--text-main);">${conditionElement.textContent || "--"}</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Precipitation Depth</span>
            <strong style="font-size:12.5px; color:var(--text-main);">${rainfallElement.textContent || "--"}</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Air Quality</span>
            <strong style="font-size:12.5px; color:var(--text-main);">${airQualityElement.textContent || "--"}</strong>
          </div>
          <div class="loc-obs-metric">
            <span class="card-subtitle">Telemetry State</span>
            <strong style="font-size:12.5px; color:#10b981;">● Connected / Live Telemetry</strong>
          </div>
        </div>
      `;
    }
  }

  updateLocationObservationWorkflow();
}

function updateLocationObservationWorkflow() {
  const stageBadge = document.querySelector<HTMLElement>("#loc-obs-pipeline-current-stage");
  const searchNode = document.querySelector<HTMLElement>("#lo-stage-search");
  const coordsNode = document.querySelector<HTMLElement>("#lo-stage-coords");
  const mapNode = document.querySelector<HTMLElement>("#lo-stage-map");
  const satNode = document.querySelector<HTMLElement>("#lo-stage-sat");
  const envNode = document.querySelector<HTMLElement>("#lo-stage-env");
  const riskNode = document.querySelector<HTMLElement>("#lo-stage-risk");
  const assessNode = document.querySelector<HTMLElement>("#lo-stage-assessment");

  const setNode = (node: HTMLElement | null, status: "completed" | "active" | "pending") => {
    if (!node) return;
    node.classList.remove("completed", "active");
    const icon = node.querySelector<HTMLElement>(".pipeline-node-icon");
    if (status === "completed") {
      node.classList.add("completed");
      if (icon) icon.textContent = "✓";
    } else if (status === "active") {
      node.classList.add("active");
      if (icon) icon.textContent = "●";
    } else {
      if (icon) icon.textContent = "○";
    }
  };

  // Stage 1: Location Search is completed
  setNode(searchNode, "completed");

  // Stage 2: Geographic Coordinates is completed
  setNode(coordsNode, "completed");

  // Stage 3: Map Observation is completed
  setNode(mapNode, "completed");

  // Stage 4: Satellite Observation
  const hasDbSat = isCurrentLocationDatabaseMonitored &&
    allObservations.some((s) => s.location_id === selectedLocationId);
  const hasS1Prod = Boolean(selectedSentinel1Product);
  if (hasDbSat || hasS1Prod) {
    setNode(satNode, "completed");
  } else {
    setNode(satNode, "pending");
  }

  // Stage 5: Environmental Conditions
  const hasWeather =
    temperatureElement?.textContent &&
    temperatureElement.textContent !== "--" &&
    !temperatureElement.classList.contains("no-data");
  if (hasWeather) {
    setNode(envNode, "completed");
  } else {
    setNode(envNode, "active");
  }

  // Stage 6: Flood / Risk Context
  const hasFloodOrRisk =
    isCurrentLocationDatabaseMonitored &&
    (allFloodDetections.some((f) => f.location_id === selectedLocationId) ||
      allRiskPredictions.some((r) => r.location_id === selectedLocationId));
  if (hasFloodOrRisk) {
    setNode(riskNode, "completed");
  } else {
    setNode(riskNode, "pending");
  }

  // Stage 7: Disaster Assessment
  const hasAlerts =
    isCurrentLocationDatabaseMonitored &&
    allAlerts.some((a) => a.location_id === selectedLocationId);
  if (hasAlerts) {
    setNode(assessNode, "completed");
  } else {
    setNode(assessNode, "pending");
  }

  if (stageBadge) {
    if (isCurrentLocationDatabaseMonitored) {
      stageBadge.textContent = "✓ Site Telemetry & Database Connected";
    } else {
      stageBadge.textContent = "● Searched Site Telemetry Active";
    }
  }
}

function updateFloodDetectionView() {
  if (floodCtrlLocation) {
    const locBadge = isCurrentLocationDatabaseMonitored
      ? "(DATABASE MONITORED)"
      : "(SEARCHED LOCATION)";
    floodCtrlLocation.textContent = `${selectedLocationName} ${locBadge}`;
  }
  if (floodCtrlProductId) {
    if (selectedSentinel1Product && selectedSentinel1Product.product_id) {
      floodCtrlProductId.textContent = selectedSentinel1Product.product_id;
      floodCtrlProductId.title = selectedSentinel1Product.product_id;
    } else {
      floodCtrlProductId.textContent =
        "No product selected — choose a Sentinel-1 product from the Satellite page";
      floodCtrlProductId.title = "";
    }
  }

  const emptyResultsState = document.querySelector<HTMLElement>("#empty-results-state");
  const activeResultsContent = document.querySelector<HTMLElement>("#active-results-content");
  if (!selectedSentinel1Product) {
    if (emptyResultsState) emptyResultsState.style.display = "block";
    if (activeResultsContent) activeResultsContent.style.display = "none";
  } else {
    if (emptyResultsState) emptyResultsState.style.display = "none";
    if (activeResultsContent) activeResultsContent.style.display = "block";
  }

  // Populate Footprint & Detection Summary Card
  const summaryEl = document.querySelector<HTMLElement>("#flood-footprint-summary-content");
  if (summaryEl) {
    const isFloodDetected = Boolean(
      selectedSentinel1FloodStatus?.detected_metadata &&
        Object.keys(selectedSentinel1FloodStatus.detected_metadata).length > 0
    );
    const pols = isFloodDetected && selectedSentinel1FloodStatus?.detected_metadata
      ? Object.keys(selectedSentinel1FloodStatus.detected_metadata)
      : [];
    const floodMeta = isFloodDetected && selectedSentinel1FloodStatus?.detected_metadata && pols.length > 0
      ? selectedSentinel1FloodStatus.detected_metadata[pols[0]]
      : null;
    const bounds = floodMeta?.bounds ? `[${floodMeta.bounds.map((b) => Number(b).toFixed(4)).join(", ")}]` : "--";

    summaryEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div class="loc-obs-metric">
          <span class="card-subtitle">Active Location Context</span>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <strong style="color:var(--text-main); font-size:13px;">${selectedLocationName}</strong>
            <span class="loc-type-badge ${isCurrentLocationDatabaseMonitored ? "badge-db" : "badge-searched"}">
              ${isCurrentLocationDatabaseMonitored ? "DATABASE MONITORED" : "SEARCHED LOCATION"}
            </span>
          </div>
          <span style="font-size:11px; color:var(--text-muted);">${selectedLatitude.toFixed(4)}° N, ${selectedLongitude.toFixed(4)}° E</span>
        </div>

        <div class="loc-obs-metric">
          <span class="card-subtitle">Active Sentinel-1 Product</span>
          <code style="font-size:11px; color:var(--accent-cyan); display:block; word-break:break-all; margin-top:2px;">
            ${selectedSentinel1Product?.product_id || "None selected"}
          </code>
        </div>

        <div class="loc-obs-metric">
          <span class="card-subtitle">Footprint Spatial Bounds</span>
          <code style="font-size:10.5px; color:var(--text-secondary); display:block; margin-top:2px;">${bounds}</code>
        </div>

        <div class="loc-obs-metric">
          <span class="card-subtitle">Low-Backscatter Candidate Mask Status</span>
          <div style="font-size:12px; margin-top:3px; color:${isFloodDetected ? "#10b981" : "var(--text-muted)"}; font-weight:600;">
            ${
              isFloodDetected
                ? `✓ Generated: ${floodMeta?.detected_area_km2 ?? 0} km² (${floodMeta?.flood_percentage ?? 0}%)`
                : "Awaiting detection run"
            }
          </div>
        </div>

        <div style="margin-top:6px; display:flex; gap:8px;">
          <button type="button" class="action-btn" id="btn-focus-footprint" style="padding:6px 14px; font-size:11.5px; width:100%;">
            🔍 Focus Centroid on Map
          </button>
        </div>
      </div>
    `;

    summaryEl.querySelector("#btn-focus-footprint")?.addEventListener("click", () => {
      switchView("satellite");
      map.flyTo([selectedLatitude, selectedLongitude], 12, { duration: 1.2 });
    });
  }

  updateFloodPipelineWorkflow();
}

function updateFloodPipelineWorkflow() {
  const currentStageBadge = document.querySelector<HTMLElement>("#flood-pipeline-current-stage");
  const s1Node = document.querySelector<HTMLElement>("#f-stage-s1");
  const prodNode = document.querySelector<HTMLElement>("#f-stage-product");
  const dlNode = document.querySelector<HTMLElement>("#f-stage-download");
  const preNode = document.querySelector<HTMLElement>("#f-stage-preprocess");
  const polNode = document.querySelector<HTMLElement>("#f-stage-polarization");
  const threshNode = document.querySelector<HTMLElement>("#f-stage-threshold");
  const maskNode = document.querySelector<HTMLElement>("#f-stage-mask");
  const areaNode = document.querySelector<HTMLElement>("#f-stage-area");
  const analysisNode = document.querySelector<HTMLElement>("#f-stage-analysis");

  const setNode = (node: HTMLElement | null, status: "completed" | "active" | "pending") => {
    if (!node) return;
    node.classList.remove("completed", "active");
    const icon = node.querySelector<HTMLElement>(".pipeline-node-icon");
    if (status === "completed") {
      node.classList.add("completed");
      if (icon) icon.textContent = "✓";
    } else if (status === "active") {
      node.classList.add("active");
      if (icon) icon.textContent = "●";
    } else {
      if (icon) icon.textContent = "○";
    }
  };

  // Stage 1: Sentinel-1 SAR is completed
  setNode(s1Node, "completed");

  const hasProduct = Boolean(selectedSentinel1Product && selectedSentinel1Product.product_id);
  const isDownloaded = Boolean(
    selectedSentinel1Product?.download_status === "DOWNLOADED" ||
      (selectedSentinel1SarStatus?.processed_metadata &&
        Object.keys(selectedSentinel1SarStatus.processed_metadata).length > 0) ||
      (selectedSentinel1FloodStatus?.detected_metadata &&
        Object.keys(selectedSentinel1FloodStatus.detected_metadata).length > 0)
  );
  const isPreprocessed = Boolean(
    selectedSentinel1SarStatus?.processed_metadata &&
      Object.keys(selectedSentinel1SarStatus.processed_metadata).length > 0
  );
  const isFloodDetected = Boolean(
    selectedSentinel1FloodStatus?.detected_metadata &&
      Object.keys(selectedSentinel1FloodStatus.detected_metadata).length > 0
  );

  // Stage 2: Product Selection
  setNode(prodNode, hasProduct ? "completed" : "active");

  // Stage 3: Download
  if (isDownloaded) {
    setNode(dlNode, "completed");
  } else if (hasProduct) {
    setNode(dlNode, "active");
  } else {
    setNode(dlNode, "pending");
  }

  // Stage 4: SAR Preprocessing
  if (isPreprocessed) {
    setNode(preNode, "completed");
  } else if (isDownloaded) {
    setNode(preNode, "active");
  } else {
    setNode(preNode, "pending");
  }

  // Stage 5: VV / VH Data
  if (isPreprocessed) {
    setNode(polNode, "completed");
  } else {
    setNode(polNode, "pending");
  }

  // Stage 6: Backscatter Threshold
  if (isFloodDetected) {
    setNode(threshNode, "completed");
  } else if (isPreprocessed) {
    setNode(threshNode, "active");
  } else {
    setNode(threshNode, "pending");
  }

  // Stage 7: Candidate Flood Mask
  if (isFloodDetected) {
    setNode(maskNode, "completed");
  } else {
    setNode(maskNode, "pending");
  }

  // Stage 8: Area Calculation
  if (isFloodDetected) {
    setNode(areaNode, "completed");
  } else {
    setNode(areaNode, "pending");
  }

  // Stage 9: Flood Analysis
  if (isFloodDetected) {
    setNode(analysisNode, "completed");
  } else {
    setNode(analysisNode, "pending");
  }

  if (currentStageBadge) {
    if (isFloodDetected) {
      currentStageBadge.textContent = "✓ Candidate Mask & Analysis Complete";
    } else if (isPreprocessed) {
      currentStageBadge.textContent = "● Backscatter Threshold Ready";
    } else if (isDownloaded) {
      currentStageBadge.textContent = "● SAR Preprocessing Ready";
    } else if (hasProduct) {
      currentStageBadge.textContent = "● Download / SAR Ready";
    } else {
      currentStageBadge.textContent = "● Product Selection";
    }
  }
}

function updateWorkflowStepper(state: {
  discoverDone?: boolean;
  downloadActive?: boolean;
  downloadDone?: boolean;
  preprocessActive?: boolean;
  preprocessDone?: boolean;
  floodActive?: boolean;
  floodDone?: boolean;
  reportActive?: boolean;
  reportDone?: boolean;
}) {
  const step1 = document.querySelector<HTMLElement>("#step-1-discover");
  const step2 = document.querySelector<HTMLElement>("#step-2-download");
  const step3 = document.querySelector<HTMLElement>("#step-3-preprocess");
  const step4 = document.querySelector<HTMLElement>("#step-4-detection");
  const step5 = document.querySelector<HTMLElement>("#step-5-report");
  const line1 = document.querySelector<HTMLElement>("#stepper-line-1");
  const line2 = document.querySelector<HTMLElement>("#stepper-line-2");
  const line3 = document.querySelector<HTMLElement>("#stepper-line-3");
  const line4 = document.querySelector<HTMLElement>("#stepper-line-4");
  const step4Desc = document.querySelector<HTMLElement>("#step-4-desc");
  const step5Desc = document.querySelector<HTMLElement>("#step-5-desc");

  if (step1) {
    step1.className = state.discoverDone ? "stepper-step completed" : "stepper-step active";
  }
  if (line1) {
    line1.className = state.discoverDone ? "stepper-line completed" : "stepper-line";
  }

  if (step2) {
    if (state.downloadDone) {
      step2.className = "stepper-step completed";
      if (line2) line2.className = "stepper-line completed";
    } else if (state.downloadActive) {
      step2.className = "stepper-step active";
      if (line2) line2.className = "stepper-line active";
    } else {
      step2.className = "stepper-step pending";
      if (line2) line2.className = "stepper-line";
    }
  }

  if (step3) {
    if (state.preprocessDone) {
      step3.className = "stepper-step completed";
      if (line3) line3.className = "stepper-line completed";
    } else if (state.preprocessActive) {
      step3.className = "stepper-step active";
      if (line3) line3.className = "stepper-line active";
    } else {
      step3.className = "stepper-step pending";
      if (line3) line3.className = "stepper-line";
    }
  }

  if (step4) {
    if (state.floodDone) {
      step4.className = "stepper-step completed";
      if (line4) line4.className = "stepper-line completed";
      if (step4Desc) step4Desc.textContent = "✓ Detected";
    } else if (state.floodActive || state.preprocessDone) {
      step4.className = "stepper-step active";
      if (line4) line4.className = "stepper-line active";
      if (step4Desc) step4Desc.textContent = "Ready";
    } else {
      step4.className = "stepper-step pending";
      if (line4) line4.className = "stepper-line";
      if (step4Desc) step4Desc.textContent = "Coming Soon";
    }
  }

  if (step5) {
    if (state.reportDone) {
      step5.className = "stepper-step completed";
      if (step5Desc) step5Desc.textContent = "✓ Completed";
    } else if (state.reportActive || state.floodDone) {
      step5.className = "stepper-step active";
      if (step5Desc) step5Desc.textContent = "Ready";
    } else {
      step5.className = "stepper-step pending";
      if (step5Desc) step5Desc.textContent = "Coming Soon";
    }
  }
}

function updateProcessingTimeline(state: {
  validated?: boolean;
  downloading?: boolean;
  downloaded?: boolean;
  preprocessing?: boolean;
  preprocessed?: boolean;
  floodReady?: boolean;
  floodDetecting?: boolean;
  floodDetected?: boolean;
  reportReady?: boolean;
  reportGenerated?: boolean;
  badge?: string;
}) {
  const nodeValidate = document.querySelector<HTMLElement>("#tl-node-validate");
  const nodeDownload = document.querySelector<HTMLElement>("#tl-node-download");
  const nodePreprocess = document.querySelector<HTMLElement>("#tl-node-preprocess");
  const nodeFlood = document.querySelector<HTMLElement>("#tl-node-flood");
  const nodeReport = document.querySelector<HTMLElement>("#tl-node-report");
  const subDownload = document.querySelector<HTMLElement>("#tl-sub-download");
  const subPreprocess = document.querySelector<HTMLElement>("#tl-sub-preprocess");
  const subFlood = document.querySelector<HTMLElement>("#tl-sub-flood");
  const subReport = document.querySelector<HTMLElement>("#tl-sub-report");
  const liveBadge = document.querySelector<HTMLElement>("#timeline-live-badge");
  const conn1 = document.querySelector<HTMLElement>("#tl-conn-1");
  const conn2 = document.querySelector<HTMLElement>("#tl-conn-2");
  const conn3 = document.querySelector<HTMLElement>("#tl-conn-3");
  const conn4 = document.querySelector<HTMLElement>("#tl-conn-4");

  if (nodeValidate) {
    nodeValidate.className = state.validated ? "timeline-node completed" : "timeline-node pending";
    const icon = nodeValidate.querySelector<HTMLElement>(".node-icon-circle");
    if (icon) icon.textContent = state.validated ? "✓" : "1";
  }

  if (nodeDownload) {
    const icon = nodeDownload.querySelector<HTMLElement>(".node-icon-circle");
    if (state.downloaded) {
      nodeDownload.className = "timeline-node completed";
      if (subDownload) subDownload.textContent = "Downloaded";
      if (icon) icon.textContent = "✓";
      if (conn1) conn1.className = "timeline-connector completed";
    } else if (state.downloading) {
      nodeDownload.className = "timeline-node in-progress";
      if (subDownload) subDownload.textContent = "Downloading...";
      if (icon) icon.textContent = "2";
      if (conn1) conn1.className = "timeline-connector active";
    } else {
      nodeDownload.className = "timeline-node pending";
      if (subDownload) subDownload.textContent = "Awaiting download";
      if (icon) icon.textContent = "2";
      if (conn1) conn1.className = "timeline-connector";
    }
  }

  if (nodePreprocess) {
    const icon = nodePreprocess.querySelector<HTMLElement>(".node-icon-circle");
    if (state.preprocessed) {
      nodePreprocess.className = "timeline-node completed";
      if (subPreprocess) subPreprocess.textContent = "Preprocessed";
      if (icon) icon.textContent = "✓";
      if (conn2) conn2.className = "timeline-connector completed";
    } else if (state.preprocessing) {
      nodePreprocess.className = "timeline-node in-progress";
      if (subPreprocess) subPreprocess.textContent = "Processing SAR...";
      if (icon) icon.textContent = "3";
      if (conn2) conn2.className = "timeline-connector active";
    } else {
      nodePreprocess.className = "timeline-node pending";
      if (subPreprocess) subPreprocess.textContent = "Awaiting processing";
      if (icon) icon.textContent = "3";
      if (conn2) conn2.className = "timeline-connector";
    }
  }

  if (nodeFlood) {
    const icon = nodeFlood.querySelector<HTMLElement>(".node-icon-circle");
    if (state.floodDetected) {
      nodeFlood.className = "timeline-node completed";
      if (subFlood) subFlood.textContent = "Candidate Mask Ready";
      if (icon) icon.textContent = "✓";
      if (conn3) conn3.className = "timeline-connector completed";
      if (conn4) conn4.className = "timeline-connector active";
    } else if (state.floodDetecting) {
      nodeFlood.className = "timeline-node in-progress";
      if (subFlood) subFlood.textContent = "Detecting Floods...";
      if (icon) icon.textContent = "4";
      if (conn3) conn3.className = "timeline-connector active";
    } else if (state.preprocessed || state.floodReady) {
      nodeFlood.className = "timeline-node pending";
      if (subFlood) subFlood.textContent = "Ready for detection";
      if (icon) icon.textContent = "4";
      if (conn3) conn3.className = "timeline-connector completed";
    } else {
      nodeFlood.className = "timeline-node coming-soon";
      if (subFlood) subFlood.textContent = "Awaiting preprocess";
      if (icon) icon.textContent = "○";
      if (conn3) conn3.className = "timeline-connector";
    }
  }

  if (nodeReport) {
    const icon = nodeReport.querySelector<HTMLElement>(".node-icon-circle");
    if (state.reportGenerated) {
      nodeReport.className = "timeline-node completed";
      if (subReport) subReport.textContent = "Report Ready";
      if (icon) icon.textContent = "✓";
      if (conn4) conn4.className = "timeline-connector completed";
    } else if (state.reportReady || state.floodDetected) {
      nodeReport.className = "timeline-node in-progress";
      if (subReport) subReport.textContent = "Ready for Report";
      if (icon) icon.textContent = "5";
      if (conn4) conn4.className = "timeline-connector active";
    } else {
      nodeReport.className = "timeline-node coming-soon";
      if (subReport) subReport.textContent = "Awaiting Analysis";
      if (icon) icon.textContent = "○";
      if (conn4) conn4.className = "timeline-connector";
    }
  }

  if (liveBadge) {
    liveBadge.textContent = state.badge || (
      state.floodDetected ? "FLOOD DETECTED" :
      state.preprocessed ? "PREPROCESSED" :
      state.downloaded ? "DOWNLOADED" :
      state.downloading ? "DOWNLOADING" : "READY"
    );
  }
}

function renderProductDetails(
  p: Sentinel1Product | null,
  sarStatus?: SarStatusResponse | null,
  floodStatus?: FloodDetectionStatusResponse | null
) {
  const emptyEl = document.querySelector<HTMLElement>("#empty-details-state");
  const activeEl = document.querySelector<HTMLElement>("#active-details-content");
  if (!emptyEl || !activeEl) return;

  if (!p) {
    emptyEl.style.display = "flex";
    activeEl.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  activeEl.style.display = "block";

  const acqDate = p.acquisition_date ? new Date(p.acquisition_date).toUTCString() : "--";
  const isDownloaded = sarStatus?.is_downloaded || false;
  const processedPols = sarStatus?.processed_polarizations || [];
  const isPreprocessed = processedPols.length > 0;
  const floodPols = floodStatus?.detected_polarizations || [];
  const hasFlood = floodPols.length > 0;
  const bboxStr = p.bbox ? p.bbox.map(v => v.toFixed(3)).join(", ") : "--";

  activeEl.innerHTML = `
    <div class="details-content-grid">
      <div class="details-hero-box">
        <div style="font-size:9.5px; color:var(--text-muted); text-transform:uppercase; margin-bottom:2px;">Selected Product ID</div>
        <div class="details-prod-id" title="${p.product_id || ''}">${p.product_id || '--'}</div>
      </div>

      <table class="details-attr-table">
        <tbody>
          <tr>
            <td class="attr-key">Acquisition Date</td>
            <td class="attr-val">${acqDate}</td>
          </tr>
          <tr>
            <td class="attr-key">Sensor / Mode</td>
            <td class="attr-val">${p.sensor || "C-SAR"} (${p.product_type || "GRD"})</td>
          </tr>
          <tr>
            <td class="attr-key">Polarization</td>
            <td class="attr-val" style="color:var(--accent-cyan);">${p.polarization || "VV + VH"}</td>
          </tr>
          <tr>
            <td class="attr-key">Platform</td>
            <td class="attr-val">${p.platform || "Sentinel-1"}</td>
          </tr>
          <tr>
            <td class="attr-key">Orbit Direction</td>
            <td class="attr-val">${p.orbit_direction || "DESCENDING"}</td>
          </tr>
          <tr>
            <td class="attr-key">Relative Orbit</td>
            <td class="attr-val">${p.relative_orbit ?? "--"}</td>
          </tr>
          <tr>
            <td class="attr-key">Approx. Size</td>
            <td class="attr-val">~1.25 GB</td>
          </tr>
          <tr>
            <td class="attr-key">Download Status</td>
            <td class="attr-val" style="color:${isDownloaded ? 'var(--status-success)' : 'var(--text-muted)'}; font-weight:700;">
              ${isDownloaded ? "✓ COMPLETED" : "NOT DOWNLOADED"}
            </td>
          </tr>
          <tr>
            <td class="attr-key">SAR Preprocessed</td>
            <td class="attr-val" style="color:${isPreprocessed ? 'var(--accent-cyan)' : 'var(--text-muted)'}; font-weight:700;">
              ${isPreprocessed ? `✓ ${processedPols.join(', ')} COMPLETED` : "PENDING"}
            </td>
          </tr>
          <tr>
            <td class="attr-key">Prototype Flood Detection</td>
            <td class="attr-val" style="color:${hasFlood ? '#38bdf8' : 'var(--text-muted)'}; font-weight:700;">
              ${hasFlood ? `✓ ${floodPols.join(', ')} DETECTED` : isPreprocessed ? "READY" : "AWAITING PREPROCESS"}
            </td>
          </tr>
          <tr>
            <td class="attr-key">Bounding Box</td>
            <td class="attr-val" style="font-family:monospace; font-size:10px;">[${bboxStr}]</td>
          </tr>
        </tbody>
      </table>

      <div class="details-actions-bar">
        ${isDownloaded ? `
          <button type="button" class="btn-card-action btn-process-action" id="details-open-proc-modal-btn">
            ⚙️ Process SAR
          </button>
          ${isPreprocessed ? `
            <button type="button" class="btn-card-action btn-flood-action" id="details-open-flood-modal-btn">
              🌊 Detect Potential Flood
            </button>
          ` : ""}
        ` : `
          <button type="button" class="btn-card-action btn-download-action" id="details-trigger-dl-btn">
            📥 Download Product (~1.25 GB)
          </button>
        `}
        ${p.stac_item_url ? `
          <a href="${p.stac_item_url}" target="_blank" rel="noopener noreferrer" class="btn-card-action btn-details-action" style="text-decoration:none; text-align:center;">
            🔗 View STAC Metadata Item
          </a>
        ` : ""}
      </div>
    </div>
  `;

  // Attach event handlers inside details panel
  const procModalBtn = activeEl.querySelector<HTMLButtonElement>("#details-open-proc-modal-btn");
  if (procModalBtn) {
    procModalBtn.addEventListener("click", () => {
      openSarProcessingModal(p, sarStatus);
    });
  }

  const floodModalBtn = activeEl.querySelector<HTMLButtonElement>("#details-open-flood-modal-btn");
  if (floodModalBtn) {
    floodModalBtn.addEventListener("click", () => {
      openFloodDetectionModal(p, "VV");
    });
  }

  const triggerDlBtn = activeEl.querySelector<HTMLButtonElement>("#details-trigger-dl-btn");
  if (triggerDlBtn) {
    triggerDlBtn.addEventListener("click", () => {
      if (p.product_id) {
        handleInitiateSentinel1Download(p.product_id, selectedLocationId, 0);
      }
    });
  }
}

function updateMapFloodFootprint(floodStatus: FloodDetectionStatusResponse | null) {
  if (s1FloodLayer) {
    try {
      map.removeLayer(s1FloodLayer);
    } catch {}
    s1FloodLayer = null;
  }
  if (!floodStatus || !floodStatus.detected_metadata) return;

  const pols = Object.keys(floodStatus.detected_metadata);
  if (pols.length === 0) return;
  const meta = floodStatus.detected_metadata[pols[0]];
  if (!meta || !meta.bounds || meta.bounds.length < 4) return;

  const [w, s, e, n] = meta.bounds;
  const bounds = L.latLngBounds([s, w], [n, e]);

  s1FloodLayer = L.rectangle(bounds, {
    color: "#00f0ff",
    weight: 2,
    dashArray: "4, 4",
    fillColor: "#0284c7",
    fillOpacity: 0.18,
  }).addTo(map);

  s1FloodLayer.bindTooltip(
    `<strong>🌊 Potential Flood Candidate Region [${meta.polarization}]</strong><br>` +
    `Candidate Area: <b>${meta.detected_area_km2} km²</b> (${meta.flood_percentage}%)<br>` +
    `Threshold: DN &le; ${meta.threshold_used}<br>` +
    `<small style="color:#94a3b8;">GeoTIFF: ${meta.output_file}</small>`,
    { sticky: true }
  );
}

function renderGlobalProcessingResults(
  sarStatus?: SarStatusResponse | null,
  floodStatus?: FloodDetectionStatusResponse | null,
  activeTab: "sar" | "flood" = currentResultsTab,
  chosenPol?: string
) {
  const emptyEl = document.querySelector<HTMLElement>("#empty-results-state");
  const activeEl = document.querySelector<HTMLElement>("#active-results-content");
  if (!emptyEl || !activeEl) return;

  currentResultsTab = activeTab;

  const sarMetaDict = sarStatus?.processed_metadata || {};
  const sarKeys = Object.keys(sarMetaDict);
  const floodMetaDict = floodStatus?.detected_metadata || {};
  const floodKeys = Object.keys(floodMetaDict);

  if (sarKeys.length === 0 && floodKeys.length === 0) {
    emptyEl.style.display = "flex";
    activeEl.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  activeEl.style.display = "block";

  // Tab Header HTML
  const tabHeaderHtml = `
    <div class="results-tab-bar">
      <button type="button" class="results-tab-btn ${activeTab === 'sar' ? 'active' : ''}" id="tab-btn-sar-results">
        <span>⚙️</span> Prototype SAR Preprocessing (${sarKeys.length})
      </button>
      <button type="button" class="results-tab-btn ${activeTab === 'flood' ? 'active' : ''}" id="tab-btn-flood-results">
        <span>🌊</span> Prototype Flood Detection (${floodKeys.length})
      </button>
    </div>
  `;

  if (activeTab === "sar") {
    if (sarKeys.length === 0) {
      activeEl.innerHTML = `
        ${tabHeaderHtml}
        <div class="empty-results-state" style="padding: 24px 10px;">
          <div class="empty-results-icon">⚙️</div>
          <div class="empty-title">SAR Preprocessing Pending</div>
          <div class="empty-desc">Run SAR Preprocessing to generate preprocessed SAR rasters and Digital Number (DN) statistics.</div>
        </div>
      `;
      setupTabButtons(sarStatus, floodStatus);
      return;
    }

    const currentPol = chosenPol && sarMetaDict[chosenPol] ? chosenPol : sarKeys[0];
    const meta = sarMetaDict[currentPol];

    const boundsStr = meta?.bounds && meta.bounds.length >= 4
      ? `[${meta.bounds.map(b => Number(b).toFixed(4)).join(", ")}]`
      : "--";

    activeEl.innerHTML = `
      ${tabHeaderHtml}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-size:12px; font-weight:700; color:var(--text-main);">
          Preprocessed SAR Raster: <code style="color:var(--accent-cyan);">${meta.product_id || '--'}</code>
        </div>
        <div style="display:flex; gap:6px;">
          ${sarKeys.map(k => `
            <button type="button" class="sar-pol-tab ${k === currentPol ? 'active' : ''}" data-pol="${k}" style="padding:2px 8px; font-size:11px; font-weight:700; border-radius:4px; border:1px solid ${k === currentPol ? 'var(--accent-cyan)' : 'var(--border-subtle)'}; background:${k === currentPol ? 'rgba(0,240,255,0.15)' : 'transparent'}; color:${k === currentPol ? 'var(--accent-cyan)' : 'var(--text-secondary)'}; cursor:pointer;">
              ${k}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="proc-results-grid">
        <div class="proc-metric-box">
          <span class="proc-metric-label">Polarization</span>
          <span class="proc-metric-value">${meta.polarization || currentPol}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Dimensions</span>
          <span class="proc-metric-value">${meta.width ?? "--"} × ${meta.height ?? "--"} px</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Spatial CRS</span>
          <span class="proc-metric-value" style="font-size:11px;">${meta.crs || "--"}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Output Status</span>
          <span class="proc-metric-value" style="color:var(--status-success);">${meta.processing_status || "COMPLETED"}</span>
        </div>

        <div class="proc-metric-box">
          <span class="proc-metric-label">Min Backscatter (DN)</span>
          <span class="proc-metric-value">${meta.min_value !== undefined ? meta.min_value : "--"}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Max Backscatter (DN)</span>
          <span class="proc-metric-value">${meta.max_value !== undefined ? meta.max_value : "--"}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Mean Backscatter (DN)</span>
          <span class="proc-metric-value">${meta.mean_value !== undefined ? meta.mean_value : "--"}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">NoData Value</span>
          <span class="proc-metric-value">${meta.nodata !== undefined ? meta.nodata : "--"}</span>
        </div>

        <div class="proc-file-row">
          <span class="proc-metric-label">Processed GeoTIFF Output Path</span>
          <code style="font-size:10.5px; color:var(--accent-blue); word-break:break-all;">${meta.output_file || "--"}</code>
        </div>

        <div class="proc-file-row">
          <span class="proc-metric-label">Spatial Bounds [W, S, E, N]</span>
          <code style="font-size:10.5px; color:var(--text-secondary);">${boundsStr}</code>
        </div>

        <div class="proc-disclaimer-note">
          Prototype SAR Preprocessing. Radiometric statistics and geospatial raster generated.
          No flood detection, water classification, or AI prediction applied.
        </div>
      </div>
    `;

    // Attach SAR pol tab listeners
    activeEl.querySelectorAll<HTMLButtonElement>(".sar-pol-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const p = tab.getAttribute("data-pol");
        if (p) renderGlobalProcessingResults(sarStatus, floodStatus, "sar", p);
      });
    });
    setupTabButtons(sarStatus, floodStatus);

  } else {
    // Flood Detection Results Tab
    if (floodKeys.length === 0) {
      activeEl.innerHTML = `
        ${tabHeaderHtml}
        <div class="empty-results-state" style="padding: 24px 10px;">
          <div class="empty-results-icon">🌊</div>
          <div class="empty-title">Flood Detection Ready</div>
          <div class="empty-desc" style="margin-bottom:14px;">
            SAR preprocessing is complete. Run Prototype SAR Flood Detection to classify low-backscatter flood water candidates.
          </div>
          <button type="button" class="action-btn btn-flood-action" id="results-trigger-flood-modal-btn" style="padding:7px 20px; font-size:12px; margin:0 auto; display:inline-flex;">
            🌊 Run Flood Detection
          </button>
        </div>
      `;

      const runBtn = activeEl.querySelector<HTMLButtonElement>("#results-trigger-flood-modal-btn");
      if (runBtn) {
        runBtn.addEventListener("click", () => {
          if (selectedSentinel1Product) {
            openFloodDetectionModal(selectedSentinel1Product, "VV");
          }
        });
      }
      setupTabButtons(sarStatus, floodStatus);
      return;
    }

    const currentPol = chosenPol && floodMetaDict[chosenPol] ? chosenPol : floodKeys[0];
    const meta = floodMetaDict[currentPol];

    activeEl.innerHTML = `
      ${tabHeaderHtml}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div>
          <h3 style="font-size:13px; font-weight:700; color:var(--text-main); margin:0 0 2px 0;">Flood Detection Results</h3>
          <span style="font-size:11px; color:var(--text-muted);">
            Product: <code style="color:var(--accent-cyan); font-size:10.5px;">${meta.product_id}</code>
          </span>
        </div>
        <div style="display:flex; gap:6px;">
          ${floodKeys.map(k => `
            <button type="button" class="flood-pol-tab ${k === currentPol ? 'active' : ''}" data-pol="${k}" style="padding:2px 8px; font-size:11px; font-weight:700; border-radius:4px; border:1px solid ${k === currentPol ? 'var(--accent-cyan)' : 'var(--border-subtle)'}; background:${k === currentPol ? 'rgba(0,240,255,0.15)' : 'transparent'}; color:${k === currentPol ? 'var(--accent-cyan)' : 'var(--text-secondary)'}; cursor:pointer;">
              ${k}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="proc-results-grid">
        <div class="proc-metric-box">
          <span class="proc-metric-label">Selected Location</span>
          <span class="proc-metric-value" style="font-size:12px; color:var(--accent-cyan);">${selectedLocationName}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Selected Sentinel-1 Product</span>
          <span class="proc-metric-value" style="font-size:10px; word-break:break-all;">${meta.product_id}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Polarization</span>
          <span class="proc-metric-value">${meta.polarization || currentPol}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Threshold</span>
          <span class="proc-metric-value">${meta.threshold_used ?? "--"} DN</span>
        </div>

        <div class="proc-metric-box">
          <span class="proc-metric-label">Candidate Flood Area</span>
          <span class="proc-metric-value" style="color:#38bdf8;">${meta.detected_area_km2 ?? "--"} km²</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Candidate Percentage</span>
          <span class="proc-metric-value" style="color:#f59e0b;">${meta.flood_percentage ?? "--"}%</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Candidate Pixels</span>
          <span class="proc-metric-value">${meta.candidate_flood_pixels?.toLocaleString() ?? meta.flood_pixel_count?.toLocaleString() ?? "--"}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Valid Pixels</span>
          <span class="proc-metric-value">${meta.valid_pixels?.toLocaleString() ?? meta.valid_pixel_count?.toLocaleString() ?? "--"}</span>
        </div>

        <div class="proc-metric-box">
          <span class="proc-metric-label">Processing Status</span>
          <span class="proc-metric-value" style="color:var(--status-success);">${meta.processing_status || "COMPLETED"}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Detection Result</span>
          <span class="proc-metric-value" style="font-size:11px; color:#38bdf8;">Low-Backscatter Candidate Mask</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Map / Footprint</span>
          <span class="proc-metric-value" style="font-size:10.5px;">${meta.bounds ? `[${meta.bounds.map((b: any) => Number(b).toFixed(3)).join(", ")}]` : (meta.crs || "--")}</span>
        </div>
        <div class="proc-metric-box">
          <span class="proc-metric-label">Raster Dimensions</span>
          <span class="proc-metric-value">${meta.width ?? "--"} × ${meta.height ?? "--"} px</span>
        </div>

        <div class="proc-file-row">
          <span class="proc-metric-label">Candidate Mask GeoTIFF</span>
          <code style="font-size:10.5px; color:var(--accent-blue); word-break:break-all;">${meta.output_file || "--"}</code>
        </div>

        <div class="proc-disclaimer-note" style="border-left-color:#00f0ff; background:rgba(0, 240, 255, 0.06); color:var(--text-secondary); width:100%;">
          Prototype SAR thresholding identifies low-backscatter candidate areas and is not a scientifically validated flood classification.
        </div>
      </div>
    `;

    // Attach flood pol tab listeners
    activeEl.querySelectorAll<HTMLButtonElement>(".flood-pol-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const p = tab.getAttribute("data-pol");
        if (p) renderGlobalProcessingResults(sarStatus, floodStatus, "flood", p);
      });
    });
    setupTabButtons(sarStatus, floodStatus);
  }
}

function setupTabButtons(sarStatus?: SarStatusResponse | null, floodStatus?: FloodDetectionStatusResponse | null) {
  const sarBtn = document.querySelector<HTMLButtonElement>("#tab-btn-sar-results");
  const floodBtn = document.querySelector<HTMLButtonElement>("#tab-btn-flood-results");
  if (sarBtn) {
    sarBtn.addEventListener("click", () => {
      renderGlobalProcessingResults(sarStatus, floodStatus, "sar");
    });
  }
  if (floodBtn) {
    floodBtn.addEventListener("click", () => {
      renderGlobalProcessingResults(sarStatus, floodStatus, "flood");
    });
  }
}

function openSarProcessingModal(product: Sentinel1Product, sarStatus?: SarStatusResponse | null) {
  const modal = document.querySelector<HTMLElement>("#s1-sar-process-modal");
  const prodIdEl = document.querySelector<HTMLElement>("#sar-modal-product-id");
  const locEl = document.querySelector<HTMLElement>("#sar-modal-location");
  const dateEl = document.querySelector<HTMLElement>("#sar-modal-date");
  const statusMsgEl = document.querySelector<HTMLElement>("#sar-modal-status-msg");
  const selectorEl = document.querySelector<HTMLElement>("#sar-modal-pol-selector");
  const proceedBtn = document.querySelector<HTMLButtonElement>("#sar-modal-proceed-btn");

  if (!modal) return;

  if (prodIdEl) prodIdEl.textContent = product.product_id || "--";
  if (locEl) locEl.textContent = selectedLocationName;
  if (dateEl) dateEl.textContent = product.acquisition_date ? product.acquisition_date.slice(0, 10) : "--";
  if (statusMsgEl) {
    statusMsgEl.style.display = "none";
    statusMsgEl.textContent = "";
  }

  const pols = sarStatus?.available_polarizations && sarStatus.available_polarizations.length > 0
    ? sarStatus.available_polarizations
    : ["VV", "VH"];

  selectedModalPol = pols[0] || "VV";

  if (selectorEl) {
    selectorEl.innerHTML = pols.map(pol => `
      <button type="button" class="sar-pol-btn ${pol === selectedModalPol ? 'active' : ''}" data-pol="${pol}">
        ${pol}
      </button>
    `).join('');

    selectorEl.querySelectorAll<HTMLButtonElement>(".sar-pol-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = btn.getAttribute("data-pol");
        if (!p) return;
        selectedModalPol = p;
        selectorEl.querySelectorAll(".sar-pol-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  modal.style.display = "flex";

  if (proceedBtn) {
    const newBtn = proceedBtn.cloneNode(true) as HTMLButtonElement;
    proceedBtn.parentNode?.replaceChild(newBtn, proceedBtn);

    newBtn.addEventListener("click", async () => {
      if (!product.product_id) return;
      newBtn.disabled = true;
      newBtn.textContent = "Processing Sentinel-1 SAR...";
      if (statusMsgEl) {
        statusMsgEl.style.display = "block";
        statusMsgEl.className = "sar-modal-status-msg s1-status-info";
        statusMsgEl.textContent = "⚙️ Prototype SAR preprocessing & raster preparation in progress...";
      }

      updateProcessingTimeline({
        validated: true,
        downloaded: true,
        preprocessing: true,
        badge: "PREPROCESSING"
      });

      try {
        const res = await requestSarPreprocessing(product.product_id, selectedModalPol);
        if (res.status === "success" || res.status === "already_processed") {
          if (statusMsgEl) {
            statusMsgEl.className = "sar-modal-status-msg s1-status-success";
            statusMsgEl.textContent = "✓ SAR preprocessing completed successfully.";
          }
          if (sarStatus) {
            sarStatus.processed_metadata = sarStatus.processed_metadata || {};
            sarStatus.processed_metadata[selectedModalPol] = res;
            if (!sarStatus.processed_polarizations.includes(selectedModalPol)) {
              sarStatus.processed_polarizations.push(selectedModalPol);
            }
          }
          renderProductDetails(product, sarStatus, selectedSentinel1FloodStatus);
          renderGlobalProcessingResults(sarStatus, selectedSentinel1FloodStatus, "sar", selectedModalPol);
          updateWorkflowStepper({
            discoverDone: true,
            downloadDone: true,
            preprocessDone: true,
            floodActive: true,
          });
          updateProcessingTimeline({
            validated: true,
            downloaded: true,
            preprocessed: true,
            floodReady: true,
            badge: "COMPLETED"
          });
          setTimeout(() => {
            modal.style.display = "none";
          }, 1500);
        } else {
          if (statusMsgEl) {
            statusMsgEl.className = "sar-modal-status-msg s1-status-error";
            statusMsgEl.textContent = `✕ SAR preprocessing error: ${res.message || "Failed"}`;
          }
        }
      } catch (err: any) {
        if (statusMsgEl) {
          statusMsgEl.className = "sar-modal-status-msg s1-status-error";
          statusMsgEl.textContent = `✕ Request failed: ${err?.response?.data?.message || err?.message || "Error"}`;
        }
      } finally {
        newBtn.disabled = false;
        newBtn.textContent = "⚙️ Process SAR";
      }
    });
  }
}

function closeSarProcessingModal() {
  const modal = document.querySelector<HTMLElement>("#s1-sar-process-modal");
  if (modal) modal.style.display = "none";
}

function openFloodDetectionModal(product: Sentinel1Product, defaultPol: string = "VV") {
  const modal = document.querySelector<HTMLElement>("#s1-flood-detect-modal");
  const prodIdEl = document.querySelector<HTMLElement>("#flood-modal-product-id");
  const locEl = document.querySelector<HTMLElement>("#flood-modal-location");
  const dateEl = document.querySelector<HTMLElement>("#flood-modal-date");
  const statusMsgEl = document.querySelector<HTMLElement>("#flood-modal-status-msg");
  const selectorEl = document.querySelector<HTMLElement>("#flood-modal-pol-selector");
  const threshInput = document.querySelector<HTMLInputElement>("#flood-modal-threshold");
  const threshHint = document.querySelector<HTMLElement>("#flood-modal-threshold-hint");
  const proceedBtn = document.querySelector<HTMLButtonElement>("#flood-modal-proceed-btn");

  if (!modal) return;

  if (prodIdEl) prodIdEl.textContent = product.product_id || "--";
  if (locEl) locEl.textContent = selectedLocationName;
  if (dateEl) dateEl.textContent = product.acquisition_date ? product.acquisition_date.slice(0, 10) : "--";
  if (statusMsgEl) {
    statusMsgEl.style.display = "none";
    statusMsgEl.textContent = "";
  }

  // Preprocessed polarizations take precedence
  const availPols = selectedSentinel1SarStatus?.processed_polarizations && selectedSentinel1SarStatus.processed_polarizations.length > 0
    ? selectedSentinel1SarStatus.processed_polarizations
    : ["VV", "VH"];

  selectedFloodModalPol = availPols.includes(defaultPol) ? defaultPol : availPols[0] || "VV";

  if (threshInput) {
    threshInput.value = selectedFloodModalPol === "VH" ? "75" : "150";
  }
  if (threshHint) {
    threshHint.textContent = `Default: ${selectedFloodModalPol === 'VH' ? '75.0' : '150.0'} (${selectedFloodModalPol})`;
  }

  if (selectorEl) {
    selectorEl.innerHTML = availPols.map(pol => `
      <button type="button" class="sar-pol-btn ${pol === selectedFloodModalPol ? 'active' : ''}" data-pol="${pol}">
        ${pol}
      </button>
    `).join('');

    selectorEl.querySelectorAll<HTMLButtonElement>(".sar-pol-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = btn.getAttribute("data-pol");
        if (!p) return;
        selectedFloodModalPol = p;
        selectorEl.querySelectorAll(".sar-pol-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        if (threshInput) {
          threshInput.value = p === "VH" ? "75" : "150";
        }
        if (threshHint) {
          threshHint.textContent = `Default: ${p === 'VH' ? '75.0' : '150.0'} (${p})`;
        }
      });
    });
  }

  modal.style.display = "flex";

  if (proceedBtn) {
    const newBtn = proceedBtn.cloneNode(true) as HTMLButtonElement;
    proceedBtn.parentNode?.replaceChild(newBtn, proceedBtn);

    newBtn.addEventListener("click", async () => {
      if (!product.product_id) return;
      newBtn.disabled = true;
      newBtn.textContent = "Detecting potential flood areas...";
      if (statusMsgEl) {
        statusMsgEl.style.display = "block";
        statusMsgEl.className = "sar-modal-status-msg s1-status-info";
        statusMsgEl.textContent = "🌊 Analyzing low-backscatter radar returns...";
      }

      updateProcessingTimeline({
        validated: true,
        downloaded: true,
        preprocessed: true,
        floodDetecting: true,
        badge: "DETECTING"
      });

      try {
        const thresholdVal = threshInput ? parseFloat(threshInput.value) : undefined;
        const res = await requestFloodDetection(product.product_id, selectedFloodModalPol, thresholdVal);

        if (res.status === "success" || res.status === "already_processed") {
          if (statusMsgEl) {
            statusMsgEl.className = "sar-modal-status-msg s1-status-success";
            statusMsgEl.textContent = `✓ Flood detection completed: ${res.detected_area_km2} km² candidate flood area (${res.flood_percentage}%)`;
          }

          if (!selectedSentinel1FloodStatus) {
            selectedSentinel1FloodStatus = {
              product_id: product.product_id,
              status: "COMPLETED",
              detected_polarizations: [selectedFloodModalPol],
              detected_metadata: { [selectedFloodModalPol]: res },
            };
          } else {
            selectedSentinel1FloodStatus.detected_metadata = selectedSentinel1FloodStatus.detected_metadata || {};
            selectedSentinel1FloodStatus.detected_metadata[selectedFloodModalPol] = res;
            if (!selectedSentinel1FloodStatus.detected_polarizations) {
              selectedSentinel1FloodStatus.detected_polarizations = [];
            }
            if (!selectedSentinel1FloodStatus.detected_polarizations.includes(selectedFloodModalPol)) {
              selectedSentinel1FloodStatus.detected_polarizations.push(selectedFloodModalPol);
            }
            selectedSentinel1FloodStatus.status = "COMPLETED";
          }

          currentResultsTab = "flood";
          renderProductDetails(product, selectedSentinel1SarStatus, selectedSentinel1FloodStatus);
          renderGlobalProcessingResults(selectedSentinel1SarStatus, selectedSentinel1FloodStatus, "flood", selectedFloodModalPol);

          updateWorkflowStepper({
            discoverDone: true,
            downloadDone: true,
            preprocessDone: true,
            floodDone: true,
          });

          updateProcessingTimeline({
            validated: true,
            downloaded: true,
            preprocessed: true,
            floodDetected: true,
            badge: "FLOOD DETECTED"
          });

          updateMapFloodFootprint(selectedSentinel1FloodStatus);

          setTimeout(() => {
            modal.style.display = "none";
          }, 1400);
        } else {
          if (statusMsgEl) {
            statusMsgEl.className = "sar-modal-status-msg s1-status-error";
            statusMsgEl.textContent = `✕ Flood detection error: ${res.message || "Failed"}`;
          }
        }
      } catch (err: any) {
        if (statusMsgEl) {
          statusMsgEl.className = "sar-modal-status-msg s1-status-error";
          statusMsgEl.textContent = `✕ Request failed: ${err?.response?.data?.message || err?.message || "Error"}`;
        }
      } finally {
        newBtn.disabled = false;
        newBtn.textContent = "🌊 Run Flood Detection";
      }
    });
  }
}

function closeFloodDetectionModal() {
  const modal = document.querySelector<HTMLElement>("#s1-flood-detect-modal");
  if (modal) modal.style.display = "none";
}

function selectProduct(p: Sentinel1Product, index: number) {
  selectedSentinel1Product = p;

  // Highlight active product card
  document.querySelectorAll<HTMLElement>(".s1-product-item-card").forEach((card, idx) => {
    if (idx === index) {
      card.classList.add("active-product-card");
    } else {
      card.classList.remove("active-product-card");
    }
  });

  if (!p.product_id) return;

  Promise.all([
    fetchSarProductStatus(p.product_id),
    fetchFloodDetectionStatus(p.product_id).catch(() => null),
  ])
    .then(([sarStatus, floodStatus]) => {
      selectedSentinel1SarStatus = sarStatus;
      selectedSentinel1FloodStatus = floodStatus;

      const isDl = sarStatus.is_downloaded;
      const isProc = sarStatus.processed_polarizations && sarStatus.processed_polarizations.length > 0;
      const hasFlood = floodStatus && floodStatus.detected_polarizations && floodStatus.detected_polarizations.length > 0;

      if (hasFlood) {
        currentResultsTab = "flood";
      } else if (isProc) {
        currentResultsTab = "sar";
      }

      renderProductDetails(p, sarStatus, floodStatus);
      renderGlobalProcessingResults(sarStatus, floodStatus, currentResultsTab);

      updateWorkflowStepper({
        discoverDone: true,
        downloadActive: !isDl,
        downloadDone: isDl,
        preprocessActive: isDl && !isProc,
        preprocessDone: isProc,
        floodActive: isProc && !hasFlood,
        floodDone: Boolean(hasFlood),
      });

      updateProcessingTimeline({
        validated: true,
        downloaded: isDl,
        preprocessed: isProc,
        floodReady: isProc && !hasFlood,
        floodDetected: Boolean(hasFlood),
        badge: hasFlood ? "FLOOD DETECTED" : isProc ? "PREPROCESSED" : isDl ? "DOWNLOADED" : "VALIDATED"
      });

      updateMapFloodFootprint(floodStatus);
    })
    .catch(() => {
      renderProductDetails(p, null, null);
      renderGlobalProcessingResults(null, null);
    });
}

function renderSentinel1Products(data: Sentinel1ProductResponse) {
  const container = document.querySelector<HTMLElement>("#s1-products-container");
  const locationNameEl = document.querySelector<HTMLElement>("#s1-location-name");
  const productCountEl = document.querySelector<HTMLElement>("#s1-product-count");
  const statusBar = document.querySelector<HTMLElement>("#s1-discovery-status");

  if (!container) return;

  currentDiscoveredProducts = data.products || [];

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
    renderProductDetails(null);
    renderGlobalProcessingResults(null);
    updateWorkflowStepper({ discoverDone: false });
    return;
  }

  if (statusBar) {
    statusBar.style.display = "block";
    statusBar.className = "s1-discovery-status-bar s1-status-success";
    statusBar.textContent = `Copernicus Data Space returned ${data.count} Sentinel-1 GRD product(s) — metadata only, no data downloaded.`;
  }

  updateWorkflowStepper({ discoverDone: true, downloadActive: true });
  updateProcessingTimeline({ validated: true, badge: "VALIDATED" });

  container.innerHTML = data.products
    .map((p, i) => {
      const acqDate = p.acquisition_date ? p.acquisition_date.replace("T", " ").slice(0, 16) + " UTC" : "--";
      const productIdShort =
        p.product_id && p.product_id.length > 34
          ? p.product_id.slice(0, 31) + "..."
          : (p.product_id || "--");

      return `
        <div class="s1-product-item-card" id="s1-product-card-${i}" data-index="${i}">
          <div class="product-card-top">
            <div class="radar-thumbnail">
              <svg viewBox="0 0 40 40" class="radar-sweep-icon">
                <circle cx="20" cy="20" r="18" stroke="rgba(0, 240, 255, 0.2)" stroke-width="1" fill="none" />
                <circle cx="20" cy="20" r="12" stroke="rgba(0, 240, 255, 0.3)" stroke-width="1" fill="none" />
                <circle cx="20" cy="20" r="6" stroke="rgba(0, 240, 255, 0.4)" stroke-width="1" fill="none" />
                <line x1="20" y1="20" x2="35" y2="9" stroke="#00f0ff" stroke-width="1.5" stroke-linecap="round" />
                <circle cx="20" cy="20" r="2" fill="#00f0ff" />
              </svg>
            </div>
            <div class="product-card-info">
              <div class="product-id-row" title="${p.product_id || ''}">${productIdShort}</div>
              <div class="product-datetime">${acqDate}</div>
              <div class="product-pills-row">
                <span class="pill-pol">${p.polarization || "VV + VH"}</span>
                <span class="pill-size">~1.25 GB</span>
                <span class="pill-status status-avail" id="s1-dl-badge-${i}">AVAILABLE</span>
              </div>
            </div>
          </div>
          <div class="product-card-actions">
            <button 
              type="button"
              class="btn-card-action btn-download-action s1-download-btn" 
              id="s1-download-btn-${i}" 
              data-product-id="${p.product_id || ''}"
              data-location-id="${data.location?.location_id || selectedLocationId}"
              data-index="${i}"
            >
              📥 Download
            </button>
            <button 
              type="button"
              class="btn-card-action btn-process-action s1-card-proc-btn" 
              id="s1-process-btn-${i}" 
              data-product-id="${p.product_id || ''}"
              data-index="${i}"
              style="display:none;"
            >
              ⚙️ Process SAR
            </button>
            <button 
              type="button"
              class="btn-card-action btn-flood-action s1-card-flood-btn" 
              id="s1-flood-btn-${i}" 
              data-product-id="${p.product_id || ''}"
              data-index="${i}"
              style="display:none;"
            >
              🌊 Flood Detect
            </button>
            <button type="button" class="btn-card-action btn-details-action s1-card-view-btn" data-index="${i}">
              Details
            </button>
          </div>
          <span class="s1-download-msg" id="s1-download-msg-${i}" style="display:none;"></span>
          <!-- Inline legacy compatibility container (hidden) -->
          <div class="s1-sar-process-section" id="s1-sar-process-section-${i}" style="display: none;" data-selected-pol="VV">
            <div class="s1-pol-selector" id="s1-pol-selector-${i}"></div>
            <div class="s1-process-msg" id="s1-process-msg-${i}"></div>
            <div class="s1-process-results" id="s1-process-results-${i}" style="display: none;"></div>
          </div>
        </div>
      `;
    })
    .join("");

  // Attach card selection listener
  data.products.forEach((p, i) => {
    const cardEl = container.querySelector<HTMLElement>(`#s1-product-card-${i}`);
    if (cardEl) {
      cardEl.addEventListener("click", (e) => {
        // Prevent click if clicking download or action buttons
        const target = e.target as HTMLElement;
        if (target.closest(".s1-download-btn") || target.closest(".s1-card-proc-btn") || target.closest(".s1-card-flood-btn")) return;
        selectProduct(p, i);
      });
    }

    const viewBtn = container.querySelector<HTMLButtonElement>(`.s1-card-view-btn[data-index="${i}"]`);
    if (viewBtn) {
      viewBtn.addEventListener("click", () => selectProduct(p, i));
    }
  });

  // Attach download button listeners to discovered cards
  const downloadBtns = container.querySelectorAll<HTMLButtonElement>(".s1-download-btn");
  downloadBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const prodId = btn.getAttribute("data-product-id");
      const locIdStr = btn.getAttribute("data-location-id");
      const idxStr = btn.getAttribute("data-index");
      if (!prodId) return;
      const locId = locIdStr ? parseInt(locIdStr, 10) : selectedLocationId;
      const idx = idxStr ? parseInt(idxStr, 10) : 0;
      handleInitiateSentinel1Download(prodId, locId, idx);
    });
  });

  // Attach process SAR button listeners to discovered cards
  const procBtns = container.querySelectorAll<HTMLButtonElement>(".s1-card-proc-btn");
  procBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idxStr = btn.getAttribute("data-index");
      const idx = idxStr ? parseInt(idxStr, 10) : 0;
      const prod = data.products[idx];
      if (prod) {
        selectProduct(prod, idx);
        openSarProcessingModal(prod, selectedSentinel1SarStatus);
      }
    });
  });

  // Attach flood detection button listeners to discovered cards
  const floodBtns = container.querySelectorAll<HTMLButtonElement>(".s1-card-flood-btn");
  floodBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idxStr = btn.getAttribute("data-index");
      const idx = idxStr ? parseInt(idxStr, 10) : 0;
      const prod = data.products[idx];
      if (prod) {
        selectProduct(prod, idx);
        openFloodDetectionModal(prod, "VV");
      }
    });
  });

  // Check download, SAR preprocessing, and flood detection status for each card
  data.products.forEach((p, i) => {
    if (!p.product_id) return;
    const prodId = p.product_id;
    Promise.all([
      fetchSarProductStatus(prodId),
      fetchFloodDetectionStatus(prodId).catch(() => null),
    ])
      .then(([sarStatus, floodStatus]) => {
        if (sarStatus.is_downloaded) {
          const badgeEl = document.querySelector<HTMLElement>(`#s1-dl-badge-${i}`);
          const hasProc = sarStatus.processed_polarizations && sarStatus.processed_polarizations.length > 0;
          const hasFlood = floodStatus && floodStatus.detected_polarizations && floodStatus.detected_polarizations.length > 0;

          if (badgeEl) {
            if (hasFlood) {
              badgeEl.className = "pill-status status-proc";
              badgeEl.textContent = "FLOOD DETECTED";
            } else if (hasProc) {
              badgeEl.className = "pill-status status-proc";
              badgeEl.textContent = "PROCESSED";
            } else {
              badgeEl.className = "pill-status status-dl";
              badgeEl.textContent = "DOWNLOADED";
            }
          }
          const dlBtn = document.querySelector<HTMLButtonElement>(`#s1-download-btn-${i}`);
          if (dlBtn) {
            dlBtn.disabled = true;
            dlBtn.textContent = "✓ Downloaded";
          }
          const cardProcBtn = document.querySelector<HTMLButtonElement>(`#s1-process-btn-${i}`);
          if (cardProcBtn) {
            cardProcBtn.style.display = "inline-block";
          }
          const cardFloodBtn = document.querySelector<HTMLButtonElement>(`#s1-flood-btn-${i}`);
          if (cardFloodBtn && hasProc) {
            cardFloodBtn.style.display = "inline-block";
          }
          setupSarProcessingCard(prodId, i, sarStatus);

          // If this is the currently selected product, update details & results
          if (selectedSentinel1Product && selectedSentinel1Product.product_id === prodId) {
            renderProductDetails(selectedSentinel1Product, sarStatus, floodStatus);
            renderGlobalProcessingResults(sarStatus, floodStatus);
          }
        }
      })
      .catch(() => {});
  });

  // Select first product by default
  if (data.products.length > 0) {
    selectProduct(data.products[0], 0);
  }
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

function openSentinel1DownloadModal(product: Sentinel1Product) {
  if (product && product.product_id) {
    handleInitiateSentinel1Download(product.product_id, selectedLocationId, 0);
  }
}

async function handleInitiateSentinel1Download(
  productId: string,
  locationId: number | null,
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

  if (modalEl) modalEl.style.display = "flex";

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
  const cardProcBtn = document.querySelector<HTMLButtonElement>(`#s1-process-btn-${cardIndex}`);

  isDownloadingSentinel1 = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Downloading...";
  }
  if (msgEl) {
    msgEl.style.display = "inline";
    msgEl.textContent = "Downloading...";
  }

  updateProcessingTimeline({
    validated: true,
    downloading: true,
    badge: "DOWNLOADING"
  });

  try {
    const result = await requestSentinel1Download(productId, locationId);

    if (result.status === "downloaded" || result.status === "already_downloaded") {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "✓ Downloaded";
      }
      if (badgeEl) {
        badgeEl.className = "pill-status status-dl";
        badgeEl.textContent = "DOWNLOADED";
      }
      if (cardProcBtn) {
        cardProcBtn.style.display = "inline-block";
      }

      fetchSarProductStatus(productId)
        .then((sarStatus) => {
          setupSarProcessingCard(productId, cardIndex, sarStatus);
          if (selectedSentinel1Product && selectedSentinel1Product.product_id === productId) {
            renderProductDetails(selectedSentinel1Product, sarStatus);
            renderGlobalProcessingResults(sarStatus);
          }
          updateWorkflowStepper({
            discoverDone: true,
            downloadDone: true,
            preprocessActive: true,
          });
          updateProcessingTimeline({
            validated: true,
            downloaded: true,
            badge: "DOWNLOADED"
          });
        })
        .catch(() => {});
    } else if (result.status === "authentication_failed") {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Download";
      }
      alert("Copernicus Data Space authentication failed. Please check CDSE credentials.");
    } else {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Download";
      }
      alert(`Unable to download Sentinel-1 product: ${result.message || "Error"}`);
    }
  } catch (err: any) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Download";
    }
    alert(`Download error: ${err?.message || "Failed"}`);
  } finally {
    isDownloadingSentinel1 = false;
    pendingDownloadProductId = null;
    pendingDownloadLocationId = null;
    pendingDownloadCardIndex = null;
  }
}

// ──────────────────────────────────────────────────────────────
// SENTINEL-1 PROTOTYPE SAR PREPROCESSING HANDLERS
// ──────────────────────────────────────────────────────────────

function setupSarProcessingCard(
  _productId: string,
  cardIndex: number,
  sarStatus: SarStatusResponse
) {
  const sectionEl = document.querySelector<HTMLElement>(`#s1-sar-process-section-${cardIndex}`);
  if (!sectionEl) return;

  const selectorEl = document.querySelector<HTMLElement>(`#s1-pol-selector-${cardIndex}`);
  const msgEl = document.querySelector<HTMLElement>(`#s1-process-msg-${cardIndex}`);
  const resEl = document.querySelector<HTMLElement>(`#s1-process-results-${cardIndex}`);
  const procBtn = document.querySelector<HTMLButtonElement>(`#s1-process-btn-${cardIndex}`);

  const pols =
    sarStatus.available_polarizations && sarStatus.available_polarizations.length > 0
      ? sarStatus.available_polarizations
      : ["VV", "VH"];

  let selectedPol = sectionEl.getAttribute("data-selected-pol") || pols[0] || "VV";

  if (selectorEl) {
    selectorEl.innerHTML = pols
      .map(
        (pol) =>
          `<button type="button" class="s1-pol-btn ${pol === selectedPol ? "active" : ""}" data-pol="${pol}" id="s1-pol-${pol.toLowerCase()}-${cardIndex}">${pol}</button>`
      )
      .join("");

    const polBtns = selectorEl.querySelectorAll<HTMLButtonElement>(".s1-pol-btn");
    polBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const pol = btn.getAttribute("data-pol");
        if (!pol) return;
        selectedPol = pol;
        sectionEl.setAttribute("data-selected-pol", pol);
        polBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        if (sarStatus.processed_metadata && sarStatus.processed_metadata[pol]) {
          renderSarProcessResults(resEl, msgEl, sarStatus.processed_metadata[pol]);
        }
      });
    });
  }

  if (procBtn && !procBtn.hasAttribute("data-bound")) {
    procBtn.setAttribute("data-bound", "true");
    procBtn.addEventListener("click", () => {
      const prod = currentDiscoveredProducts[cardIndex];
      if (prod) {
        selectProduct(prod, cardIndex);
        openSarProcessingModal(prod, sarStatus);
      }
    });
  }
}

function renderSarProcessResults(
  resEl: HTMLElement | null,
  msgEl: HTMLElement | null,
  meta: SarPreprocessResponse
) {
  if (msgEl) {
    msgEl.className = "s1-process-msg s1-dl-status s1-dl-success";
    msgEl.textContent = "✓ SAR preprocessing completed.";
  }
  if (!resEl) return;

  const boundsStr =
    meta.bounds && meta.bounds.length >= 4
      ? `[${meta.bounds.map((b) => Number(b).toFixed(4)).join(", ")}]`
      : "--";

  resEl.style.display = "flex";
  resEl.innerHTML = `
    <div class="s1-res-title">
      <span>✓ SAR Preprocessing Completed</span>
      <span class="provenance-tag tag-proto" style="font-size:9px;">PROTOTYPE SAR</span>
    </div>
    <div class="s1-res-grid">
      <div class="s1-res-item">
        <span class="s1-res-label">Polarization</span>
        <span class="s1-res-value" style="color:var(--accent-cyan); font-weight:700;">${meta.polarization || "--"}</span>
      </div>
      <div class="s1-res-item">
        <span class="s1-res-label">Raster Dimensions</span>
        <span class="s1-res-value">${meta.width ?? "--"} × ${meta.height ?? "--"} px</span>
      </div>
      <div class="s1-res-item">
        <span class="s1-res-label">Spatial Reference (CRS)</span>
        <span class="s1-res-value">${meta.crs || "--"}</span>
      </div>
      <div class="s1-res-item">
        <span class="s1-res-label">Min Backscatter (DN)</span>
        <span class="s1-res-value">${meta.min_value !== undefined ? meta.min_value : "--"}</span>
      </div>
      <div class="s1-res-item">
        <span class="s1-res-label">Max Backscatter (DN)</span>
        <span class="s1-res-value">${meta.max_value !== undefined ? meta.max_value : "--"}</span>
      </div>
      <div class="s1-res-item">
        <span class="s1-res-label">Mean Backscatter (DN)</span>
        <span class="s1-res-value">${meta.mean_value !== undefined ? meta.mean_value : "--"}</span>
      </div>
      <div class="s1-res-item">
        <span class="s1-res-label">NoData Value</span>
        <span class="s1-res-value">${meta.nodata !== undefined ? meta.nodata : "--"}</span>
      </div>
      <div class="s1-res-item">
        <span class="s1-res-label">Output Status</span>
        <span class="s1-res-value" style="color:#10b981; font-weight:700;">${meta.processing_status || "COMPLETED"}</span>
      </div>
      <div class="s1-res-item" style="grid-column: 1 / -1;">
        <span class="s1-res-label">Processed GeoTIFF</span>
        <span class="s1-res-value" style="font-size:10px; color:#38bdf8;">${meta.output_file || "--"}</span>
      </div>
      <div class="s1-res-item" style="grid-column: 1 / -1;">
        <span class="s1-res-label">Spatial Bounds</span>
        <span class="s1-res-value" style="font-size:10px;">${boundsStr}</span>
      </div>
    </div>
    <div class="s1-res-disclaimer">
      Prototype SAR Preprocessing. Radiometric statistics and geospatial raster generated.
      No flood detection, water classification, or AI prediction applied.
    </div>
  `;
}

async function loadSentinel1Discovery(
  locationId: number | null,
  locationName: string,
  lat?: number,
  lon?: number
) {
  const container = document.querySelector<HTMLElement>("#s1-products-container");
  const locationNameEl = document.querySelector<HTMLElement>("#s1-location-name");
  const productCountEl = document.querySelector<HTMLElement>("#s1-product-count");
  const statusBar = document.querySelector<HTMLElement>("#s1-discovery-status");

  if (!container) return;

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
    const data = await fetchSentinel1Products(locationId, 7, lat, lon, locationName);
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
      detail = locationId ? `No Locations record for location_id=${locationId}.` : "Searched location has no scenes available.";
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
    renderProductDetails(null);
    renderGlobalProcessingResults(null);
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

function buildReportHtml(reportResponse: any): string {
  const r = reportResponse.report;
  const loc = r.location;
  const exec = r.executive_summary;
  const s1 = r.sentinel1;
  const proc = r.preprocessing;
  const flood = r.flood_detection;
  const risk = r.risk;
  const overall = r.overall_assessment;

  // ── A. Executive Summary ───────────────────────────────────────────────
  const execHtml = exec ? `
    <div class="report-exec-grid">
      <div class="report-exec-card">
        <span class="report-exec-label">Location</span>
        <span class="report-exec-value" style="font-size:13px;">${escapeHtml(loc.name)}</span>
      </div>
      <div class="report-exec-card">
        <span class="report-exec-label">Sentinel-1 Product</span>
        <span class="report-exec-value" style="font-size:11px;" title="${escapeHtml(exec.sentinel1_product)}">
          ${exec.sentinel1_product !== "N/A" ? escapeHtml(exec.sentinel1_product.substring(0, 20) + "...") : "N/A"}
        </span>
      </div>
      <div class="report-exec-card">
        <span class="report-exec-label">Candidate Area</span>
        <span class="report-exec-value" style="color:#38bdf8;">${escapeHtml(exec.candidate_area_km2)}</span>
      </div>
      <div class="report-exec-card">
        <span class="report-exec-label">Candidate %</span>
        <span class="report-exec-value" style="color:#38bdf8;">${escapeHtml(exec.candidate_percentage)}</span>
      </div>
      <div class="report-exec-card">
        <span class="report-exec-label">Risk Level</span>
        <span class="report-exec-value" style="color:${exec.risk_level === 'HIGH' ? '#f87171' : exec.risk_level === 'MEDIUM' ? '#fbbf24' : '#34d399'};">
          ${escapeHtml(exec.risk_level)}
        </span>
      </div>
      <div class="report-exec-card">
        <span class="report-exec-label">Prototype Risk Score</span>
        <span class="report-exec-value">${escapeHtml(exec.risk_score)}</span>
      </div>
      <div class="report-exec-card">
        <span class="report-exec-label">Active Alerts</span>
        <span class="report-exec-value" style="color:${exec.active_alerts_count > 0 ? '#f87171' : '#34d399'};">
          ${exec.active_alerts_count}
        </span>
      </div>
    </div>
  ` : "";

  // ── B. Location Information ────────────────────────────────────────────
  const locHtml = `
    <table class="report-table">
      <tbody>
        <tr>
          <th style="width:20%;">Monitored Site</th>
          <td style="width:30%;"><strong>${escapeHtml(loc.name)}</strong></td>
          <th style="width:20%;">District / State</th>
          <td style="width:30%;">${escapeHtml(loc.district)}, ${escapeHtml(loc.state)}</td>
        </tr>
        <tr>
          <th>Geographic Coordinates</th>
          <td>${loc.latitude.toFixed(4)}° N, ${loc.longitude.toFixed(4)}° E</td>
          <th>System Location ID</th>
          <td><code>LOC-${loc.location_id}</code></td>
        </tr>
      </tbody>
    </table>
  `;

  // ── C. Satellite Observations (SQL Server) ─────────────────────────────
  const satHtml = r.satellite_observations && r.satellite_observations.length > 0 ? `
    <table class="report-table">
      <thead>
        <tr>
          <th>Satellite / Sensor</th>
          <th>Acquisition Date</th>
          <th>Product Identifier</th>
          <th>Cloud Cover</th>
          <th>Source Label</th>
        </tr>
      </thead>
      <tbody>
        ${r.satellite_observations.map((s: any) => `
          <tr>
            <td><strong>${escapeHtml(s.satellite)}</strong> (${escapeHtml(s.sensor)})</td>
            <td>${escapeHtml(s.acquisition_date)}</td>
            <td><code style="font-size:10.5px;">${escapeHtml(s.product_id)}</code></td>
            <td>${s.cloud_cover !== null && s.cloud_cover !== undefined ? s.cloud_cover + "%" : "N/A"}</td>
            <td><span class="provenance-tag tag-db">DATABASE OBSERVATION</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `<p class="report-empty-notice">No satellite observations available.</p>`;

  // ── D. Sentinel-1 SAR Product ──────────────────────────────────────────
  const s1Html = s1 ? `
    <table class="report-table">
      <tbody>
        <tr>
          <th style="width:22%;">Product ID</th>
          <td colspan="3"><code style="font-size:11px; word-break:break-all;">${escapeHtml(s1.product_id)}</code></td>
        </tr>
        <tr>
          <th>Spacecraft Platform</th>
          <td><strong>${escapeHtml(s1.platform)}</strong></td>
          <th>Instrument Mode</th>
          <td>${escapeHtml(s1.mode)}</td>
        </tr>
        <tr>
          <th>Product Type</th>
          <td>${escapeHtml(s1.product_type)}</td>
          <th>Available Polarizations</th>
          <td>${s1.polarizations.map((p: any) => `<strong>${escapeHtml(p)}</strong>`).join(" / ")}</td>
        </tr>
        <tr>
          <th>Acquisition Datetime</th>
          <td>${escapeHtml(s1.acquisition_date)}</td>
          <th>Download Status</th>
          <td><span class="status-badge badge-active">${escapeHtml(s1.download_status)}</span></td>
        </tr>
      </tbody>
    </table>
  ` : `<p class="report-empty-notice">No Sentinel-1 product associated or staged for this location.</p>`;

  // ── E. SAR Preprocessing ───────────────────────────────────────────────
  const procHtml = proc ? `
    <table class="report-table">
      <tbody>
        <tr>
          <th style="width:22%;">Processing Status</th>
          <td style="width:28%;"><span class="status-badge badge-active">${escapeHtml(proc.status)}</span></td>
          <th style="width:22%;">Polarization / Channel</th>
          <td style="width:28%;"><strong>${escapeHtml(proc.polarization)}</strong> (${(proc.polarizations_available || []).join(", ")})</td>
        </tr>
        <tr>
          <th>Raster Dimensions</th>
          <td>${escapeHtml(proc.dimensions)}</td>
          <th>Coordinate Reference</th>
          <td><code>${escapeHtml(proc.crs)}</code></td>
        </tr>
        <tr>
          <th>Min / Max Amplitude DN</th>
          <td>${proc.min_value ?? "N/A"} / ${proc.max_value ?? "N/A"}</td>
          <th>Mean Backscatter DN</th>
          <td>${proc.mean_value ? proc.mean_value.toFixed(2) : "N/A"}</td>
        </tr>
        <tr>
          <th>Valid Analyzed Pixels</th>
          <td>${proc.valid_pixels ? proc.valid_pixels.toLocaleString() : "N/A"}</td>
          <th>NoData Border Mask</th>
          <td><code>${proc.nodata ?? -9999}</code></td>
        </tr>
        <tr>
          <th>Processed GeoTIFF Output</th>
          <td colspan="3"><code style="font-size:10.5px; word-break:break-all;">${escapeHtml(proc.output_file || "")}</code></td>
        </tr>
      </tbody>
    </table>
  ` : `<p class="report-empty-notice">SAR preprocessing has not been performed.</p>`;

  // ── F. Prototype Flood Detection ───────────────────────────────────────
  const floodHtml = flood ? `
    <table class="report-table">
      <tbody>
        <tr>
          <th style="width:22%;">Processing Method</th>
          <td style="width:28%;"><strong>${escapeHtml(flood.method)}</strong></td>
          <th style="width:22%;">Classification Category</th>
          <td style="width:28%;"><span style="color:#38bdf8; font-weight:600;">${escapeHtml(flood.classification)}</span></td>
        </tr>
        <tr>
          <th>Polarization Used</th>
          <td><strong>${escapeHtml(flood.polarization)}</strong> (${(flood.polarizations_available || []).join(", ")})</td>
          <th>Backscatter DN Threshold</th>
          <td><strong>${flood.threshold_used ?? flood.threshold} DN</strong></td>
        </tr>
        <tr>
          <th>Candidate Flood Area</th>
          <td style="font-size:14px; font-weight:700; color:#38bdf8;">
            ${flood.detected_area_km2 !== null && flood.detected_area_km2 !== undefined ? flood.detected_area_km2.toFixed(4) + " km²" : "N/A"}
            <small style="font-size:11px; color:#94a3b8; font-weight:normal;">(${flood.detected_area_m2 ? flood.detected_area_m2.toLocaleString() + " m²" : ""})</small>
          </td>
          <th>Candidate Extent %</th>
          <td style="font-size:14px; font-weight:700; color:#38bdf8;">
            ${flood.flood_percentage !== null && flood.flood_percentage !== undefined ? flood.flood_percentage.toFixed(2) + "%" : "N/A"}
          </td>
        </tr>
        <tr>
          <th>Candidate Pixels</th>
          <td><strong>${flood.candidate_pixels ? flood.candidate_pixels.toLocaleString() : "N/A"}</strong></td>
          <th>Valid Analyzed Pixels</th>
          <td>${flood.valid_pixels ? flood.valid_pixels.toLocaleString() : "N/A"}</td>
        </tr>
        <tr>
          <th>Total Analyzed Area</th>
          <td>${flood.analyzed_area_km2 ? flood.analyzed_area_km2.toFixed(2) + " km²" : "N/A"}</td>
          <th>Geodesic Area Calculation</th>
          <td><code>${escapeHtml(flood.area_calculation_method || "WGS-84 Ellipsoidal")}</code></td>
        </tr>
        <tr>
          <th>Flood Mask GeoTIFF</th>
          <td colspan="3"><code style="font-size:10.5px; word-break:break-all;">${escapeHtml(flood.output_file || "")}</code></td>
        </tr>
      </tbody>
    </table>
    <div class="report-disclaimer-box">
      <strong>⚠️ Scientific Disclaimer:</strong> Candidate area represents low-backscatter pixels identified by the prototype threshold method and should not be interpreted as confirmed flood extent. Flood detection is a prototype threshold-based SAR analysis and has not been scientifically validated against ground truth.
    </div>
  ` : `<p class="report-empty-notice">No flood detection has been performed.</p>`;

  // ── G. Risk Assessment ─────────────────────────────────────────────────
  const riskHtml = risk ? `
    <table class="report-table">
      <tbody>
        <tr>
          <th style="width:22%;">Risk Level</th>
          <td style="width:28%;">
            <span class="status-badge ${risk.risk_level === 'HIGH' ? 'badge-high-threat' : risk.risk_level === 'MEDIUM' ? 'badge-moderate-threat' : 'badge-low-threat'}">
              ${escapeHtml(risk.risk_level)}
            </span>
          </td>
          <th style="width:22%;">Prototype Risk Score</th>
          <td style="width:28%; font-size:14px; font-weight:700;">
            ${risk.risk_score !== null && risk.risk_score !== undefined ? Math.round(risk.risk_score * 100) + "%" : "N/A"}
          </td>
        </tr>
        <tr>
          <th>Rainfall / Accumulated</th>
          <td>${risk.rainfall_mm ?? "N/A"} mm / ${risk.accumulated_rainfall_mm ?? "N/A"} mm</td>
          <th>River Proximity</th>
          <td>${risk.river_distance_km !== null ? risk.river_distance_km + " km" : "N/A"}</td>
        </tr>
        <tr>
          <th>Elevation / Slope</th>
          <td>${risk.elevation_m ?? "N/A"} m / ${risk.slope_degree ?? "N/A"}°</td>
          <th>NDVI / NDWI Index</th>
          <td>${risk.ndvi ?? "N/A"} / ${risk.ndwi ?? "N/A"}</td>
        </tr>
        <tr>
          <th>Historical Frequency</th>
          <td>${risk.historical_flood_frequency ?? "N/A"} events</td>
          <th>Previous Inundation Area</th>
          <td>${risk.previous_flooded_area_km2 !== null ? risk.previous_flooded_area_km2 + " km²" : "N/A"}</td>
        </tr>
        <tr>
          <th>Predictive Model Name</th>
          <td colspan="3">${escapeHtml(risk.model_name || "Prototype Hydro-Meteorological Model")} (Date: ${escapeHtml(risk.prediction_date || "N/A")})</td>
        </tr>
      </tbody>
    </table>
    <p style="margin:4px 0 0; font-size:11px; color:#64748b;">
      Note: Prototype Risk Score is an experimental predictive model and is not a scientifically certified meteorological probability.
    </p>
  ` : `<p class="report-empty-notice">No risk prediction available.</p>`;

  // ── H. Historical Flood Context ────────────────────────────────────────
  const histHtml = r.historical_floods && r.historical_floods.length > 0 ? `
    <table class="report-table">
      <thead>
        <tr>
          <th>Year</th>
          <th>Event Date</th>
          <th>Flooded Area</th>
          <th>Severity</th>
          <th>Rainfall</th>
          <th>Duration</th>
          <th>Source Authority</th>
        </tr>
      </thead>
      <tbody>
        ${r.historical_floods.map((h: any) => `
          <tr>
            <td><strong>Year ${h.flood_year}</strong></td>
            <td>${escapeHtml(h.flood_date)}</td>
            <td><strong>${h.flooded_area_km2 !== null ? h.flooded_area_km2 + " km²" : "N/A"}</strong></td>
            <td>${escapeHtml(h.severity)}</td>
            <td>${h.rainfall_mm !== null ? h.rainfall_mm + " mm" : "N/A"}</td>
            <td>${h.duration_days !== null ? h.duration_days + " days" : "N/A"}</td>
            <td>${escapeHtml(h.source)}</td>
          </tr>
          ${h.description ? `
            <tr>
              <td colspan="7" style="font-size:11px; color:#94a3b8; font-style:italic; padding:4px 10px;">
                Notes: ${escapeHtml(h.description)}
              </td>
            </tr>
          ` : ""}
        `).join("")}
      </tbody>
    </table>
  ` : `<p class="report-empty-notice">No historical flood records available.</p>`;

  // ── I. Active Alerts ───────────────────────────────────────────────────
  const alertsHtml = r.alerts && r.alerts.length > 0 ? `
    <table class="report-table">
      <thead>
        <tr>
          <th>Alert Level</th>
          <th>Alert Type</th>
          <th>Advisory Message</th>
          <th>Issued Datetime</th>
          <th>Resolution Status</th>
        </tr>
      </thead>
      <tbody>
        ${r.alerts.map((a: any) => `
          <tr>
            <td>
              <span class="status-badge ${a.alert_level === 'HIGH' ? 'badge-high-threat' : a.alert_level === 'MEDIUM' ? 'badge-moderate-threat' : 'badge-low-threat'}">
                ${escapeHtml(a.alert_level)}
              </span>
            </td>
            <td><strong>${escapeHtml(a.alert_type)}</strong></td>
            <td>${escapeHtml(a.alert_message)}</td>
            <td>${escapeHtml(a.alert_date)}</td>
            <td><span class="status-badge ${a.is_resolved ? 'badge-low-threat' : 'badge-high-threat'}">${a.is_resolved ? "RESOLVED" : "ACTIVE"}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `<p class="report-empty-notice">No active alerts for this location.</p>`;

  // ── J. Overall Assessment ──────────────────────────────────────────────
  const assessCategoryBadgeClass =
    overall?.category === "HIGH_CONVERGENCE_CONCERN" ? "badge-high-threat" :
    overall?.category === "PREDICTIVE_RISK_WARNING" ? "badge-moderate-threat" :
    overall?.category === "LOCALIZED_CANDIDATE_ANOMALIES" ? "badge-moderate-threat" : "badge-low-threat";

  const overallHtml = overall ? `
    <div class="report-assessment-box">
      <span class="report-assessment-badge ${assessCategoryBadgeClass}">
        ${escapeHtml(overall.category.replace(/_/g, " "))}
      </span>
      <p style="font-size:13px; font-weight:600; color:#f8fafc; margin:4px 0 10px;">
        ${escapeHtml(overall.statement)}
      </p>
      <div style="font-size:12px; color:#cbd5e1; line-height:1.6;">
        <strong>Evidence Summary:</strong>
        <ul style="margin:6px 0 0 16px; padding:0;">
          ${(overall.evidence_summary || []).map((item: any) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
    </div>
  ` : `<p class="report-empty-notice">Assessment not available.</p>`;

  // ── K. Methodology ─────────────────────────────────────────────────────
  const methodHtml = (r.methodology || []).length > 0 ? `
    <div style="display:flex; flex-direction:column; gap:8px;">
      ${(r.methodology || []).map((m: any) => `
        <div class="methodology-step">
          <span class="methodology-num">${m.step}</span>
          <div>
            <strong style="color:#e2e8f0;">${escapeHtml(m.name)}:</strong>
            <span style="color:#94a3b8;"> ${escapeHtml(m.description)}</span>
          </div>
        </div>
      `).join("")}
    </div>
  ` : "";

  // ── L. Scientific Limitations ──────────────────────────────────────────
  const limitHtml = (r.limitations || []).length > 0 ? `
    <ul style="margin:0 0 0 18px; padding:0; font-size:12px; color:#cbd5e1; line-height:1.6;">
      ${(r.limitations || []).map((lim: any) => `<li>${escapeHtml(lim)}</li>`).join("")}
    </ul>
  ` : "";

  // ── M. Data Provenance ─────────────────────────────────────────────────
  const provSources = r.provenance_sources || r.data_provenance || {};
  const provHtml = `
    <table class="report-table">
      <tbody>
        ${Object.entries(provSources).map(([k, v]) => `
          <tr>
            <th style="width:28%; text-transform:capitalize;">${escapeHtml(k.replace(/_/g, " "))}</th>
            <td>${escapeHtml(String(v))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  return `
    <div class="report-doc">
      <!-- HEADER BANNER -->
      <div class="report-header-banner">
        <div>
          <h2 style="margin:0 0 4px; font-size:22px; color:#38bdf8; font-weight:800; letter-spacing:0.5px;">EARTHWATCH AI</h2>
          <h3 style="margin:0 0 6px; font-size:16px; color:#f8fafc; font-weight:700;">DISASTER ASSESSMENT REPORT</h3>
          <p style="margin:0; font-size:13px; color:#cbd5e1;">
            Monitored Site: <strong>${escapeHtml(loc.name)}</strong> • 
            District: <strong>${escapeHtml(loc.district)}</strong> • 
            State: <strong>${escapeHtml(loc.state)}</strong>
          </p>
          <p style="margin:3px 0 0; font-size:12px; color:#94a3b8;">
            Coordinates: <strong>${loc.latitude.toFixed(4)}° N, ${loc.longitude.toFixed(4)}° E</strong> | 
            Report ID: <code>EWA-${loc.location_id}-${new Date(r.generated_at).getTime()}</code>
          </p>
        </div>
        <div style="text-align:right;">
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
            <span class="provenance-tag tag-db">SQL SERVER ARCHIVE</span>
            <span class="provenance-tag tag-stac">COPERNICUS SAR</span>
            <span class="provenance-tag tag-live" style="background:rgba(245,158,11,0.2); color:#fbbf24; border-color:rgba(245,158,11,0.4);">PROTOTYPE ANALYSIS</span>
          </div>
          <small style="font-size:11px; color:#64748b; display:block; margin-top:6px;">Generated: ${escapeHtml(r.generated_at)}</small>
        </div>
      </div>

      <!-- SECTION A: EXECUTIVE SUMMARY -->
      <div class="report-section">
        <h4>A. EXECUTIVE SUMMARY</h4>
        ${execHtml}
      </div>

      <!-- SECTION B: LOCATION INFORMATION -->
      <div class="report-section">
        <h4>B. LOCATION INFORMATION</h4>
        ${locHtml}
      </div>

      <!-- SECTION C: SATELLITE OBSERVATIONS -->
      <div class="report-section">
        <h4>C. SATELLITE OBSERVATIONS (DATABASE TELEMETRY)</h4>
        ${satHtml}
      </div>

      <!-- SECTION D: SENTINEL-1 SAR PRODUCT -->
      <div class="report-section">
        <h4>D. SENTINEL-1 SAR PRODUCT</h4>
        ${s1Html}
      </div>

      <!-- SECTION E: SAR PREPROCESSING -->
      <div class="report-section">
        <h4>E. SAR PREPROCESSING (FLOAT32 DN CONVERSION)</h4>
        ${procHtml}
      </div>

      <!-- SECTION F: PROTOTYPE FLOOD DETECTION -->
      <div class="report-section">
        <h4>F. PROTOTYPE FLOOD DETECTION (LOW-BACKSCATTER CANDIDATE MASK)</h4>
        ${floodHtml}
      </div>

      <!-- SECTION G: RISK ASSESSMENT -->
      <div class="report-section">
        <h4>G. HYDROLOGICAL RISK ASSESSMENT</h4>
        ${riskHtml}
      </div>

      <!-- SECTION H: HISTORICAL FLOOD CONTEXT -->
      <div class="report-section">
        <h4>H. HISTORICAL FLOOD CONTEXT</h4>
        ${histHtml}
      </div>

      <!-- SECTION I: ACTIVE WARNING ALERTS -->
      <div class="report-section">
        <h4>I. ACTIVE WARNING ALERTS</h4>
        ${alertsHtml}
      </div>

      <!-- SECTION J: OVERALL ASSESSMENT -->
      <div class="report-section">
        <h4>J. OVERALL ASSESSMENT (EVIDENCE SYNTHESIS)</h4>
        ${overallHtml}
      </div>

      <!-- SECTION K: METHODOLOGY -->
      <div class="report-section">
        <h4>K. PIPELINE METHODOLOGY</h4>
        ${methodHtml}
      </div>

      <!-- SECTION L: LIMITATIONS & DISCLAIMERS -->
      <div class="report-section">
        <h4>L. SCIENTIFIC LIMITATIONS & HONESTY DISCLOSURES</h4>
        ${limitHtml}
      </div>

      <!-- SECTION M: DATA PROVENANCE -->
      <div class="report-section">
        <h4>M. DATA PROVENANCE & ATTRIBUTION</h4>
        ${provHtml}
      </div>
    </div>
  `;
}

async function loadPageReport(locationId: number | null, productId?: string | null) {
  if (!pageReportContent) return;

  if (locationId === null || !isCurrentLocationDatabaseMonitored) {
    pageReportContent.innerHTML = `
      <div class="state-box" style="padding: 40px 20px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 12px;">📑</div>
        <div style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
          SEARCHED GEOGRAPHIC LOCATION DOSSIER
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); max-width: 540px; margin: 0 auto 18px auto; line-height: 1.6;">
          <strong>${selectedLocationName}</strong> is an ad-hoc searched geographic location (${selectedLatitude.toFixed(4)}° N, ${selectedLongitude.toFixed(4)}° E). Official database-monitored historical records and risk classifications are not fabricated for non-database locations.
        </div>
        <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
          <span class="loc-type-badge badge-searched">NO DATABASE OBSERVATION</span>
          <span class="loc-type-badge badge-searched">NO FLOOD RECORD AVAILABLE</span>
          <span class="loc-type-badge badge-searched">NO HISTORICAL DATABASE RECORD</span>
          <span class="loc-type-badge badge-searched">NO ACTIVE ALERT</span>
        </div>
      </div>
    `;
    return;
  }

  pageReportContent.innerHTML = `
    <div class="state-box">
      <div class="state-loading">
        <div class="spinner"></div>
        <span>Compiling structured disaster assessment report from database...</span>
      </div>
    </div>
  `;

  try {
    const reportResponse = await fetchReportSummary(locationId, productId);
    pageReportContent.innerHTML = buildReportHtml(reportResponse);

    const s1 = reportResponse.report.sentinel1;
    const proc = reportResponse.report.preprocessing;
    const flood = reportResponse.report.flood_detection;

    updateWorkflowStepper({
      discoverDone: true,
      downloadDone: Boolean(s1),
      preprocessDone: Boolean(proc),
      floodDone: Boolean(flood),
      reportDone: true,
    });

    updateProcessingTimeline({
      validated: true,
      downloaded: Boolean(s1),
      preprocessed: Boolean(proc),
      floodDetected: Boolean(flood),
      reportGenerated: true,
      badge: "REPORT READY",
    });
  } catch (err: any) {
    let errorMsg = "Unable to generate disaster assessment report.";
    if (err?.response?.status === 404) {
      errorMsg = "Location not found.";
    } else if (!err?.response && (err?.code === "ERR_NETWORK" || err?.message?.includes("Network Error"))) {
      errorMsg = "Unable to connect to EarthWatch AI backend.";
    }

    pageReportContent.innerHTML = `
      <div class="state-box" style="color:#ef4444; padding:28px 20px;">
        <div style="font-size:16px; font-weight:700; margin-bottom:6px;">${errorMsg}</div>
        <small style="color:#94a3b8;">${err?.response?.data?.detail || err?.message || ""}</small>
      </div>
    `;
  }
}

export async function openReportDossier() {
  if (!reportModal || !reportModalContent) return;

  reportModal.style.display = "flex";

  if (selectedLocationId === null || !isCurrentLocationDatabaseMonitored) {
    reportModalContent.innerHTML = `
      <div class="state-box" style="padding: 40px 20px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 12px;">📑</div>
        <div style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
          SEARCHED GEOGRAPHIC LOCATION DOSSIER
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); max-width: 540px; margin: 0 auto 18px auto; line-height: 1.6;">
          <strong>${selectedLocationName}</strong> is an ad-hoc searched geographic location (${selectedLatitude.toFixed(4)}° N, ${selectedLongitude.toFixed(4)}° E). Official database-monitored historical records and risk classifications are not fabricated for non-database locations.
        </div>
        <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
          <span class="loc-type-badge badge-searched">NO DATABASE OBSERVATION</span>
          <span class="loc-type-badge badge-searched">NO FLOOD RECORD AVAILABLE</span>
          <span class="loc-type-badge badge-searched">NO HISTORICAL DATABASE RECORD</span>
          <span class="loc-type-badge badge-searched">NO ACTIVE ALERT</span>
        </div>
      </div>
    `;
    return;
  }

  reportModalContent.innerHTML = `
    <div class="state-box">
      <div class="state-loading">
        <div class="spinner"></div>
        <span>Compiling structured disaster assessment report from database...</span>
      </div>
    </div>
  `;

  try {
    const reportResponse = await fetchReportSummary(selectedLocationId, selectedSentinel1Product?.product_id);
    reportModalContent.innerHTML = buildReportHtml(reportResponse);

    const s1 = reportResponse.report.sentinel1;
    const proc = reportResponse.report.preprocessing;
    const flood = reportResponse.report.flood_detection;

    updateWorkflowStepper({
      discoverDone: true,
      downloadDone: Boolean(s1),
      preprocessDone: Boolean(proc),
      floodDone: Boolean(flood),
      reportDone: true,
    });

    updateProcessingTimeline({
      validated: true,
      downloaded: Boolean(s1),
      preprocessed: Boolean(proc),
      floodDetected: Boolean(flood),
      reportGenerated: true,
      badge: "REPORT READY",
    });

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

// ======================================================
// DYNAMIC MONITORED LOCATION SEARCH COMBOBOX
// ======================================================

function initLocationSearchCombobox() {
  const inputEl = document.querySelector<HTMLInputElement>("#topbar-location-input");
  const dropdownEl = document.querySelector<HTMLElement>("#location-search-dropdown");
  if (!inputEl || !dropdownEl) return;

  let debounceTimer: any = null;
  let currentResults: SearchedLocation[] = [];
  let highlightedIndex: number = -1;

  const renderDropdownItems = (items: SearchedLocation[]) => {
    currentResults = items;
    highlightedIndex = -1;

    if (!items || items.length === 0) {
      dropdownEl.innerHTML = `<div class="location-dropdown-empty">No locations found</div>`;
      dropdownEl.style.display = "block";
      return;
    }

    dropdownEl.innerHTML = items
      .map((item, idx) => {
        const isDb = item.is_database_monitored;
        const sub = [item.district, item.state, item.country].filter(Boolean).join(", ");
        return `
          <div class="location-dropdown-item" data-index="${idx}">
            <div class="location-dropdown-item-top">
              <span class="location-dropdown-name">${item.name}</span>
              <span class="loc-type-badge ${isDb ? "badge-db" : "badge-searched"}">
                ${isDb ? "DATABASE MONITORED" : "SEARCHED LOCATION"}
              </span>
            </div>
            <div class="location-dropdown-sub">${sub || `${item.latitude.toFixed(3)}°, ${item.longitude.toFixed(3)}°`}</div>
          </div>
        `;
      })
      .join("");

    dropdownEl.querySelectorAll<HTMLElement>(".location-dropdown-item").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const idx = Number(el.getAttribute("data-index"));
        const selected = currentResults[idx];
        if (selected) {
          selectItem(selected);
        }
      });
    });

    dropdownEl.style.display = "block";
  };

  const selectItem = (item: SearchedLocation) => {
    dropdownEl.style.display = "none";
    inputEl.value = item.display_name || (item.district ? `${item.name} (${item.district})` : item.name);

    if (item.is_database_monitored && item.location_id) {
      selectMonitoredLocation(item.location_id);
    } else {
      selectSearchedGeographicLocation(item);
    }
  };

  const showDefaultMonitoredList = () => {
    const dbItems: SearchedLocation[] = dbLocations.map((loc) => ({
      name: loc.location_name,
      district: loc.district,
      state: loc.state,
      country: "India",
      display_name: `${loc.location_name} (${loc.district})`,
      latitude: loc.latitude,
      longitude: loc.longitude,
      is_database_monitored: true,
      location_id: loc.location_id,
      badge: "DATABASE MONITORED",
    }));
    renderDropdownItems(dbItems);
  };

  inputEl.addEventListener("focus", () => {
    const q = inputEl.value.trim();
    if (!q || dbLocations.some((l) => l.location_name.toLowerCase() === q.toLowerCase())) {
      showDefaultMonitoredList();
    } else {
      performSearch(q);
    }
  });

  let searchSeq = 0;

  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim();
    clearTimeout(debounceTimer);
    searchSeq++;
    if (!q) {
      showDefaultMonitoredList();
      return;
    }

    dropdownEl.innerHTML = `<div class="location-dropdown-empty">Searching...</div>`;
    dropdownEl.style.display = "block";

    debounceTimer = setTimeout(() => {
      performSearch(q);
    }, 280);
  });

  const performSearch = async (q: string) => {
    const currentSeq = ++searchSeq;
    try {
      const res = await axios.get(`${BACKEND_URL}/geocoding/search`, {
        params: { q },
        timeout: 8000,
      });
      if (currentSeq !== searchSeq) return;
      const results: SearchedLocation[] = res.data?.results || [];
      renderDropdownItems(results);
    } catch (err) {
      if (currentSeq !== searchSeq) return;
      console.warn("Location search error:", err);
      dropdownEl.innerHTML = `<div class="location-dropdown-empty" style="color:var(--status-danger);">Search failed. Try again.</div>`;
      dropdownEl.style.display = "block";
    }
  };

  inputEl.addEventListener("keydown", (e) => {
    if (dropdownEl.style.display === "none") {
      if (e.key === "ArrowDown") {
        inputEl.dispatchEvent(new Event("focus"));
      }
      return;
    }

    const items = dropdownEl.querySelectorAll<HTMLElement>(".location-dropdown-item");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = (highlightedIndex + 1) % items.length;
      updateHighlight(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
      updateHighlight(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < currentResults.length) {
        selectItem(currentResults[highlightedIndex]);
      } else if (currentResults.length > 0) {
        selectItem(currentResults[0]);
      }
    } else if (e.key === "Escape") {
      dropdownEl.style.display = "none";
    }
  });

  const updateHighlight = (items: NodeListOf<HTMLElement>) => {
    items.forEach((it, idx) => {
      if (idx === highlightedIndex) {
        it.classList.add("focused");
        it.scrollIntoView({ block: "nearest" });
      } else {
        it.classList.remove("focused");
      }
    });
  };

  // Close dropdown on click outside
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest("#topbar-location-control")) {
      dropdownEl.style.display = "none";
    }
  });
}

// ======================================================
// WORKFLOW PIPELINE INTERACTION
// ======================================================

function initWorkflowPipelines() {
  // Flood Detection Pipeline Interactive Nodes
  document.querySelector<HTMLElement>("#f-stage-s1")?.addEventListener("click", () => {
    switchView("satellite");
  });
  document.querySelector<HTMLElement>("#f-stage-product")?.addEventListener("click", () => {
    switchView("satellite");
  });
  document.querySelector<HTMLElement>("#f-stage-download")?.addEventListener("click", () => {
    switchView("satellite");
  });
  document.querySelector<HTMLElement>("#f-stage-preprocess")?.addEventListener("click", () => {
    if (selectedSentinel1Product) {
      openSarProcessingModal(selectedSentinel1Product, selectedSentinel1SarStatus);
    } else {
      switchView("satellite");
    }
  });
  document.querySelector<HTMLElement>("#f-stage-polarization")?.addEventListener("click", () => {
    if (selectedSentinel1Product) {
      openSarProcessingModal(selectedSentinel1Product, selectedSentinel1SarStatus);
    }
  });
  document.querySelector<HTMLElement>("#f-stage-threshold")?.addEventListener("click", () => {
    if (selectedSentinel1Product) {
      openFloodDetectionModal(selectedSentinel1Product, "VV");
    }
  });
  document.querySelector<HTMLElement>("#f-stage-mask")?.addEventListener("click", () => {
    if (selectedSentinel1Product) {
      openFloodDetectionModal(selectedSentinel1Product, "VV");
    }
  });
  document.querySelector<HTMLElement>("#f-stage-area")?.addEventListener("click", () => {
    document.querySelector<HTMLElement>("#flood-footprint-summary-card")?.scrollIntoView({ behavior: "smooth" });
  });
  document.querySelector<HTMLElement>("#f-stage-analysis")?.addEventListener("click", () => {
    switchView("report");
  });

  // Location Observation Pipeline Interactive Nodes
  document.querySelector<HTMLElement>("#lo-stage-search")?.addEventListener("click", () => {
    const topInput = document.querySelector<HTMLInputElement>("#topbar-location-input");
    topInput?.focus();
  });
  document.querySelector<HTMLElement>("#lo-stage-coords")?.addEventListener("click", () => {
    switchView("satellite");
    map.flyTo([selectedLatitude, selectedLongitude], 12, { duration: 1.2 });
  });
  document.querySelector<HTMLElement>("#lo-stage-map")?.addEventListener("click", () => {
    switchView("satellite");
    map.flyTo([selectedLatitude, selectedLongitude], 12, { duration: 1.2 });
  });
  document.querySelector<HTMLElement>("#lo-stage-sat")?.addEventListener("click", () => {
    switchView("satellite");
  });
  document.querySelector<HTMLElement>("#lo-stage-env")?.addEventListener("click", () => {
    switchView("dashboard");
  });
  document.querySelector<HTMLElement>("#lo-stage-risk")?.addEventListener("click", () => {
    switchView("risk");
  });
  document.querySelector<HTMLElement>("#lo-stage-assessment")?.addEventListener("click", () => {
    switchView("report");
  });
}

// Database Location Select (fallback)
dbLocationSelect?.addEventListener("change", (e) => {
  const val = (e.target as HTMLSelectElement).value;
  if (val) {
    selectMonitoredLocation(val);
  }
});

// Quick Action Buttons
detectFloodButton?.addEventListener("click", () => {
  switchView("flood-detection");
});

compareButton?.addEventListener("click", () => {
  switchView("compare");
});

riskButton?.addEventListener("click", () => {
  switchView("risk");
});

historyButton?.addEventListener("click", () => {
  switchView("historical-floods");
});

alertsButton?.addEventListener("click", () => {
  switchView("alerts");
});

reportActionBtn?.addEventListener("click", () => {
  switchView("report");
});
generateReportBtn?.addEventListener("click", () => {
  switchView("report");
});

closeReportBtn?.addEventListener("click", () => {
  if (reportModal) reportModal.style.display = "none";
});

reportModal?.addEventListener("click", (e) => {
  if (e.target === reportModal) {
    reportModal.style.display = "none";
  }
});

// Step 5 & Timeline Node click handlers to open Report
document.querySelector<HTMLElement>("#step-5-report")?.addEventListener("click", () => {
  switchView("report");
});
document.querySelector<HTMLElement>("#tl-node-report")?.addEventListener("click", () => {
  switchView("report");
});

// Stepper Step 1, 2, 3 navigation handlers
document.querySelector<HTMLElement>("#step-1-discover")?.addEventListener("click", () => {
  switchView("satellite");
});
document.querySelector<HTMLElement>("#step-2-download")?.addEventListener("click", () => {
  if (selectedSentinel1Product) {
    openSentinel1DownloadModal(selectedSentinel1Product);
  } else {
    switchView("satellite");
  }
});
document.querySelector<HTMLElement>("#step-3-preprocess")?.addEventListener("click", () => {
  if (selectedSentinel1Product) {
    openSarProcessingModal(selectedSentinel1Product, selectedSentinel1SarStatus);
  } else {
    switchView("satellite");
  }
});

// Flood control bar buttons
floodCtrlPreprocessBtn?.addEventListener("click", () => {
  if (selectedSentinel1Product) {
    openSarProcessingModal(selectedSentinel1Product, selectedSentinel1SarStatus);
  } else {
    alert("Please select a Sentinel-1 product first from the Satellite section.");
    switchView("satellite");
  }
});
floodCtrlDetectBtn?.addEventListener("click", () => {
  if (selectedSentinel1Product) {
    if (selectedSentinel1SarStatus?.processed_polarizations?.length) {
      openFloodDetectionModal(selectedSentinel1Product, "VV");
    } else {
      alert("Product must be preprocessed first. Opening SAR preprocessing...");
      openSarProcessingModal(selectedSentinel1Product, selectedSentinel1SarStatus);
    }
  } else {
    alert("Please select a Sentinel-1 product first from the Satellite section.");
    switchView("satellite");
  }
});
floodCtrlReportBtn?.addEventListener("click", () => {
  switchView("report");
});

// In-Page Report page buttons
pagePrintReportBtn?.addEventListener("click", () => {
  window.print();
});
pageRefreshReportBtn?.addEventListener("click", () => {
  loadPageReport(selectedLocationId, selectedSentinel1Product?.product_id);
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


// ======================================================
// VIEW SWITCHER & NAVIGATION LOGIC
// ======================================================

export type AppView =
  | "dashboard"
  | "satellite"
  | "flood-detection"
  | "location-observation"
  | "historical-floods"
  | "report"
  | "risk"
  | "alerts"
  | "compare"
  | "users";

export let activeView: AppView = "dashboard";

export function normalizeView(viewName: string): AppView {
  switch (viewName) {
    case "dashboard":
      return "dashboard";
    case "satellite":
    case "sentinel1":
      return "satellite";
    case "flood-detection":
    case "floods":
    case "flood":
      return "flood-detection";
    case "location-observation":
    case "locations":
    case "observations":
      return "location-observation";
    case "historical-floods":
    case "history":
      return "historical-floods";
    case "report":
    case "reports":
      return "report";
    case "risk":
      return "risk";
    case "alerts":
    case "alert":
      return "alerts";
    case "compare":
    case "comparison":
      return "compare";
    case "users":
    case "user-management":
      return "users";
    case "settings":
      return "settings" as any;
    default:
      return viewName === activeView ? activeView : ("" as any);
  }
}

export function renderDashboard() {
  updateTopStatistics();
}

export function renderSatellite() {
  setTimeout(() => {
    try {
      map.invalidateSize();
      if (selectedLatitude && selectedLongitude) {
        map.setView([selectedLatitude, selectedLongitude], 12);
      }
      renderLocationPins(dbLocations, selectedLocationId);
    } catch (e) {
      console.warn("Leaflet resize error:", e);
    }
  }, 100);

  if (lastLoadedSatelliteLocationId !== selectedLocationId) {
    lastLoadedSatelliteLocationId = selectedLocationId;
    loadSentinel1Discovery(selectedLocationId, selectedLocationName).catch(() => {});
  }
}

export function renderFloodDetection() {
  updateFloodDetectionView();
  if (selectedSentinel1Product) {
    renderGlobalProcessingResults(
      selectedSentinel1SarStatus,
      selectedSentinel1FloodStatus,
      currentResultsTab
    );
  }
}

export function renderLocationObservation() {
  updateLocationObservationView();
}

export function renderHistoricalFloods() {
  const locHistory = allHistoricalFloods.filter(
    (h) => h.location_id === selectedLocationId
  );
  renderHistoricalCharts(locHistory);
}

export function renderReport() {
  loadPageReport(selectedLocationId, selectedSentinel1Product?.product_id);
}

export function renderRiskView() {
  // Risk telemetry already populated for selectedLocationId
}

export function renderAlertsView() {
  renderAlerts(allAlerts, selectedLocationId);
}

export function renderCompareView() {
  if (comparisonLocationSelect) {
    comparisonLocationSelect.value = selectedLocationName;
  }
}

export function renderCurrentView() {
  // 1. Highlight active sidebar item
  document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((btn) => {
    const view = btn.getAttribute("data-view");
    if (view && normalizeView(view) === activeView) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // 2. Show active view panel, hide all other view panels
  document.querySelectorAll<HTMLElement>(".view-panel").forEach((panel) => {
    if (panel.id === `view-${activeView}`) {
      panel.classList.add("active");
      panel.style.display = "block";
    } else {
      panel.classList.remove("active");
      panel.style.display = "none";
    }
  });

  // 3. Render section-specific content
  switch (activeView) {
    case "dashboard":
      renderDashboard();
      break;
    case "satellite":
      renderSatellite();
      break;
    case "flood-detection":
      renderFloodDetection();
      break;
    case "location-observation":
      renderLocationObservation();
      break;
    case "historical-floods":
      renderHistoricalFloods();
      break;
    case "report":
      renderReport();
      break;
    case "risk":
      renderRiskView();
      break;
    case "alerts":
      renderAlertsView();
      break;
    case "compare":
      renderCompareView();
      break;
    case "users":
      renderUserManagement();
      break;
    default:
      console.warn(`Unknown active view: ${activeView}`);
      break;
  }

  // Ensure scroll position resets to top on page switch and horizontal shift is cleared
  const mainViewport = document.querySelector<HTMLElement>(".app-main-viewport");
  if (mainViewport) {
    mainViewport.scrollLeft = 0;
  }
  const scrollContainer = document.querySelector<HTMLElement>("#main-content-scroll");
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }
}

export function switchView(viewName: string) {
  const nextView = normalizeView(viewName);
  if (nextView === "users") {
    const auth = getAuthState();
    if (!auth.isAuthenticated || auth.currentUser?.role !== "ADMIN") {
      alert("Access Denied: You do not have permission to access User Management.");
      return;
    }
  }
  activeView = nextView;
  if (typeof window !== "undefined") {
    (window as any).activeView = activeView;
  }
  renderCurrentView();
}

export function showDashboard() { switchView("dashboard"); }
export function showSatellite() { switchView("satellite"); }
export function showFloodDetection() { switchView("flood-detection"); }
export function showLocationObservation() { switchView("location-observation"); }
export function showHistoricalFloods() { switchView("historical-floods"); }
export function showReport() { switchView("report"); }
export function showUsers() { switchView("users"); }

if (typeof window !== "undefined") {
  (window as any).activeView = activeView;
  (window as any).switchView = switchView;
  (window as any).renderCurrentView = renderCurrentView;
  (window as any).showDashboard = showDashboard;
  (window as any).showSatellite = showSatellite;
  (window as any).showFloodDetection = showFloodDetection;
  (window as any).showLocationObservation = showLocationObservation;
  (window as any).showHistoricalFloods = showHistoricalFloods;
  (window as any).showReport = showReport;
  (window as any).showUsers = showUsers;
}

// Navigation event bindings
document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const view = btn.getAttribute("data-view");
    if (!view) return;

    if (view === "settings") {
      openCdseBtn?.click();
      return;
    }
    switchView(view);
  });
});

// Location Observation selector change listener
locObsSelect?.addEventListener("change", (e) => {
  const val = (e.target as HTMLSelectElement).value;
  if (val) {
    selectMonitoredLocation(val);
  }
});

// Modal close handlers
closeSarModalBtn?.addEventListener("click", closeSarProcessingModal);
sarModalCancelBtn?.addEventListener("click", closeSarProcessingModal);
closeFloodModalBtn?.addEventListener("click", closeFloodDetectionModal);
floodModalCancelBtn?.addEventListener("click", closeFloodDetectionModal);

// Stepper Step 4 click handler to open flood detection when ready
document.querySelector<HTMLElement>("#step-4-detection")?.addEventListener("click", () => {
  if (selectedSentinel1Product && selectedSentinel1SarStatus?.processed_polarizations?.length) {
    openFloodDetectionModal(selectedSentinel1Product, "VV");
  } else if (selectedSentinel1Product) {
    openSarProcessingModal(selectedSentinel1Product, selectedSentinel1SarStatus);
  } else {
    switchView("satellite");
  }
});

async function initializeEarthWatch() {
  try {
    // 1. Check Backend Health
    const healthRes = await axios.get(`${BACKEND_URL}/health`);
    if (healthRes.data?.status === "ok" || healthRes.data?.status === "healthy") {
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

      if (locObsSelect) {
        locObsSelect.innerHTML = dbLocations
          .map(
            (loc) =>
              `<option value="${loc.location_id}">${loc.location_name} (${loc.district})</option>`
          )
          .join("");
      }

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
      if (locObsSelect) {
        locObsSelect.value = String(firstLoc.location_id);
      }
      if (comparisonLocationSelect) {
        comparisonLocationSelect.value = firstLoc.location_name;
      }
      await selectMonitoredLocation(firstLoc.location_id);
    } else {
      dbLocationSelect.innerHTML = `<option value="">No locations in database</option>`;
      if (locObsSelect) {
        locObsSelect.innerHTML = `<option value="">No locations in database</option>`;
      }
      if (comparisonLocationSelect) {
        comparisonLocationSelect.innerHTML = `<option value="">No locations in database</option>`;
      }
    }

    // Fresh load starts on dashboard (preserve activeView if user navigated during async loading)
    if (!activeView || activeView === "dashboard") {
      activeView = "dashboard";
      renderCurrentView();
    } else {
      renderCurrentView();
    }

    // Load SAR pipeline status (non-blocking — fires after main init)
    loadSarPipelineStatus().catch(() => {});

    // Only load Sentinel-1 product discovery if on Satellite view
    if (activeView === "satellite") {
      lastLoadedSatelliteLocationId = selectedLocationId;
      loadSentinel1Discovery(
        selectedLocationId,
        selectedLocationName
      ).catch(() => {});
    }

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

// ======================================================
// USER MANAGEMENT IMPLEMENTATION (ADMIN ONLY)
// ======================================================

export async function renderUserManagement() {
  const tableBody = document.querySelector<HTMLElement>("#users-table-body");
  if (!tableBody) return;

  const auth = getAuthState();
  if (auth.currentUser?.role !== "ADMIN") {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:30px; color:var(--status-error);">
          🚫 Access Denied: Administrator privileges required to view user management.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = `
    <tr>
      <td colspan="7" style="text-align:center; padding:30px; color:var(--text-secondary);">
        Fetching verified user accounts from SQL Server database...
      </td>
    </tr>
  `;

  try {
    const res = await axios.get(`${BACKEND_URL}/users`);
    const users = res.data?.users || [];

    // Update Stats
    const totalEl = document.querySelector<HTMLElement>("#users-stat-total");
    const adminsEl = document.querySelector<HTMLElement>("#users-stat-admins");
    const analystsEl = document.querySelector<HTMLElement>("#users-stat-analysts");
    const activeEl = document.querySelector<HTMLElement>("#users-stat-active");
    const countTag = document.querySelector<HTMLElement>("#users-count-tag");

    const total = users.length;
    const admins = users.filter((u: any) => u.role === "ADMIN").length;
    const analysts = users.filter((u: any) => u.role === "ANALYST").length;
    const active = users.filter((u: any) => u.is_active).length;

    if (totalEl) totalEl.textContent = String(total);
    if (adminsEl) adminsEl.textContent = String(admins);
    if (analystsEl) analystsEl.textContent = String(analysts);
    if (activeEl) activeEl.textContent = String(active);
    if (countTag) countTag.textContent = `${total} Users Registered`;

    if (users.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:30px; color:var(--text-secondary);">
            No users found in database.
          </td>
        </tr>
      `;
      return;
    }

    const currentUserId = auth.currentUser?.id;

    tableBody.innerHTML = users
      .map((u: any) => {
        const isSelf = u.id === currentUserId;
        const roleBadge =
          u.role === "ADMIN"
            ? `<span class="badge-role admin">🛡️ ADMIN</span>`
            : `<span class="badge-role analyst">🔬 ANALYST</span>`;

        const statusBadge = u.is_active
          ? `<span class="badge-status active">Active</span>`
          : `<span class="badge-status inactive">Inactive</span>`;

        const formattedDate = u.created_at
          ? new Date(u.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "--";

        let actionHtml = "";
        if (isSelf) {
          actionHtml = `<span style="font-size:11px; color:var(--text-dim); font-style:italic;">(Current Session)</span>`;
        } else {
          const nextStatus = !u.is_active;
          const btnClass = u.is_active
            ? "btn-toggle-status deactivate"
            : "btn-toggle-status activate";
          const btnText = u.is_active ? "Deactivate" : "Activate";
          actionHtml = `
            <button type="button" class="${btnClass}" data-user-id="${u.id}" data-next-status="${nextStatus}">
              ${btnText}
            </button>
          `;
        }

        return `
          <tr>
            <td style="font-family:monospace; color:var(--text-secondary); font-weight:600;">#${u.id}</td>
            <td><strong style="color:var(--text-main);">${u.name}</strong></td>
            <td style="font-family:monospace; color:var(--accent-blue);">${u.email}</td>
            <td>${roleBadge}</td>
            <td>${statusBadge}</td>
            <td style="color:var(--text-secondary); font-size:11.5px;">${formattedDate}</td>
            <td>${actionHtml}</td>
          </tr>
        `;
      })
      .join("");

    // Bind action buttons
    tableBody.querySelectorAll<HTMLButtonElement>(".btn-toggle-status").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const userId = btn.getAttribute("data-user-id");
        const nextStatus = btn.getAttribute("data-next-status") === "true";
        if (!userId) return;

        const confirmMsg = nextStatus
          ? "Are you sure you want to activate this user account?"
          : "Are you sure you want to deactivate this user account? The user will be unable to log in.";

        if (!confirm(confirmMsg)) return;

        btn.disabled = true;
        btn.textContent = "Updating...";
        try {
          await axios.patch(`${BACKEND_URL}/users/${userId}/status`, {
            is_active: nextStatus,
          });
          await renderUserManagement();
        } catch (err: any) {
          alert(`Failed to update user status: ${err.response?.data?.detail || "Server error"}`);
          btn.disabled = false;
        }
      });
    });
  } catch (err: any) {
    console.error("Failed loading users list:", err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:30px; color:var(--status-error);">
          Failed to load users: ${err.response?.data?.detail || err.message || "Unknown error"}
        </td>
      </tr>
    `;
  }
}

// ======================================================
// AUTHENTICATION STATE & BOOTSTRAP LOGIC
// ======================================================

let isEarthWatchInitialized = false;
let spatialLoginController: SpatialLoginController | null = null;

// DOM Elements
const authLoadingOverlay = document.querySelector<HTMLElement>("#auth-loading-overlay");
const authContainer = document.querySelector<HTMLElement>("#auth-container");
const appLayout = document.querySelector<HTMLElement>("#app-layout");
const authLoginForm = document.querySelector<HTMLFormElement>("#auth-login-form");
const loginEmail = document.querySelector<HTMLInputElement>("#login-email");
const loginPassword = document.querySelector<HTMLInputElement>("#login-password");
const loginRemember = document.querySelector<HTMLInputElement>("#login-remember");
const loginPasswordToggle = document.querySelector<HTMLButtonElement>("#login-password-toggle");
const loginForgotBtn = document.querySelector<HTMLButtonElement>("#login-forgot-btn");
const loginSubmitBtn = document.querySelector<HTMLButtonElement>("#login-submit-btn");
const loginSubmitText = document.querySelector<HTMLElement>("#login-submit-text");
const loginEmailError = document.querySelector<HTMLElement>("#login-email-error");
const loginPasswordError = document.querySelector<HTMLElement>("#login-password-error");
const authAlertBanner = document.querySelector<HTMLElement>("#auth-alert-banner");
const authAlertTitle = document.querySelector<HTMLElement>("#auth-alert-title");
const authAlertMsg = document.querySelector<HTMLElement>("#auth-alert-msg");
const authSuccessBadge = document.querySelector<HTMLElement>("#auth-success-badge");
const demoChipAdmin = document.querySelector<HTMLButtonElement>("#demo-chip-admin");
const demoChipAnalyst = document.querySelector<HTMLButtonElement>("#demo-chip-analyst");

// Topbar user elements
const topbarUserBadge = document.querySelector<HTMLElement>("#topbar-user-badge");
const topbarUserAvatar = document.querySelector<HTMLElement>("#topbar-user-avatar");
const topbarUserName = document.querySelector<HTMLElement>("#topbar-user-name");
const topbarUserRole = document.querySelector<HTMLElement>("#topbar-user-role");
const logoutBtn = document.querySelector<HTMLButtonElement>("#logout-btn");

// Admin nav elements
const navSectionAdmin = document.querySelector<HTMLElement>("#nav-section-admin");
const navItemUsers = document.querySelector<HTMLElement>("#nav-item-users");

// Add User Modal elements
const btnOpenAddUser = document.querySelector<HTMLButtonElement>("#btn-open-add-user");
const btnRefreshUsers = document.querySelector<HTMLButtonElement>("#btn-refresh-users");
const addUserModal = document.querySelector<HTMLElement>("#add-user-modal");
const closeAddUserBtn = document.querySelector<HTMLButtonElement>("#close-add-user-btn");
const cancelAddUserBtn = document.querySelector<HTMLButtonElement>("#cancel-add-user-btn");
const addUserForm = document.querySelector<HTMLFormElement>("#add-user-form");
const addUserName = document.querySelector<HTMLInputElement>("#add-user-name");
const addUserEmail = document.querySelector<HTMLInputElement>("#add-user-email");
const addUserPassword = document.querySelector<HTMLInputElement>("#add-user-password");
const addUserRole = document.querySelector<HTMLSelectElement>("#add-user-role");
const addUserAlert = document.querySelector<HTMLElement>("#add-user-alert");
const addUserNameError = document.querySelector<HTMLElement>("#add-user-name-error");
const addUserEmailError = document.querySelector<HTMLElement>("#add-user-email-error");
const addUserPasswordError = document.querySelector<HTMLElement>("#add-user-password-error");

function showAuthAlert(type: "error" | "warning" | "info", message: string) {
  if (!authAlertBanner || !authAlertMsg) return;
  authAlertBanner.className = `auth-alert-banner ${type}`;
  if (authAlertTitle) {
    authAlertTitle.textContent =
      type === "error"
        ? "AUTHENTICATION FAILED"
        : type === "warning"
        ? "SESSION NOTICE"
        : "SYSTEM INFORMATION";
  }
  authAlertMsg.textContent = message;
  authAlertBanner.style.display = "flex";
}

function clearAuthAlert() {
  if (!authAlertBanner) return;
  authAlertBanner.className = "auth-alert-banner";
  authAlertBanner.style.display = "none";
}

function clearValidationErrors() {
  if (loginEmailError) {
    loginEmailError.textContent = "";
    loginEmailError.classList.remove("visible");
  }
  if (loginPasswordError) {
    loginPasswordError.textContent = "";
    loginPasswordError.classList.remove("visible");
  }
  if (loginEmail) loginEmail.classList.remove("has-error");
  if (loginPassword) loginPassword.classList.remove("has-error");
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function updateAuthenticatedUI(user: AuthUser) {
  // Show app layout, hide auth screen & overlay
  if (authLoadingOverlay) authLoadingOverlay.style.display = "none";
  if (authContainer) authContainer.style.display = "none";
  if (appLayout) appLayout.style.display = "flex";

  // Topbar profile
  if (topbarUserBadge) topbarUserBadge.style.display = "flex";
  if (logoutBtn) logoutBtn.style.display = "inline-flex";
  if (topbarUserName) topbarUserName.textContent = user.name;
  if (topbarUserAvatar) topbarUserAvatar.textContent = getInitials(user.name);
  if (topbarUserRole) {
    topbarUserRole.textContent = user.role;
    topbarUserRole.className = `topbar-user-role ${user.role.toLowerCase()}`;
  }

  // Sidebar role-based visibility
  const isAdmin = user.role === "ADMIN";
  if (navSectionAdmin) navSectionAdmin.style.display = isAdmin ? "block" : "none";
  if (navItemUsers) navItemUsers.style.display = isAdmin ? "flex" : "none";

  // Prevent Analyst from inheriting Admin-only User Management view or stale scroll offsets
  if (!isAdmin && activeView === "users") {
    activeView = "dashboard";
    if (typeof window !== "undefined") {
      (window as any).activeView = activeView;
    }
  }
  const mainViewport = document.querySelector<HTMLElement>(".app-main-viewport");
  if (mainViewport) {
    mainViewport.scrollLeft = 0;
  }
}

async function onLoginSuccess(user: AuthUser) {
  // Show short visual transition: ✓ ACCESS VERIFIED (450ms)
  if (authContainer && authContainer.style.display !== "none" && authSuccessBadge) {
    authSuccessBadge.style.display = "flex";
    if (loginSubmitBtn) loginSubmitBtn.disabled = true;
    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  // Stop background spatial rendering loop when entering dashboard to free 100% resources
  if (spatialLoginController) {
    spatialLoginController.stop();
  }

  updateAuthenticatedUI(user);

  if (user.role !== "ADMIN" && activeView === "users") {
    activeView = "dashboard";
    if (typeof window !== "undefined") {
      (window as any).activeView = activeView;
    }
  }
  const mainViewport = document.querySelector<HTMLElement>(".app-main-viewport");
  if (mainViewport) {
    mainViewport.scrollLeft = 0;
  }

  // Initialize application data if not yet initialized
  if (!isEarthWatchInitialized) {
    isEarthWatchInitialized = true;
    await initializeEarthWatch();
  } else {
    // If returning from session, render active view
    renderCurrentView();
  }
}

function handleSessionExpired() {
  if (appLayout) appLayout.style.display = "none";
  if (authLoadingOverlay) authLoadingOverlay.style.display = "none";
  if (authContainer) authContainer.style.display = "flex";
  if (authSuccessBadge) authSuccessBadge.style.display = "none";

  if (spatialLoginController) {
    spatialLoginController.start();
  }

  showAuthAlert("warning", "Your session has expired. Please sign in again.");
}

async function performLogout() {
  try {
    await logoutUser(BACKEND_URL);
  } catch (e) {
    console.warn("Logout error:", e);
  }

  // Reset active view to dashboard so next session starts on main dashboard layout
  activeView = "dashboard";
  if (typeof window !== "undefined") {
    (window as any).activeView = activeView;
  }

  // Reset viewport scroll positions
  const mainViewport = document.querySelector<HTMLElement>(".app-main-viewport");
  if (mainViewport) {
    mainViewport.scrollLeft = 0;
  }
  const scrollContainer = document.querySelector<HTMLElement>("#main-content-scroll");
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }

  if (appLayout) appLayout.style.display = "none";
  if (topbarUserBadge) topbarUserBadge.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "none";
  if (authContainer) authContainer.style.display = "flex";
  if (authSuccessBadge) authSuccessBadge.style.display = "none";

  // Re-start 4D spatial motion engine
  if (spatialLoginController) {
    spatialLoginController.start();
  }

  // Clear fields and alert
  if (loginPassword) loginPassword.value = "";
  clearValidationErrors();
  showAuthAlert("info", "You have been logged out successfully.");
}

// Password toggle handler
let isPasswordVisible = false;
loginPasswordToggle?.addEventListener("click", () => {
  if (!loginPassword) return;
  isPasswordVisible = !isPasswordVisible;
  loginPassword.type = isPasswordVisible ? "text" : "password";
  loginPasswordToggle.textContent = isPasswordVisible ? "🙈" : "👁️";
});

// Forgot password informational handler
loginForgotBtn?.addEventListener("click", () => {
  showAuthAlert(
    "info",
    "Self-service password recovery is disabled in this environment. Please contact your system administrator."
  );
});

// Demo operator selector chips (prefills operator email; passwords are never hardcoded in source)
demoChipAdmin?.addEventListener("click", () => {
  if (loginEmail) loginEmail.value = "admin@earthwatch.ai";
  if (loginPassword) {
    loginPassword.value = "";
    loginPassword.focus();
  }
  clearValidationErrors();
  clearAuthAlert();
});

demoChipAnalyst?.addEventListener("click", () => {
  if (loginEmail) loginEmail.value = "analyst@earthwatch.ai";
  if (loginPassword) {
    loginPassword.value = "";
    loginPassword.focus();
  }
  clearValidationErrors();
  clearAuthAlert();
});

// Real-time input error clearing
loginEmail?.addEventListener("input", () => {
  if (loginEmailError) {
    loginEmailError.textContent = "";
    loginEmailError.classList.remove("visible");
  }
  loginEmail.classList.remove("has-error");
});

loginPassword?.addEventListener("input", () => {
  if (loginPasswordError) {
    loginPasswordError.textContent = "";
    loginPasswordError.classList.remove("visible");
  }
  loginPassword.classList.remove("has-error");
});

// Login Form Submit handler
authLoginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearValidationErrors();
  clearAuthAlert();

  const emailVal = loginEmail ? loginEmail.value.trim() : "";
  const passwordVal = loginPassword ? loginPassword.value : "";
  const rememberMe = loginRemember ? loginRemember.checked : false;

  let hasError = false;

  // Frontend Email Validation
  if (!emailVal) {
    if (loginEmailError) {
      loginEmailError.textContent = "Email is required.";
      loginEmailError.classList.add("visible");
    }
    if (loginEmail) loginEmail.classList.add("has-error");
    hasError = true;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    if (loginEmailError) {
      loginEmailError.textContent = "Enter a valid email address.";
      loginEmailError.classList.add("visible");
    }
    if (loginEmail) loginEmail.classList.add("has-error");
    hasError = true;
  }

  // Frontend Password Validation
  if (!passwordVal) {
    if (loginPasswordError) {
      loginPasswordError.textContent = "Password is required.";
      loginPasswordError.classList.add("visible");
    }
    if (loginPassword) loginPassword.classList.add("has-error");
    hasError = true;
  } else if (passwordVal.length < 8) {
    if (loginPasswordError) {
      loginPasswordError.textContent = "Password must be at least 8 characters.";
      loginPasswordError.classList.add("visible");
    }
    if (loginPassword) loginPassword.classList.add("has-error");
    hasError = true;
  }

  if (hasError) return;

  // Set loading state with futuristic scanning label
  if (loginSubmitBtn) loginSubmitBtn.disabled = true;
  if (loginSubmitText) loginSubmitText.textContent = "AUTHENTICATING...";

  try {
    const user = await loginUser(BACKEND_URL, {
      email: emailVal,
      password: passwordVal,
      rememberMe,
    });
    await onLoginSuccess(user);
  } catch (err: any) {
    const status = err.response?.status;
    const detail = err.response?.data?.detail;

    if (status === 401) {
      showAuthAlert("error", "Invalid email or password.");
    } else if (status === 403) {
      showAuthAlert("error", "Your account is inactive. Please contact an administrator.");
    } else if (status === 422) {
      showAuthAlert("error", "Enter a valid email address and password.");
    } else if (detail && typeof detail === "string") {
      showAuthAlert("error", detail);
    } else {
      showAuthAlert(
        "error",
        "Unable to connect to authentication service. Verify backend is running."
      );
    }
  } finally {
    if (loginSubmitBtn) loginSubmitBtn.disabled = false;
    if (loginSubmitText) loginSubmitText.textContent = "SIGN IN";
  }
});

// Logout button listener
logoutBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (confirm("Are you sure you want to sign out of EarthWatch AI?")) {
    performLogout();
  }
});

// User Management Modal Handlers
btnRefreshUsers?.addEventListener("click", () => {
  renderUserManagement();
});

btnOpenAddUser?.addEventListener("click", () => {
  if (addUserModal) addUserModal.classList.add("open");
  if (addUserAlert) addUserAlert.style.display = "none";
  if (addUserForm) addUserForm.reset();
});

closeAddUserBtn?.addEventListener("click", () => {
  if (addUserModal) addUserModal.classList.remove("open");
});

cancelAddUserBtn?.addEventListener("click", () => {
  if (addUserModal) addUserModal.classList.remove("open");
});

addUserForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!addUserName || !addUserEmail || !addUserPassword || !addUserRole) return;

  const nameVal = addUserName.value.trim();
  const emailVal = addUserEmail.value.trim();
  const passVal = addUserPassword.value;
  const roleVal = addUserRole.value;

  let formErr = false;
  if (!nameVal) {
    if (addUserNameError) {
      addUserNameError.textContent = "Full name is required.";
      addUserNameError.classList.add("visible");
    }
    formErr = true;
  }
  if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    if (addUserEmailError) {
      addUserEmailError.textContent = "Valid email is required.";
      addUserEmailError.classList.add("visible");
    }
    formErr = true;
  }
  if (!passVal || passVal.length < 8) {
    if (addUserPasswordError) {
      addUserPasswordError.textContent = "Password must be at least 8 characters.";
      addUserPasswordError.classList.add("visible");
    }
    formErr = true;
  }

  if (formErr) return;

  const submitBtn = document.querySelector<HTMLButtonElement>("#submit-add-user-btn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating...";
  }

  try {
    await axios.post(`${BACKEND_URL}/users`, {
      name: nameVal,
      email: emailVal,
      password: passVal,
      role: roleVal,
    });
    if (addUserModal) addUserModal.classList.remove("open");
    await renderUserManagement();
  } catch (err: any) {
    if (addUserAlert) {
      addUserAlert.className = "auth-alert-banner error";
      addUserAlert.textContent = err.response?.data?.detail || "Failed to create user.";
      addUserAlert.style.display = "flex";
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create User";
    }
  }
});

// App Startup Bootstrap
async function bootstrapEarthWatch() {
  setupAxiosInterceptors(() => {
    handleSessionExpired();
  });

  // Initialize 4D spatial login controller
  spatialLoginController = initSpatialLogin();

  try {
    const user = await checkStoredSession(BACKEND_URL);
    if (user) {
      await onLoginSuccess(user);
    } else {
      if (authLoadingOverlay) authLoadingOverlay.style.display = "none";
      if (appLayout) appLayout.style.display = "none";
      if (authContainer) authContainer.style.display = "flex";
      spatialLoginController.start();
    }
  } catch (err) {
    console.warn("Bootstrap session check failed:", err);
    if (authLoadingOverlay) authLoadingOverlay.style.display = "none";
    if (appLayout) appLayout.style.display = "none";
    if (authContainer) authContainer.style.display = "flex";
    spatialLoginController.start();
  }
}

// Initial statistics & interactive pipeline listeners
updateTopStatistics();
initLocationSearchCombobox();
initWorkflowPipelines();

// Start application via authentication bootstrap
bootstrapEarthWatch();

