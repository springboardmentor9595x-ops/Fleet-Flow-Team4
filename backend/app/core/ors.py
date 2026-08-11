import json
import math
from datetime import datetime, timedelta
import httpx
import os
from app.core.redis_cache import cache_get, cache_set

ORS_API_KEY = os.getenv("ORS_API_KEY", "")


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


def generate_route_points(start_lat: float, start_lng: float, end_lat: float, end_lng: float, route_type: str = "fastest") -> list:
    """Generates coordinate path with subtle variation according to route strategy."""
    steps = 20
    points = []
    
    # Define route curvature offsets for different routing profiles
    offsets = {
        "fastest": (0.01, 0.2),         # Highway curvature
        "shortest": (0.002, 0.05),       # Direct / straight path
        "traffic_avoidance": (-0.015, 0.4), # Detour around city center
        "fuel_efficient": (0.008, 0.15),   # Smooth steady speed route
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


def get_mock_route_options(start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> dict:
    direct_dist = haversine_distance(start_lat, start_lng, end_lat, end_lng)
    if direct_dist == 0:
        direct_dist = 1.0

    options = {
        "fastest": {
            "name": "Fastest Route",
            "distance": round(direct_dist * 1.15, 2),
            "duration": round((direct_dist * 1.15 / 65.0) * 60.0, 1),
            "route_type": "fastest",
            "traffic_delay_mins": 2.0,
            "fuel_estimate_liters": round(direct_dist * 1.15 * 0.12, 1),
            "route_path": json.dumps(generate_route_points(start_lat, start_lng, end_lat, end_lng, "fastest")),
        },
        "shortest": {
            "name": "Shortest Route",
            "distance": round(direct_dist * 1.02, 2),
            "duration": round((direct_dist * 1.02 / 40.0) * 60.0, 1),
            "route_type": "shortest",
            "traffic_delay_mins": 8.0,
            "fuel_estimate_liters": round(direct_dist * 1.02 * 0.11, 1),
            "route_path": json.dumps(generate_route_points(start_lat, start_lng, end_lat, end_lng, "shortest")),
        },
        "traffic_avoidance": {
            "name": "Traffic Avoidance Route",
            "distance": round(direct_dist * 1.25, 2),
            "duration": round((direct_dist * 1.25 / 60.0) * 60.0, 1),
            "route_type": "traffic_avoidance",
            "traffic_delay_mins": 0.0,
            "fuel_estimate_liters": round(direct_dist * 1.25 * 0.13, 1),
            "route_path": json.dumps(generate_route_points(start_lat, start_lng, end_lat, end_lng, "traffic_avoidance")),
        },
        "fuel_efficient": {
            "name": "Fuel-Efficient Route",
            "distance": round(direct_dist * 1.08, 2),
            "duration": round((direct_dist * 1.08 / 55.0) * 60.0, 1),
            "route_type": "fuel_efficient",
            "traffic_delay_mins": 1.5,
            "fuel_estimate_liters": round(direct_dist * 1.08 * 0.09, 1),
            "route_path": json.dumps(generate_route_points(start_lat, start_lng, end_lat, end_lng, "fuel_efficient")),
        },
    }
    return options


def get_route_options(start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> dict:
    """
    Computes all 4 route options (Fastest, Shortest, Traffic Avoidance, Fuel-Efficient).
    Uses Redis / In-Memory caching (5 minute TTL).
    """
    cache_key = f"route_options_{start_lat:.4f}_{start_lng:.4f}_{end_lat:.4f}_{end_lng:.4f}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    options = get_mock_route_options(start_lat, start_lng, end_lat, end_lng)
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
