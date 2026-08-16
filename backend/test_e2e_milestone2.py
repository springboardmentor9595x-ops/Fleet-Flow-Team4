import os
import uuid
from fastapi.testclient import TestClient

os.chdir(r'C:\Users\S R\OneDrive\Desktop\fleet_logistic\backend')
from app.main import app
from app.database import SessionLocal
from app.models.user import User, RoleEnum
from app.models.driver import Driver
from app.core.security import hash_password

client = TestClient(app)


def test_complete_milestone2_e2e_workflow():
    db = SessionLocal()
    try:
        # Create test admin user in DB with is_verified=True
        admin_email = os.getenv("ADMIN_EMAIL", f"admin_{uuid.uuid4().hex[:6]}@example.com")
        admin = User(
            email=admin_email,
            password=hash_password("admin123"),
            full_name="E2E Admin",
            role=RoleEnum.Admin,
            is_verified=True if hasattr(User, "is_verified") else None,
        )
        if hasattr(admin, "is_verified"):
            admin.is_verified = True
        db.add(admin)
        db.commit()
        db.refresh(admin)

        # Create driver entry linked to admin user
        driver_entry = Driver(
            driver_id=uuid.uuid4(),
            user_id=admin.user_id,
        )
        db.add(driver_entry)
        db.commit()
        db.refresh(driver_entry)

        # Login to get JWT
        login_res = client.post("/auth/login", data={"username": admin_email, "password": "admin123"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create Vehicle
        reg_num = f"V-{uuid.uuid4().hex[:4].upper()}"
        veh_res = client.post(
            "/vehicles/",
            headers=headers,
            json={
                "registration_number": reg_num,
                "vehicle_type": "Truck",
                "brand": "Volvo",
                "model": "FH16",
                "manufacture_year": 2023,
                "fuel_type": "Diesel",
                "capacity": 25000,
                "status": "Available",
            },
        )
        assert veh_res.status_code == 201, f"Vehicle creation failed: {veh_res.text}"
        vehicle_id = veh_res.json()["vehicle_id"]

        # 2. Create Shipment (Milestone 2 - Section A)
        trk_num = f"TRK-{uuid.uuid4().hex[:6].upper()}"
        ship_res = client.post(
            "/shipments/",
            headers=headers,
            json={
                "tracking_number": trk_num,
                "source": "New Delhi",
                "destination": "Mumbai",
                "customer_name": "Acme Logistics Inc",
                "shipment_weight": 12500.0,
                "status": "Created",
            },
        )
        assert ship_res.status_code == 201, f"Shipment creation failed: {ship_res.text}"
        shipment_id = ship_res.json()["shipment_id"]

        # 3. Check Shipment Alerts API (Milestone 2 - Section A8)
        alerts_res = client.get("/shipments/alerts", headers=headers)
        assert alerts_res.status_code == 200, f"Alerts request failed: {alerts_res.text}"

        # 4. Fetch Traffic-Aware Route Options (Milestone 2 - Section E)
        route_res = client.post(
            "/trips/route-options",
            headers=headers,
            json={
                "start_lat": 28.6139,
                "start_lng": 77.2090,
                "end_lat": 19.0760,
                "end_lng": 72.8777,
            },
        )
        assert route_res.status_code == 200, f"Route options failed: {route_res.text}"
        route_options = route_res.json()
        assert "fastest" in route_options
        assert "fuel_efficient" in route_options

        # 5. Schedule Trip (Milestone 2 - Section D2)
        driver_id_str = str(driver_entry.driver_id)
        trip_res = client.post(
            "/trips/",
            headers=headers,
            json={
                "vehicle_id": vehicle_id,
                "driver_id": driver_id_str,
                "shipment_id": shipment_id,
                "start_lat": 28.6139,
                "start_lng": 77.2090,
                "end_lat": 19.0760,
                "end_lng": 72.8777,
                "route_type": "fastest",
            },
        )
        assert trip_res.status_code == 201, f"Trip creation failed: {trip_res.text}"
        trip_id = trip_res.json()["trip_id"]

        # 6. Start Trip (Milestone 2 - Section D4)
        start_res = client.post(f"/trips/{trip_id}/start", headers=headers)
        assert start_res.status_code == 200, f"Start trip failed: {start_res.text}"
        assert start_res.json()["status"] == "Active"

        # 7. Recalculate Route mid-trip (Milestone 2 - Section D6)
        recalc_res = client.post(
            f"/trips/{trip_id}/recalculate",
            headers=headers,
            json={
                "current_lat": 24.5854,
                "current_lng": 73.7125,
                "route_type": "fuel_efficient",
            },
        )
        assert recalc_res.status_code == 200, f"Recalculate route failed: {recalc_res.text}"
        assert recalc_res.json()["route_type"] == "fuel_efficient"

        # 8. Check Shipment History Timeline (Milestone 2 - Section A6)
        hist_res = client.get(f"/shipments/{shipment_id}/history", headers=headers)
        assert hist_res.status_code == 200, f"History timeline failed: {hist_res.text}"
        assert len(hist_res.json()) >= 2

        # 9. Complete Trip (Milestone 2 - Section D5)
        comp_res = client.post(f"/trips/{trip_id}/complete", headers=headers)
        assert comp_res.status_code == 200, f"Complete trip failed: {comp_res.text}"
        assert comp_res.json()["status"] == "Completed"

        # 10. Verify Linked Shipment Status is Delivered
        final_ship_res = client.get(f"/shipments/{shipment_id}", headers=headers)
        assert final_ship_res.status_code == 200
        assert final_ship_res.json()["status"] == "Delivered"

        print("SUCCESS: Complete Milestone 2 E2E workflow test passed flawlessly!")
    finally:
        db.close()


if __name__ == "__main__":
    test_complete_milestone2_e2e_workflow()
