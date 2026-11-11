import os
from datetime import timedelta

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
app.conf.beat_schedule = {
    "weekly-sprint-reports": {
        "task": "core.tasks.generate_weekly_reports",
        "schedule": timedelta(days=7),
    },
}
