import hashlib
import hmac
import json
from collections import Counter

import requests
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from .models import AuditLog, Invitation, Issue, Sprint, WebhookEndpoint


@shared_task(autoretry_for=(requests.RequestException,), retry_backoff=True, max_retries=5)
def deliver_webhook(endpoint_id, event, data):
    endpoint = WebhookEndpoint.objects.get(pk=endpoint_id)
    body = json.dumps({"event": event, "data": data}).encode()
    signature = hmac.new(endpoint.secret.encode(), body, hashlib.sha256).hexdigest()
    response = requests.post(
        endpoint.url, data=body, timeout=5,
        headers={"Content-Type": "application/json", "X-Signature-SHA256": signature},
    )
    response.raise_for_status()


@shared_task
def emit_event(workspace_id, event, data):
    for endpoint in WebhookEndpoint.objects.filter(workspace_id=workspace_id, active=True):
        if "*" in endpoint.events or event in endpoint.events:
            deliver_webhook.delay(endpoint.id, event, data)


@shared_task
def notify_assignee(issue_id):
    issue = Issue.objects.select_related("assignee", "project").get(pk=issue_id)
    if issue.assignee and issue.assignee.email:
        send_mail(
            f"[{issue.project.key}] Assigned: {issue.title}",
            f"'{issue.title}' is now assigned to you (status: {issue.status}).",
            None,
            [issue.assignee.email],
        )


@shared_task
def send_invite_email(invitation_id, token):
    invite = Invitation.objects.select_related("workspace").get(pk=invitation_id)
    link = f"{settings.FRONTEND_URL}/?invite={token}"
    send_mail(
        f"You're invited to {invite.workspace.name}",
        f"You've been invited to join {invite.workspace.name} as {invite.role}.\n\n"
        f"Accept: {link}\n\nThis link expires on {invite.expires_at:%Y-%m-%d}.",
        None,
        [invite.email],
    )


@shared_task
def generate_weekly_reports():
    for sprint in Sprint.objects.filter(state=Sprint.State.ACTIVE):
        counts = dict(Counter(sprint.issues.values_list("status", flat=True)))
        AuditLog.objects.create(workspace=sprint.workspace, action="report",
                                entity="Sprint", entity_id=sprint.id, changes=counts)
