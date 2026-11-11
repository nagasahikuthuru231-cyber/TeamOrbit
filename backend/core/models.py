from django.conf import settings
from django.db import models


def default_columns():
    return ["To Do", "In Progress", "Done"]


class Workspace(models.Model):
    class Plan(models.TextChoices):
        FREE = "free"
        PRO = "pro"

    name = models.CharField(max_length=120)
    slug = models.SlugField(unique=True)
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.FREE)
    stripe_customer_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Membership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner"
        ADMIN = "admin"
        MEMBER = "member"
        VIEWER = "viewer"

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)

    class Meta:
        unique_together = ("workspace", "user")


class TenantModel(models.Model):
    """Every tenant-owned row carries workspace_id; every query filters on it."""
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="+", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True


class Project(TenantModel):
    name = models.CharField(max_length=120)
    key = models.CharField(max_length=10)
    description = models.TextField(blank=True)

    class Meta:
        unique_together = ("workspace", "key")


class Board(TenantModel):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="boards")
    name = models.CharField(max_length=120)
    columns = models.JSONField(default=default_columns)  # custom workflow: ordered statuses


class Sprint(TenantModel):
    class State(models.TextChoices):
        PLANNED = "planned"
        ACTIVE = "active"
        CLOSED = "closed"

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="sprints")
    name = models.CharField(max_length=120)
    state = models.CharField(max_length=10, choices=State.choices, default=State.PLANNED)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)


class Issue(TenantModel):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="issues")
    board = models.ForeignKey(Board, null=True, blank=True, on_delete=models.SET_NULL, related_name="issues")
    sprint = models.ForeignKey(Sprint, null=True, blank=True, on_delete=models.SET_NULL, related_name="issues")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=50, default="To Do")
    position = models.FloatField(default=0)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="assigned_issues")
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="reported_issues")

    class Meta:
        ordering = ["position", "id"]


class Comment(TenantModel):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    body = models.TextField()


class Attachment(TenantModel):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="attachments/%Y/%m/")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)


class AuditLog(TenantModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=20)
    entity = models.CharField(max_length=40)
    entity_id = models.PositiveBigIntegerField()
    changes = models.JSONField(default=dict)

    class Meta:
        ordering = ["-created_at"]


class WebhookEndpoint(TenantModel):
    url = models.URLField()
    secret = models.CharField(max_length=64)
    events = models.JSONField(default=list)  # e.g. ["issue.create", "*"]
    active = models.BooleanField(default=True)


class Invitation(TenantModel):
    email = models.EmailField()
    role = models.CharField(max_length=10, choices=Membership.Role.choices, default=Membership.Role.MEMBER)
    token_hash = models.CharField(max_length=64, unique=True)  # sha256 of the emailed token; raw token is never stored
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
