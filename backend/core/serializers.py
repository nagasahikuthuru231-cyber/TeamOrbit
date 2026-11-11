from django.db import models
from rest_framework import serializers

from .models import (Attachment, AuditLog, Board, Comment, Invitation, Issue, Membership,
                     Project, Sprint, WebhookEndpoint)
from .validators import validate_attachment


def _forbid_reparent(instance, attrs, field):
    if instance is not None and field in attrs and attrs[field] != getattr(instance, field):
        raise serializers.ValidationError({field: "This cannot be changed after creation."})


class TenantSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        workspace_id = self.context["request"].membership.workspace_id
        for value in attrs.values():
            if isinstance(value, models.Model) and getattr(value, "workspace_id", workspace_id) != workspace_id:
                raise serializers.ValidationError("Referenced object belongs to another workspace.")
        return attrs


class ProjectSerializer(TenantSerializer):
    class Meta:
        model = Project
        fields = "__all__"
        read_only_fields = ("workspace", "created_at")


class BoardSerializer(TenantSerializer):
    class Meta:
        model = Board
        fields = "__all__"
        read_only_fields = ("workspace", "created_at")


class SprintSerializer(TenantSerializer):
    class Meta:
        model = Sprint
        fields = "__all__"
        read_only_fields = ("workspace", "created_at")


class IssueSerializer(TenantSerializer):
    class Meta:
        model = Issue
        fields = "__all__"
        # position is server-managed; move it with POST /issues/{id}/move/
        read_only_fields = ("workspace", "created_at", "reporter", "position")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        board = attrs.get("board", getattr(self.instance, "board", None))
        if board is not None:
            if self.instance is None and "status" not in attrs:
                attrs["status"] = board.columns[0]
            status = attrs.get("status", getattr(self.instance, "status", None))
            if status not in board.columns:
                raise serializers.ValidationError({"status": f"'{status}' is not a column on this board."})
        return attrs


class CommentSerializer(TenantSerializer):
    class Meta:
        model = Comment
        fields = "__all__"
        read_only_fields = ("workspace", "created_at", "author")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        _forbid_reparent(self.instance, attrs, "issue")
        return attrs


class AttachmentSerializer(TenantSerializer):
    class Meta:
        model = Attachment
        fields = "__all__"
        read_only_fields = ("workspace", "created_at", "uploaded_by")

    def validate_file(self, value):
        validate_attachment(value)
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        _forbid_reparent(self.instance, attrs, "issue")
        return attrs


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = "__all__"


class WebhookEndpointSerializer(TenantSerializer):
    class Meta:
        model = WebhookEndpoint
        fields = "__all__"
        read_only_fields = ("workspace", "created_at")
        extra_kwargs = {"secret": {"write_only": True}}


class InvitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invitation
        fields = ("id", "email", "role", "expires_at", "accepted_at", "created_at")
        read_only_fields = ("id", "expires_at", "accepted_at", "created_at")

    def validate_role(self, value):
        if value == Membership.Role.OWNER:
            raise serializers.ValidationError("Owners cannot be invited; transfer ownership instead.")
        return value

    def validate_email(self, value):
        return value.strip().lower()
