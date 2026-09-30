from fastapi import APIRouter, Query
import urllib.request
import urllib.parse
import json
import os
from typing import List, Dict, Any
from app.config.database import get_connection

router = APIRouter()

# Known major regional/Indian reference centroids for instant prefix autocomplete assistance
REFERENCE_CENTROIDS: List[Dict[str, Any]] = [
    {"name": "Cuttack", "district": "Cuttack", "state": "Odisha", "country": "India", "latitude": 20.4686, "longitude": 85.8792},
    {"name": "Puri", "district": "Puri", "state": "Odisha", "country": "India", "latitude": 19.8135, "longitude": 85.8312},
    {"name": "Rourkela", "district": "Sundargarh", "state": "Odisha", "country": "India", "latitude": 22.2492, "longitude": 84.8828},
    {"name": "Sambalpur", "district": "Sambalpur", "state": "Odisha", "country": "India", "latitude": 21.4669, "longitude": 83.9812},
    {"name": "Berhampur", "district": "Ganjam", "state": "Odisha", "country": "India", "latitude": 19.3150, "longitude": 84.7941},
    {"name": "Delhi", "district": "New Delhi", "state": "Delhi", "country": "India", "latitude": 28.6139, "longitude": 77.2090},
    {"name": "Mumbai", "district": "Mumbai City", "state": "Maharashtra", "country": "India", "latitude": 19.0760, "longitude": 72.8777},
    {"name": "Kolkata", "district": "Kolkata", "state": "West Bengal", "country": "India", "latitude": 22.5726, "longitude": 88.3639},
    {"name": "Hyderabad", "district": "Hyderabad", "state": "Telangana", "country": "India", "latitude": 17.3850, "longitude": 78.4867},
    {"name": "Bengaluru", "district": "Bengaluru Urban", "state": "Karnataka", "country": "India", "latitude": 12.9716, "longitude": 77.5946},
    {"name": "Chennai", "district": "Chennai", "state": "Tamil Nadu", "country": "India", "latitude": 13.0827, "longitude": 80.2707},
    {"name": "Ahmedabad", "district": "Ahmedabad", "state": "Gujarat", "country": "India", "latitude": 23.0225, "longitude": 72.5714},
    {"name": "Pune", "district": "Pune", "state": "Maharashtra", "country": "India", "latitude": 18.5204, "longitude": 73.8567},
    {"name": "Jaipur", "district": "Jaipur", "state": "Rajasthan", "country": "India", "latitude": 26.9124, "longitude": 75.7873},
    {"name": "Guwahati", "district": "Kamrup", "state": "Assam", "country": "India", "latitude": 26.1445, "longitude": 91.7362},
    {"name": "Patna", "district": "Patna", "state": "Bihar", "country": "India", "latitude": 25.5941, "longitude": 85.1376},
]

OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "").strip()


