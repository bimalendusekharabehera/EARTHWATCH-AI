def get_risk_prediction():
    # ==========================================
    # DEMO ENVIRONMENTAL INPUTS
    # ==========================================

    rainfall_mm = 145.0
    elevation_m = 18.0
    slope_degree = 2.5
    river_distance_km = 1.2
    ndvi = 0.42
    ndwi = 0.31

    # ==========================================
    # DEMO HISTORICAL INPUTS
    # ==========================================

    historical_flood_frequency = 4
    previous_flooded_area_km2 = 8.5

    # ==========================================
    # DEMO RISK CALCULATION
    # ==========================================

    risk_score = 0.0

    if rainfall_mm > 100:
        risk_score += 0.30

    if elevation_m < 30:
        risk_score += 0.20

    if slope_degree < 5:
        risk_score += 0.15

    if river_distance_km < 2:
        risk_score += 0.20

    if ndwi > 0.25:
        risk_score += 0.15

    if historical_flood_frequency >= 3:
        risk_score += 0.10

    if previous_flooded_area_km2 > 5:
        risk_score += 0.10

    # ==========================================
    # RISK LEVEL
    # ==========================================

    if risk_score >= 0.80:
        risk_level = "VERY HIGH"

    elif risk_score >= 0.60:
        risk_level = "HIGH"

    elif risk_score >= 0.40:
        risk_level = "MEDIUM"

    else:
        risk_level = "LOW"

    # ==========================================
    # RESPONSE
    # ==========================================

    return {
        "mode": "DEMO",
        "risk_level": risk_level,
        "risk_score": round(risk_score, 2),

        "environmental_factors": {
            "rainfall_mm": rainfall_mm,
            "elevation_m": elevation_m,
            "slope_degree": slope_degree,
            "river_distance_km": river_distance_km,
            "ndvi": ndvi,
            "ndwi": ndwi
        },

        "historical_factors": {
            "historical_flood_frequency": historical_flood_frequency,
            "previous_flooded_area_km2": previous_flooded_area_km2
        },

        "source": "Demo Risk Prediction Model",

        "message": (
            "Demo risk prediction. "
            "Not a scientifically validated probability."
        )
    }