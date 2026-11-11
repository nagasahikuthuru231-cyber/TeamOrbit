import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .billing import enforce_member_limit, enforce_project_limit
from .mixins import AuditMixin, TenantMixin
from .models import (Attachment, AuditLog, Board, Comment, Invitation, Issue,
                     Project, Sprint, WebhookEndpoint)
from .permissions import IsAuthorOrAdmin
from .serializers import (AttachmentSerializer, AuditLogSerializer, BoardSerializer,
                          CommentSerializer, InvitationSerializer, IssueSerializer,
                          ProjectSerializer, SprintSerializer, WebhookEndpointSerializer)
from .services import hash_token, place_issue
from .tasks import notify_assignee, send_invite_email


class ProjectViewSet(TenantMixin, AuditMixin, viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    write_min_role = "admin"

    def perform_create(self, serializer):
        enforce_project_limit(self.request.membership.workspace)
        super().perform_create(serializer)


class BoardViewSet(TenantMixin, AuditMixin, viewsets.ModelViewSet):
    queryset = Board.objects.all()
    serializer_class = BoardSerializer
    write_min_role = "admin"


class SprintViewSet(TenantMixin, AuditMixin, viewsets.ModelViewSet):
    queryset = Sprint.objects.all()
    serializer_class = SprintSerializer
    write_min_role = "admin"


class IssueViewSet(TenantMixin, AuditMixin, viewsets.ModelViewSet):
    queryset = Issue.objects.all()
    serializer_class = IssueSerializer

    def actor_kwargs(self):
        return {"reporter": self.request.user}

    def get_queryset(self):
        qs = super().get_queryset()
        board = self.request.query_params.get("board")
        return qs.filter(board_id=board) if board else qs

    def perform_create(self, serializer):
        super().perform_create(serializer)
        issue = serializer.instance
        count = (Issue.objects.filter(project_id=issue.project_id, board_id=issue.board_id,
                                      status=issue.status)
                 .exclude(pk=issue.pk).count())
        place_issue(issue, issue.status, count)  # new issues go to the bottom of their column

    def perform_update(self, serializer):
        old_assignee = serializer.instance.assignee_id
        super().perform_update(serializer)
        issue = serializer.instance
        if issue.assignee_id and issue.assignee_id != old_assignee:
            notify_assignee.delay(issue.id)

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        """Drag-and-drop: {status, index}. The server recalculates positions in the column."""
        issue = self.get_object()
        status = request.data.get("status", issue.status)
        try:
            index = int(request.data.get("index", 0))
        except (TypeError, ValueError):
            return Response({"detail": "index must be an integer."}, status=400)
        if issue.board and status not in issue.board.columns:
            return Response({"detail": "Invalid status for this board."}, status=400)
        place_issue(issue, status, index)
        self._audit("move", issue, {"status": status, "index": index})
        return Response(IssueSerializer(issue).data)


class CommentViewSet(TenantMixin, AuditMixin, viewsets.ModelViewSet):
    queryset = Comment.objects.all()
    serializer_class = CommentSerializer
    permission_classes = TenantMixin.permission_classes + [IsAuthorOrAdmin]

    def actor_kwargs(self):
        return {"author": self.request.user}

    def get_queryset(self):
        qs = super().get_queryset()
        issue = self.request.query_params.get("issue")
        return qs.filter(issue_id=issue) if issue else qs


class AttachmentViewSet(TenantMixin, AuditMixin, viewsets.ModelViewSet):
    queryset = Attachment.objects.all()
    serializer_class = AttachmentSerializer
    permission_classes = TenantMixin.permission_classes + [IsAuthorOrAdmin]

    def actor_kwargs(self):
        return {"uploaded_by": self.request.user}


class InvitationViewSet(TenantMixin, mixins.ListModelMixin, mixins.CreateModelMixin,
                        mixins.DestroyModelMixin, viewsets.GenericViewSet):
    queryset = Invitation.objects.all()
    serializer_class = InvitationSerializer
    read_min_role = "admin"
    write_min_role = "admin"

    def perform_create(self, serializer):
        workspace = self.request.membership.workspace
        enforce_member_limit(workspace, include_pending=True)
        token = secrets.token_urlsafe(32)
        invite = serializer.save(
            workspace=workspace,
            invited_by=self.request.user,
            token_hash=hash_token(token),
            expires_at=timezone.now() + timedelta(days=settings.INVITE_TTL_DAYS),
        )
        AuditLog.objects.create(workspace=workspace, actor=self.request.user, action="create",
                                entity="Invitation", entity_id=invite.pk,
                                changes={"email": invite.email, "role": invite.role})
        send_invite_email.delay(invite.id, token)


class WebhookViewSet(TenantMixin, AuditMixin, viewsets.ModelViewSet):
    queryset = WebhookEndpoint.objects.all()
    serializer_class = WebhookEndpointSerializer
    read_min_role = "admin"
    write_min_role = "admin"


class AuditLogViewSet(TenantMixin, viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    read_min_role = "admin"
