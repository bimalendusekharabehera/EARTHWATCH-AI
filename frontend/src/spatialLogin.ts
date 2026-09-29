/**
 * spatialLogin.ts
 * ====================================================================
 * EARTHWATCH AI — 4D SPATIAL MOTION SATELLITE COMMAND LOGIN SYSTEM
 * ====================================================================
 * Features:
 * - 3D Vector Earth Observation Globe (graticule, landmass points, glow)
 * - 3D Real-time Orbital Rings (Polar, Inclined, Equatorial orbits)
 * - Sentinel-1 SAR Observation Satellite Model with solar panels & beacon
 * - 360-degree Rotating Radar Scan with observation node illumination
 * - 4D Multi-plane Parallax System with LERP smoothing
 * - Holographic Mission Control HUD elements with scientific telemetry
 * - Floating glass console with subtle 3D gyroscope/mouse tilt
 * - High-efficiency requestAnimationFrame loop (pauses when authenticated)
 * - Respects prefers-reduced-motion and responsive mobile viewpoints
 */

export interface SpatialLoginController {
  start: () => void;
  stop: () => void;
  resize: () => void;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface ObservationNode {
  lat: number;
  lon: number;
  label: string;
  isAnomaly?: boolean;
}

export function initSpatialLogin(): SpatialLoginController {
  const container = document.querySelector<HTMLElement>("#auth-container");
  const canvas = document.querySelector<HTMLCanvasElement>("#spatial-earth-canvas");
  const consoleCard = document.querySelector<HTMLElement>("#auth-console-card");
  const hudLayer = document.querySelector<HTMLElement>("#spatial-hud-layer");
  const gridLayer = document.querySelector<HTMLElement>("#spatial-grid-layer");
  const satelliteTag = document.querySelector<HTMLElement>("#satellite-telemetry-tag");

  if (!container || !canvas) {
    return {
      start: () => {},
      stop: () => {},
      resize: () => {},
    };
  }

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    return {
      start: () => {},
      stop: () => {},
      resize: () => {},
    };
  }

  let animationFrameId: number | null = null;
  let isRunning = false;

  // Viewport dimensions
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Parallax coordinates (normalized -1 to +1)
  let targetPointerX = 0;
  let targetPointerY = 0;
  let currentPointerX = 0;
  let currentPointerY = 0;

  // Continuous animation angles
  let earthYaw = 0.4;
  const earthPitch = 0.38; // ~22 degrees axial tilt
  let radarAngle = 0;
  let satelliteOrbitAngle = 1.2;

  // Reduced motion preference
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let prefersReducedMotion = reducedMotionQuery.matches;
  reducedMotionQuery.addEventListener("change", (e) => {
    prefersReducedMotion = e.matches;
  });

