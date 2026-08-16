import json
import math
import logging
from datetime import datetime, timedelta
import urllib.request
import urllib.parse
from app.core.redis_cache import cache_get, cache_set

logger = logging.getLogger(__name__)


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Returns earth distance between two points in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def check_geofence_arrival(curr_lat: float, curr_lng: float, dest_lat: float, dest_lng: float, radius_km: float = 0.5) -> bool:
    """Returns True if current coordinates are within radius_km of destination."""
    dist = haversine_distance(curr_lat, curr_lng, dest_lat, dest_lng)
    return dist <= radius_km


def fetch_osrm_road_route(start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> tuple:
    """
    Fetches real road routing polyline, distance (km), and duration (min) from OSRM free API.
    Returns (distance_km, duration_min, coords_list) or None if request fails.
    """
    url = f"http://router.project-osrm.org/route/v1/driving/{start_lng},{start_lat};{end_lng},{end_lat}?overview=full&geometries=geojson"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FleetFlow/1.0"})
        with urllib.request.urlopen(req, timeout=4) as r:
            data = json.loads(r.read().decode())
            if data.get("code") == "Ok" and data.get("routes"):
                route = data["routes"][0]
                dist_km = round(route["distance"] / 1000.0, 2)
                dur_min = round(route["duration"] / 60.0, 1)
                coords = route["geometry"]["coordinates"] # [[lng, lat], ...]
                return dist_km, dur_min, coords
    except Exception as exc:
        logger.warning("OSRM online routing request failed: %s", exc)
    return None


def generate_fallback_route_points(start_lat: float, start_lng: float, end_lat: float, end_lng: float, route_type: str = "fastest") -> list:
    """Generates coordinate path with subtle variation according to route strategy fallback."""
    steps = 25
    points = []
    offsets = {
        "fastest": (0.01, 0.2),
        "shortest": (0.002, 0.05),
        "traffic_avoidance": (-0.015, 0.4),
        "fuel_efficient": (0.008, 0.15),
    }
    amplitude, freq = offsets.get(route_type, (0.01, 0.2))
    
    for i in range(steps + 1):
        t = i / steps
        lat = start_lat + (end_lat - start_lat) * t
        lng = start_lng + (end_lng - start_lng) * t
        if 0 < i < steps:
            lat += math.sin(t * math.pi * freq) * amplitude
            lng += math.cos(t * math.pi * freq) * amplitude
        points.append([round(lng, 6), round(lat, 6)])
    return points


def get_route_options(start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> dict:
    """
    Computes 4 route strategy options (Fastest, Shortest, Traffic Avoidance, Fuel-Efficient).
    Queries real OSRM road routes when online, with fallback to Haversine calculations.
    Results are cached for 5 minutes.
    """
    cache_key = f"route_options_{start_lat:.4f}_{start_lng:.4f}_{end_lat:.4f}_{end_lng:.4f}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    osrm_data = fetch_osrm_road_route(start_lat, start_lng, end_lat, end_lng)
    
    if osrm_data:
        base_dist, base_dur, coords = osrm_data
        coords_str = json.dumps(coords)
        
        options = {
            "fastest": {
                "name": "Fastest Route",
                "distance": base_dist,
                "duration": base_dur,
                "route_type": "fastest",
                "traffic_delay_mins": 2.0,
                "fuel_estimate_liters": round(base_dist * 0.12, 1),
                "route_path": coords_str,
            },
            "shortest": {
                "name": "Shortest Route",
                "distance": round(base_dist * 0.96, 2),
                "duration": round(base_dur * 1.15, 1),
                "route_type": "shortest",
                "traffic_delay_mins": 5.0,
                "fuel_estimate_liters": round(base_dist * 0.96 * 0.11, 1),
                "route_path": coords_str,
            },
            "traffic_avoidance": {
                "name": "Traffic Avoidance Route",
                "distance": round(base_dist * 1.08, 2),
                "duration": round(base_dur * 1.05, 1),
                "route_type": "traffic_avoidance",
                "traffic_delay_mins": 0.0,
                "fuel_estimate_liters": round(base_dist * 1.08 * 0.13, 1),
                "route_path": coords_str,
            },
            "fuel_efficient": {
                "name": "Fuel-Efficient Route",
                "distance": round(base_dist * 0.99, 2),
                "duration": round(base_dur * 1.08, 1),
                "route_type": "fuel_efficient",
                "traffic_delay_mins": 1.0,
                "fuel_estimate_liters": round(base_dist * 0.99 * 0.09, 1),
                "route_path": coords_str,
            },
        }
    else:
        # Fallback if OSRM unavailable
        direct_dist = haversine_distance(start_lat, start_lng, end_lat, end_lng) or 1.0
        options = {
            "fastest": {
                "name": "Fastest Route",
                "distance": round(direct_dist * 1.15, 2),
                "duration": round((direct_dist * 1.15 / 65.0) * 60.0, 1),
                "route_type": "fastest",
                "traffic_delay_mins": 2.0,
                "fuel_estimate_liters": round(direct_dist * 1.15 * 0.12, 1),
                "route_path": json.dumps(generate_fallback_route_points(start_lat, start_lng, end_lat, end_lng, "fastest")),
            },
            "shortest": {
                "name": "Shortest Route",
                "distance": round(direct_dist * 1.02, 2),
                "duration": round((direct_dist * 1.02 / 40.0) * 60.0, 1),
                "route_type": "shortest",
                "traffic_delay_mins": 8.0,
                "fuel_estimate_liters": round(direct_dist * 1.02 * 0.11, 1),
                "route_path": json.dumps(generate_fallback_route_points(start_lat, start_lng, end_lat, end_lng, "shortest")),
            },
            "traffic_avoidance": {
                "name": "Traffic Avoidance Route",
                "distance": round(direct_dist * 1.25, 2),
                "duration": round((direct_dist * 1.25 / 60.0) * 60.0, 1),
                "route_type": "traffic_avoidance",
                "traffic_delay_mins": 0.0,
                "fuel_estimate_liters": round(direct_dist * 1.25 * 0.13, 1),
                "route_path": json.dumps(generate_fallback_route_points(start_lat, start_lng, end_lat, end_lng, "traffic_avoidance")),
            },
            "fuel_efficient": {
                "name": "Fuel-Efficient Route",
                "distance": round(direct_dist * 1.08, 2),
                "duration": round((direct_dist * 1.08 / 55.0) * 60.0, 1),
                "route_type": "fuel_efficient",
                "traffic_delay_mins": 1.5,
                "fuel_estimate_liters": round(direct_dist * 1.08 * 0.09, 1),
                "route_path": json.dumps(generate_fallback_route_points(start_lat, start_lng, end_lat, end_lng, "fuel_efficient")),
            },
        }

    cache_set(cache_key, options, ttl_seconds=300)
    return options


def calculate_route(start_lat: float, start_lng: float, end_lat: float, end_lng: float, route_type: str = "fastest") -> dict:
    """
    Calculates routing between two points for a given route strategy.
    Returns distance (km), duration (minutes), route_path (JSON coordinates string), and ETA.
    """
    options = get_route_options(start_lat, start_lng, end_lat, end_lng)
    selected = options.get(route_type, options["fastest"])
    
    eta = datetime.utcnow() + timedelta(minutes=selected["duration"])
    return {
        "distance": selected["distance"],
        "duration": selected["duration"],
        "route_path": selected["route_path"],
        "eta": eta,
        "route_type": selected["route_type"],
    }
