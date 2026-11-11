from django.contrib import admin
from django.urls import include, path

from core.billing import stripe_webhook

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("billing/webhook/", stripe_webhook),
]
