import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.ors import calculate_route, get_route_options, check_geofence_arrival

client = TestClient(app)


def test_route_options_calculation():
    """Verify route options engine returns 4 routing strategy profiles."""
    options = get_route_options(28.6139, 77.2090, 28.7041, 77.1025)
    assert "fastest" in options
    assert "shortest" in options
    assert "traffic_avoidance" in options
    assert "fuel_efficient" in options

    assert options["fastest"]["distance"] > 0
    assert options["fastest"]["duration"] > 0


def test_geofence_detection():
    """Verify geofence arrival detection math."""
    # Near coordinates (< 0.5 km)
    arrived = check_geofence_arrival(28.6139, 77.2090, 28.6140, 77.2091, radius_km=0.5)
    assert arrived is True

    # Far coordinates (> 5 km)
    arrived_far = check_geofence_arrival(28.6139, 77.2090, 28.7041, 77.1025, radius_km=0.5)
    assert arrived_far is False


def test_root_endpoint():
    """Verify backend API root health endpoint."""
    res = client.get("/")
    assert res.status_code == 200
    assert res.json() == {"message": "FleetFlow API running"}
