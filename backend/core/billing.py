import stripe
from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Invitation, Membership, Project, Workspace

PLAN_LIMITS = {
    "free": {"projects": 2, "members": 3},
    "pro": {"projects": 100, "members": 50},
}


class PlanLimitExceeded(APIException):
    status_code = 402
    default_detail = "Plan limit reached. Upgrade your subscription to continue."
    default_code = "plan_limit_exceeded"


def enforce_project_limit(workspace):
    used = Project.objects.filter(workspace=workspace).count()
    if used >= PLAN_LIMITS[workspace.plan]["projects"]:
        raise PlanLimitExceeded()


def enforce_member_limit(workspace, include_pending=False):
    """Pending invites count against the seat limit when creating an invite,
    so an admin cannot invite past the plan cap and then have acceptances fail."""
    used = Membership.objects.filter(workspace=workspace).count()
    if include_pending:
        used += Invitation.objects.filter(
            workspace=workspace, accepted_at__isnull=True, expires_at__gt=timezone.now(),
        ).count()
    if used >= PLAN_LIMITS[workspace.plan]["members"]:
        raise PlanLimitExceeded("Member limit reached for this plan. Upgrade to add more people.")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checkout(request):
    membership = (Membership.objects.select_related("workspace")
                  .filter(workspace__slug=request.headers.get("X-Workspace"),
                          user=request.user, role="owner").first())
    if membership is None:
        return Response({"detail": "Only workspace owners can manage billing."}, status=403)
    stripe.api_key = settings.STRIPE_SECRET_KEY
    workspace = membership.workspace
    if not workspace.stripe_customer_id:
        customer = stripe.Customer.create(name=workspace.name, metadata={"workspace_id": workspace.id})
        workspace.stripe_customer_id = customer.id
        workspace.save(update_fields=["stripe_customer_id"])
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=workspace.stripe_customer_id,
        line_items=[{"price": settings.STRIPE_PRICE_PRO, "quantity": 1}],
        success_url=f"{settings.FRONTEND_URL}/?billing=success",
        cancel_url=f"{settings.FRONTEND_URL}/?billing=cancel",
    )
    return Response({"url": session.url})


@csrf_exempt
@require_POST
def stripe_webhook(request):
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        event = stripe.Webhook.construct_event(
            request.body, request.META.get("HTTP_STRIPE_SIGNATURE", ""),
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except Exception:
        return HttpResponse(status=400)
    if event["type"] in ("customer.subscription.updated", "customer.subscription.deleted"):
        sub = event["data"]["object"]
        active = event["type"] != "customer.subscription.deleted" and sub["status"] in ("active", "trialing")
        Workspace.objects.filter(stripe_customer_id=sub["customer"]).update(plan="pro" if active else "free")
    return HttpResponse(status=200)
