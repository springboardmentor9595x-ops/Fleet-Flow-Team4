import os
from celery import Celery
from celery.schedules import crontab
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "fleetflow",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.maintenance", "app.tasks.shipments"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    # Maintenance: check every hour (5-day / 1-day are one-shot; overdue dailies rate-limited internally)
    "check-maintenance-alerts-every-hour": {
        "task": "app.tasks.maintenance.check_maintenance_alerts",
        "schedule": crontab(minute=0),  # top of every hour
    },
    # Delayed shipments: check every 10 minutes
    "check-delayed-shipments-every-10-min": {
        "task": "app.tasks.shipments.check_delayed_shipments",
        "schedule": crontab(minute="*/10"),
    },
}