  // Background stars dataset (depth layer 01)
  const stars: { x: number; y: number; size: number; alpha: number; speed: number }[] = [];
  for (let i = 0; i < 140; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.7 + 0.2,
      speed: Math.random() * 0.02 + 0.005,
    });
  }

  // Pre-calculated Earth landmass coordinate points (simplified continent outlines)
  // Latitude (-90 to +90) and Longitude (-180 to +180) in radians
  const continentCoords: [number, number][] = [
    // Asia & India
    [20.5, 78.9], [28.6, 77.2], [13.0, 80.2], [19.0, 72.8], [22.5, 88.3], [20.3, 85.8],
    [35.8, 104.1], [39.9, 116.4], [31.2, 121.4], [34.0, 108.9], [23.1, 113.2],
    [36.2, 138.2], [35.6, 139.6], [37.5, 126.9],
    // Southeast Asia
    [15.8, 100.9], [13.7, 100.5], [10.8, 106.6], [3.1, 101.6], [-0.7, 113.9],
    // Europe
    [51.5, -0.1], [48.8, 2.3], [52.5, 13.4], [41.9, 12.5], [40.4, -3.7], [59.3, 18.0],
    [55.7, 37.6], [50.4, 30.5], [41.0, 28.9],
    // Africa
    [9.0, 8.6], [30.0, 31.2], [-1.2, 36.8], [-26.2, 28.0], [6.5, 3.3], [14.7, -17.4],
    [4.0, 21.7], [-4.4, 15.2], [-18.6, 35.5],
    // North America
    [37.0, -95.7], [40.7, -74.0], [34.0, -118.2], [41.8, -87.6], [29.7, -95.3],
    [45.4, -75.6], [49.2, -123.1], [23.6, -102.5], [19.4, -99.1],
    // South America
    [-14.2, -51.9], [-23.5, -46.6], [-34.6, -58.3], [-12.0, -77.0], [4.7, -74.0],
    // Australia
    [-25.2, 133.7], [-33.8, 151.2], [-37.8, 144.9], [-31.9, 115.8],
  ].map(([lat, lon]) => [(lat * Math.PI) / 180, (lon * Math.PI) / 180]);

  // Specific Observation Nodes (monitoring hotspots)
  const observationNodes: ObservationNode[] = [
    { lat: (20.2961 * Math.PI) / 180, lon: (85.8245 * Math.PI) / 180, label: "ODISHA-01", isAnomaly: true },
    { lat: (26.2006 * Math.PI) / 180, lon: (92.9376 * Math.PI) / 180, label: "ASSAM-BRAHMAPUTRA" },
    { lat: (29.9511 * Math.PI) / 180, lon: (-90.0715 * Math.PI) / 180, label: "MISSISSIPPI-DELTA" },
    { lat: (51.2194 * Math.PI) / 180, lon: (4.4025 * Math.PI) / 180, label: "RHINE-BASIN" },
    { lat: (10.8231 * Math.PI) / 180, lon: (106.6297 * Math.PI) / 180, label: "MEKONG-DELTA" },
  ];

  function resize() {
    width = canvas!.width = window.innerWidth * dpr;
    height = canvas!.height = window.innerHeight * dpr;
    canvas!.style.width = `${window.innerWidth}px`;
    canvas!.style.height = `${window.innerHeight}px`;
  }

  // Pointer move handler with normalized spatial output
  function handlePointerMove(e: PointerEvent) {
    const rawX = (e.clientX / window.innerWidth - 0.5) * 2;
    const rawY = (e.clientY / window.innerHeight - 0.5) * 2;
    targetPointerX = Math.max(-1, Math.min(1, rawX));
    targetPointerY = Math.max(-1, Math.min(1, rawY));
  }

  function handlePointerLeave() {
    targetPointerX = 0;
    targetPointerY = 0;
  }

  // 3D Spherical to Cartesian projection with Earth tilt and rotation
  function projectSphere(lat: number, lon: number, radius: number): Point3D {
    // 1. Base sphere position
    const x0 = radius * Math.cos(lat) * Math.sin(lon + earthYaw);
    const y0 = -radius * Math.sin(lat);
    const z0 = radius * Math.cos(lat) * Math.cos(lon + earthYaw);

    // 2. Axial pitch tilt (around X axis)
    const cosP = Math.cos(earthPitch);
    const sinP = Math.sin(earthPitch);
    const y1 = y0 * cosP - z0 * sinP;
    const z1 = y0 * sinP + z0 * cosP;

    // 3. Subtle pointer parallax rotation
    const cosPX = Math.cos(currentPointerX * 0.08);
    const sinPX = Math.sin(currentPointerX * 0.08);
    const x2 = x0 * cosPX + z1 * sinPX;
    const z2 = -x0 * sinPX + z1 * cosPX;

    return { x: x2, y: y1, z: z2 };
  }

  // Main rendering loop
  function render() {
    if (!isRunning) return;

    // Smooth LERP interpolation for 4D mouse parallax
    currentPointerX += (targetPointerX - currentPointerX) * 0.06;
    currentPointerY += (targetPointerY - currentPointerY) * 0.06;

    // Increment rotation angles
    if (!prefersReducedMotion) {
      earthYaw += 0.0025; // Slow continuous planetary rotation
      radarAngle = (radarAngle + 0.02) % (Math.PI * 2);
      satelliteOrbitAngle = (satelliteOrbitAngle + 0.012) % (Math.PI * 2);
    }

    // Determine layout geometry based on screen width
    const isDesktop = window.innerWidth >= 1024;
    const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;

    let earthCenterX = (width / dpr) * (isDesktop ? 0.36 : isTablet ? 0.42 : 0.5);
    let earthCenterY = (height / dpr) * (isDesktop ? 0.5 : isTablet ? 0.46 : 0.38);

    // Apply parallax offset to Earth position (Multiplier: 3.0)
    earthCenterX += currentPointerX * -18;
    earthCenterY += currentPointerY * -14;

    const baseRadius = isDesktop
      ? Math.min(window.innerWidth * 0.22, window.innerHeight * 0.34, 300)
      : isTablet
      ? Math.min(window.innerWidth * 0.26, 230)
      : Math.min(window.innerWidth * 0.36, 160);

    ctx!.save();
    ctx!.scale(dpr, dpr);
    ctx!.clearRect(0, 0, width / dpr, height / dpr);

    // ── 1. DEPTH LAYER 01: STARS & BACKGROUND SPACE ──────────
    ctx!.fillStyle = "#ffffff";
    for (const star of stars) {
      const starParallaxX = star.x * (width / dpr) + currentPointerX * -6;
      const starParallaxY = star.y * (height / dpr) + currentPointerY * -6;
      const pulseAlpha = star.alpha * (0.8 + 0.2 * Math.sin(Date.now() * star.speed));

      ctx!.globalAlpha = pulseAlpha;
      ctx!.beginPath();
      ctx!.arc(starParallaxX, starParallaxY, star.size, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1.0;

    // ── 2. DEPTH LAYER 02: ATMOSPHERIC OUTER GLOW ─────────────
    const glowGradient = ctx!.createRadialGradient(
      earthCenterX,
      earthCenterY,
      baseRadius * 0.88,
      earthCenterX,
      earthCenterY,
      baseRadius * 1.55
    );
    glowGradient.addColorStop(0, "rgba(0, 240, 255, 0.24)");
    glowGradient.addColorStop(0.35, "rgba(2, 132, 199, 0.14)");
    glowGradient.addColorStop(0.7, "rgba(14, 30, 62, 0.08)");
    glowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx!.fillStyle = glowGradient;
    ctx!.beginPath();
    ctx!.arc(earthCenterX, earthCenterY, baseRadius * 1.55, 0, Math.PI * 2);
    ctx!.fill();

    // ── 3. DEPTH LAYER 03: ORBITAL RINGS (BACKWARD HALF: z < 0)
    renderOrbitalRings(ctx!, earthCenterX, earthCenterY, baseRadius, false);

    // ── 4. DEPTH LAYER 04: EARTH SPHERE BASE & OCCLUSION ──────
    // Solid dark sphere preventing stars behind from shining through
    const sphereGradient = ctx!.createRadialGradient(
      earthCenterX - baseRadius * 0.35,
      earthCenterY - baseRadius * 0.35,
      baseRadius * 0.1,
      earthCenterX,
      earthCenterY,
      baseRadius
    );
    sphereGradient.addColorStop(0, "#08162e");
    sphereGradient.addColorStop(0.55, "#060e20");
    sphereGradient.addColorStop(0.9, "#030611");
    sphereGradient.addColorStop(1, "#020409");

    ctx!.fillStyle = sphereGradient;
    ctx!.beginPath();
    ctx!.arc(earthCenterX, earthCenterY, baseRadius, 0, Math.PI * 2);
    ctx!.fill();

    // Spherical clip region for globe features
    ctx!.save();
    ctx!.beginPath();
    ctx!.arc(earthCenterX, earthCenterY, baseRadius - 0.5, 0, Math.PI * 2);
    ctx!.clip();

    // ── 4.1 LATITUDE & LONGITUDE GRATICULE LINES ─────────────
    ctx!.lineWidth = 0.8;
    ctx!.strokeStyle = "rgba(56, 189, 248, 0.14)";

    // Parallels of latitude
    const latLines = [-60, -40, -20, 0, 20, 40, 60];
    for (const deg of latLines) {
      const latRad = (deg * Math.PI) / 180;
      ctx!.beginPath();
      let first = true;
      for (let lonDeg = -180; lonDeg <= 180; lonDeg += 10) {
        const pt = projectSphere(latRad, (lonDeg * Math.PI) / 180, baseRadius);
        if (pt.z > 0) {
          const px = earthCenterX + pt.x;
          const py = earthCenterY + pt.y;
          if (first) {
            ctx!.moveTo(px, py);
            first = false;
          } else {
            ctx!.lineTo(px, py);
          }
        } else {
          first = true;
        }
      }
      ctx!.stroke();
    }

    // Meridians of longitude
    for (let lonDeg = -180; lonDeg < 180; lonDeg += 30) {
      const lonRad = (lonDeg * Math.PI) / 180;
      ctx!.beginPath();
      let first = true;
      for (let latDeg = -85; latDeg <= 85; latDeg += 6) {
        const pt = projectSphere((latDeg * Math.PI) / 180, lonRad, baseRadius);
        if (pt.z > 0) {
          const px = earthCenterX + pt.x;
          const py = earthCenterY + pt.y;
          if (first) {
            ctx!.moveTo(px, py);
            first = false;
          } else {
            ctx!.lineTo(px, py);
          }
        } else {
          first = true;
        }
      }
      ctx!.stroke();
    }

    // ── 4.2 CONTINENTAL POINT CLOUD & TOPOGRAPHY ──────────────
    for (let i = 0; i < continentCoords.length; i++) {
      const [lat, lon] = continentCoords[i];
      const pt = projectSphere(lat, lon, baseRadius * 0.99);
      if (pt.z > 0) {
        const px = earthCenterX + pt.x;
        const py = earthCenterY + pt.y;
        const depthAlpha = Math.max(0.2, (pt.z / baseRadius) * 0.85);

        ctx!.fillStyle = `rgba(0, 240, 255, ${depthAlpha * 0.75})`;
        ctx!.beginPath();
        ctx!.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx!.fill();

        // Connect nearby points to form subtle continental mesh
        const nextCoord = continentCoords[(i + 1) % continentCoords.length];
        const nextPt = projectSphere(nextCoord[0], nextCoord[1], baseRadius * 0.99);
        if (nextPt.z > 0) {
          const dist = Math.hypot(pt.x - nextPt.x, pt.y - nextPt.y);
          if (dist < baseRadius * 0.45) {
            ctx!.strokeStyle = `rgba(0, 240, 255, ${depthAlpha * 0.22})`;
            ctx!.lineWidth = 0.7;
            ctx!.beginPath();
            ctx!.moveTo(px, py);
            ctx!.lineTo(earthCenterX + nextPt.x, earthCenterY + nextPt.y);
            ctx!.stroke();
          }
        }
      }
    }

    // ── 4.3 RADAR SWEEP LINE ────────────────────────────────
    ctx!.save();
    ctx!.beginPath();
    ctx!.moveTo(earthCenterX, earthCenterY);
    ctx!.arc(
      earthCenterX,
      earthCenterY,
      baseRadius,
      radarAngle - 0.4,
      radarAngle
    );
    ctx!.closePath();

    const sweepGrad = ctx!.createRadialGradient(
      earthCenterX,
      earthCenterY,
      10,
      earthCenterX,
      earthCenterY,
      baseRadius
    );
    sweepGrad.addColorStop(0, "rgba(0, 240, 255, 0)");
    sweepGrad.addColorStop(1, "rgba(0, 240, 255, 0.16)");
    ctx!.fillStyle = sweepGrad;
    ctx!.fill();

    // Radar leading edge line
    ctx!.strokeStyle = "rgba(0, 240, 255, 0.45)";
    ctx!.lineWidth = 1.2;
    ctx!.beginPath();
    ctx!.moveTo(earthCenterX, earthCenterY);
    ctx!.lineTo(
      earthCenterX + baseRadius * Math.cos(radarAngle),
      earthCenterY + baseRadius * Math.sin(radarAngle)
    );
    ctx!.stroke();
    ctx!.restore();

    // ── 4.4 OBSERVATION NODES & FLOOD ANOMALY HOTSPOTS ──────
    for (const node of observationNodes) {
      const pt = projectSphere(node.lat, node.lon, baseRadius * 1.005);
      if (pt.z > 0) {
        const nx = earthCenterX + pt.x;
        const ny = earthCenterY + pt.y;

        // Angle to radar sweep
        const nodeAngle = Math.atan2(ny - earthCenterY, nx - earthCenterX);
        let angleDiff = Math.abs(radarAngle - nodeAngle);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
        const isIlluminated = angleDiff < 0.28;

        const pulse = Math.sin(Date.now() * 0.006) * 0.5 + 0.5;

        // Core marker
        const nodeColor = node.isAnomaly
          ? isIlluminated ? "#ef4444" : "#f59e0b"
          : isIlluminated ? "#38f4ff" : "#00f0ff";

        ctx!.fillStyle = nodeColor;
        ctx!.beginPath();
        ctx!.arc(nx, ny, isIlluminated ? 3.5 : 2.4, 0, Math.PI * 2);
        ctx!.fill();

        // Pulsing ring
        ctx!.strokeStyle = nodeColor;
        ctx!.lineWidth = 1;
        ctx!.globalAlpha = isIlluminated ? 0.9 : pulse * 0.5;
        ctx!.beginPath();
        ctx!.arc(nx, ny, 5 + pulse * 4, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.globalAlpha = 1.0;

        // Micro HUD telemetry pin
        if (isDesktop && pt.z > baseRadius * 0.4) {
          ctx!.fillStyle = "rgba(248, 250, 252, 0.75)";
          ctx!.font = "9px ui-monospace, SFMono-Regular, monospace";
          ctx!.fillText(`[${node.label}]`, nx + 8, ny - 6);
        }
      }
    }

    // ── 4.5 LIMB DARKENING & ATMOSPHERE SHADOW (3D SHADING) ──
    const limbGrad = ctx!.createRadialGradient(
      earthCenterX - baseRadius * 0.4,
      earthCenterY - baseRadius * 0.4,
      baseRadius * 0.4,
      earthCenterX,
      earthCenterY,
      baseRadius
    );
    limbGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    limbGrad.addColorStop(0.75, "rgba(3, 6, 17, 0.35)");
    limbGrad.addColorStop(1, "rgba(0, 240, 255, 0.45)");

    ctx!.fillStyle = limbGrad;
    ctx!.beginPath();
    ctx!.arc(earthCenterX, earthCenterY, baseRadius, 0, Math.PI * 2);
    ctx!.fill();

    ctx!.restore(); // End spherical clip

    // ── 5. DEPTH LAYER 05: ORBITAL RINGS (FORWARD HALF: z > 0)
    renderOrbitalRings(ctx!, earthCenterX, earthCenterY, baseRadius, true);

    // ── 6. DEPTH LAYER 06: SENTINEL-1 SATELLITE MODEL ─────────
    renderSatellite(ctx!, earthCenterX, earthCenterY, baseRadius, satelliteTag);

    ctx!.restore();

    // ── 7. DEPTH LAYER 07: 4D PARALLAX TO HUD & CONSOLE ───────
    applyDOMParallax();

    animationFrameId = requestAnimationFrame(render);
  }

  // Draw 3D orbital rings with depth partitioning
  function renderOrbitalRings(
    context: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    isFront: boolean
  ) {
    // Ring 1: Polar Sentinel-1 Orbit (Radius 1.45r, tilted ~85 deg)
    drawOrbitEllipse(context, cx, cy, r * 1.42, 0.92, -0.28, isFront, "rgba(0, 240, 255, 0.38)");

    // Ring 2: Equatorial Telemetry Orbit (Radius 1.62r, tilted ~18 deg)
    drawOrbitEllipse(context, cx, cy, r * 1.64, 0.35, 0.45, isFront, "rgba(56, 189, 248, 0.22)");

    // Ring 3: Inclined Geostationary Transfer (Radius 1.88r, tilted ~42 deg)
    drawOrbitEllipse(context, cx, cy, r * 1.88, 0.62, -0.65, isFront, "rgba(0, 240, 255, 0.16)");
  }

  function drawOrbitEllipse(
    context: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    tiltX: number,
    tiltZ: number,
    frontOnly: boolean,
    color: string
  ) {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = 1;

    context.beginPath();
    let started = false;
    const steps = 64;

    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const x0 = radius * Math.cos(angle);
      const y0 = radius * Math.sin(angle) * tiltX;
      const z0 = radius * Math.sin(angle) * Math.cos(tiltX);

      // Rotate by tiltZ
      const cosZ = Math.cos(tiltZ);
      const sinZ = Math.sin(tiltZ);
      const rx = x0 * cosZ - y0 * sinZ;
      const ry = x0 * sinZ + y0 * cosZ;

      const isCurrentFront = z0 >= 0;
      if (isCurrentFront === frontOnly) {
        const px = cx + rx;
        const py = cy + ry;
        if (!started) {
          context.moveTo(px, py);
          started = true;
        } else {
          context.lineTo(px, py);
        }
      } else {
        started = false;
      }
    }

    if (frontOnly) {
      context.shadowColor = "#00f0ff";
      context.shadowBlur = 6;
    }
    context.stroke();
    context.restore();
  }

  // Draw Sentinel-1 Satellite model in orbit
  function renderSatellite(
    context: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    tagEl: HTMLElement | null
  ) {
    const orbitR = r * 1.42;
    const angle = satelliteOrbitAngle;
    const tiltX = 0.92;
    const tiltZ = -0.28;

    const x0 = orbitR * Math.cos(angle);
    const y0 = orbitR * Math.sin(angle) * tiltX;
    const z0 = orbitR * Math.sin(angle) * Math.cos(tiltX);

    const cosZ = Math.cos(tiltZ);
    const sinZ = Math.sin(tiltZ);
    const satX = cx + (x0 * cosZ - y0 * sinZ);
    const satY = cy + (x0 * sinZ + y0 * cosZ);

    const isSatInFront = z0 >= -50;
    const satScale = isSatInFront ? 1.0 : 0.7;

    context.save();
    context.translate(satX, satY);
    context.scale(satScale, satScale);

    // Satellite rotation oriented to trajectory
    const tangentAngle = angle + Math.PI / 2 + tiltZ;
    context.rotate(tangentAngle);

    // 1. Solar Panels (Left & Right Wings)
    context.fillStyle = "#0284c7";
    context.strokeStyle = "#38bdf8";
    context.lineWidth = 0.8;

    // Left panel
    context.fillRect(-22, -4, 14, 8);
    context.strokeRect(-22, -4, 14, 8);

    // Right panel
    context.fillRect(8, -4, 14, 8);
    context.strokeRect(8, -4, 14, 8);

    // Solar grid lines
    context.beginPath();
    context.moveTo(-15, -4); context.lineTo(-15, 4);
    context.moveTo(15, -4); context.lineTo(15, 4);
    context.stroke();

    // 2. Central Satellite Bus Body
    context.fillStyle = "#0a1b38";
    context.strokeStyle = "#00f0ff";
    context.lineWidth = 1.2;
    context.fillRect(-7, -6, 14, 12);
    context.strokeRect(-7, -6, 14, 12);

    // 3. SAR Radar Antenna (Long planar array)
    context.fillStyle = "rgba(0, 240, 255, 0.4)";
    context.fillRect(-9, 7, 18, 2.5);

    // 4. Blinking Cyan Navigation Light
    const beaconPulse = Math.sin(Date.now() * 0.01) > 0.3;
    if (beaconPulse) {
      context.fillStyle = "#00f0ff";
      context.shadowColor = "#00f0ff";
      context.shadowBlur = 8;
      context.beginPath();
      context.arc(0, -6, 2, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();

    // Update Floating Satellite Telemetry HUD position
    if (tagEl && window.innerWidth >= 1024) {
      if (isSatInFront) {
        tagEl.style.display = "block";
        tagEl.style.transform = `translate3d(${satX + 24}px, ${satY - 32}px, 0)`;
      } else {
        tagEl.style.display = "none";
      }
    }
  }

  // Multi-plane 4D DOM parallax transforms
  function applyDOMParallax() {
    if (prefersReducedMotion) return;

    // Layer 02: Geospatial background grid (Multiplier: 1.0)
    if (gridLayer) {
      gridLayer.style.transform = `translate3d(${currentPointerX * -12}px, ${currentPointerY * -12}px, 0)`;
    }

    // Layer 06: Holographic HUD brackets & telemetry cards (Multiplier: 4.0)
    if (hudLayer) {
      hudLayer.style.transform = `translate3d(${currentPointerX * -36}px, ${currentPointerY * -30}px, 0)`;
    }

    // Layer 07: Floating Glass Authentication Console (Multiplier: 1.5, Tilt: max 3deg)
    if (consoleCard) {
      const tiltY = currentPointerX * 2.8; // subtle rotateY
      const tiltX = -currentPointerY * 2.8; // subtle rotateX
      const shiftX = currentPointerX * -14;
      const shiftY = currentPointerY * -12;

      consoleCard.style.transform = `perspective(1200px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translate3d(${shiftX.toFixed(1)}px, ${shiftY.toFixed(1)}px, 15px)`;
    }
  }

  // Setup DOM listeners
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
  window.addEventListener("resize", resize, { passive: true });

  return {
    start: () => {
      if (isRunning) return;
      isRunning = true;
      resize();
      render();
    },
    stop: () => {
      isRunning = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
    resize,
  };
}
