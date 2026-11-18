from django.db import models
from rest_framework import serializers

from .models import (Attachment, AuditLog, Comment, Invitation, Issue, Membership,
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


class MemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    name = serializers.CharField(source="user.first_name", read_only=True)

    class Meta:
        model = Membership
        fields = ("user_id", "email", "name", "role")


class ProjectSerializer(TenantSerializer):
    class Meta:
        model = Project
        fields = "__all__"
        read_only_fields = ("workspace", "created_at")

    def validate_columns(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError("Provide at least one column.")
        if len(value) > 10:
            raise serializers.ValidationError("A project can have at most 10 columns.")
        cleaned = [str(c).strip() for c in value]
        if any(not c for c in cleaned) or len(set(cleaned)) != len(cleaned):
            raise serializers.ValidationError("Column names must be unique and non-empty.")
        return cleaned


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
        project = attrs.get("project", getattr(self.instance, "project", None))
        if self.instance is None and "status" not in attrs and project is not None:
            attrs["status"] = project.columns[0]
        status = attrs.get("status", getattr(self.instance, "status", None))
        if project is not None and status not in project.columns:
            raise serializers.ValidationError({"status": f"'{status}' is not a column on this project."})

        assignee = attrs.get("assignee")
        if assignee is not None:
            workspace_id = self.context["request"].membership.workspace_id
            if not Membership.objects.filter(workspace_id=workspace_id, user=assignee).exists():
                raise serializers.ValidationError({"assignee": "This user is not a member of this workspace."})
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