@router.get("/geocoding/search")
def search_locations(q: str = Query(..., min_length=1, max_length=120)):
    """
    Dynamic geocoding search endpoint for EarthWatch AI.
    Searches:
    1. SQL Server official monitored locations (tagged as DATABASE MONITORED).
    2. Dynamic external geocoding (OpenWeather / OpenStreetMap Nominatim), tagged as SEARCHED LOCATION.
    Does NOT write to SQL Server or alter the Locations table.
    """
    clean_q = q.strip()
    if not clean_q:
        return {"status": "success", "query": q, "count": 0, "results": []}

    results: List[Dict[str, Any]] = []
    seen_keys = set()

    # 1. Search Database Monitored Locations first
    try:
        connection = get_connection()
        try:
            cursor = connection.cursor()
            cursor.execute("""
                SELECT LocationID, LocationName, District, State, Latitude, Longitude
                FROM Locations
                WHERE LocationName LIKE ? OR District LIKE ? OR State LIKE ?
                ORDER BY LocationID
            """, (f"%{clean_q}%", f"%{clean_q}%", f"%{clean_q}%"))
            rows = cursor.fetchall()
            for row in rows:
                key = (round(float(row.Latitude), 3), round(float(row.Longitude), 3))
                seen_keys.add(key)
                seen_keys.add(row.LocationName.lower().strip())
                results.append({
                    "name": row.LocationName,
                    "district": row.District,
                    "state": row.State,
                    "country": "India",
                    "display_name": f"{row.LocationName}, {row.District}, {row.State}, India",
                    "latitude": float(row.Latitude),
                    "longitude": float(row.Longitude),
                    "is_database_monitored": True,
                    "location_id": row.LocationID,
                    "badge": "DATABASE MONITORED"
                })
        finally:
            connection.close()
    except Exception as e:
        # Fallback if DB connection is unavailable
        pass

    # 2. Check reference centroids for matching prefix/substring
    q_lower = clean_q.lower()
    for ref in REFERENCE_CENTROIDS:
        if (
            q_lower in ref["name"].lower()
            or q_lower in ref["district"].lower()
            or q_lower in ref["state"].lower()
        ):
            key = (round(ref["latitude"], 3), round(ref["longitude"], 3))
            name_key = ref["name"].lower().strip()
            if key not in seen_keys and name_key not in seen_keys:
                seen_keys.add(key)
                seen_keys.add(name_key)
                results.append({
                    "name": ref["name"],
                    "district": ref["district"],
                    "state": ref["state"],
                    "country": ref["country"],
                    "display_name": f"{ref['name']}, {ref['state']}, {ref['country']}",
                    "latitude": ref["latitude"],
                    "longitude": ref["longitude"],
                    "is_database_monitored": False,
                    "location_id": None,
                    "badge": "SEARCHED LOCATION"
                })

    # 3. Dynamic External Geocoding (OpenWeather Geocoding API if key configured)
    if len(clean_q) >= 2 and OPENWEATHER_API_KEY:
        try:
            ow_url = f"https://api.openweathermap.org/geo/1.0/direct?q={urllib.parse.quote(clean_q)}&limit=6&appid={OPENWEATHER_API_KEY}"
            req = urllib.request.Request(ow_url, headers={"User-Agent": "EarthWatch-AI/1.0"})
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list):
                    for item in data:
                        lat = float(item.get("lat", 0.0))
                        lon = float(item.get("lon", 0.0))
                        key = (round(lat, 3), round(lon, 3))
                        name = item.get("name", clean_q)
                        name_key = name.lower().strip()
                        if key not in seen_keys and name_key not in seen_keys:
                            seen_keys.add(key)
                            seen_keys.add(name_key)
                            state = item.get("state") or ""
                            country = item.get("country") or ""
                            parts = [p for p in [name, state, country] if p]
                            results.append({
                                "name": name,
                                "district": state or name,
                                "state": state,
                                "country": country,
                                "display_name": ", ".join(parts),
                                "latitude": lat,
                                "longitude": lon,
                                "is_database_monitored": False,
                                "location_id": None,
                                "badge": "SEARCHED LOCATION"
                            })
        except Exception:
            pass

    # 4. Fallback to OpenStreetMap Nominatim if we have fewer than 3 results
    if len(results) < 3 and len(clean_q) >= 3:
        try:
            nom_url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(clean_q)}&format=json&addressdetails=1&limit=5"
            req = urllib.request.Request(nom_url, headers={"User-Agent": "EarthWatch-AI/1.0 (contact@earthwatch.ai)"})
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list):
                    for item in data:
                        lat = float(item.get("lat", 0.0))
                        lon = float(item.get("lon", 0.0))
                        key = (round(lat, 3), round(lon, 3))
                        addr = item.get("address", {})
                        name = item.get("name") or item.get("display_name", "").split(",")[0].strip()
                        name_key = name.lower().strip()
                        if key not in seen_keys and name_key not in seen_keys:
                            seen_keys.add(key)
                            seen_keys.add(name_key)
                            district = addr.get("county") or addr.get("state_district") or addr.get("city") or ""
                            state = addr.get("state") or addr.get("region") or ""
                            country = addr.get("country") or ""
                            parts = [p for p in [name, district, state, country] if p]
                            results.append({
                                "name": name,
                                "district": district or state,
                                "state": state,
                                "country": country,
                                "display_name": ", ".join(parts[:3]),
                                "latitude": lat,
                                "longitude": lon,
                                "is_database_monitored": False,
                                "location_id": None,
                                "badge": "SEARCHED LOCATION"
                            })
        except Exception:
            pass

    return {
        "status": "success",
        "query": clean_q,
        "count": len(results),
        "results": results[:10]
    }
