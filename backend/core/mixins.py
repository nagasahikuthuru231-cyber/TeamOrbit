from rest_framework.permissions import IsAuthenticated

from .models import AuditLog
from .permissions import TenantRolePermission
from .tasks import emit_event


class TenantMixin:
    """Scopes every queryset to the request's workspace and enforces roles."""
    permission_classes = [IsAuthenticated, TenantRolePermission]

    def get_queryset(self):
        return super().get_queryset().filter(workspace=self.request.membership.workspace)


class AuditMixin:
    """Writes an AuditLog row and emits a webhook event on every mutation."""

    def actor_kwargs(self):
        return {}

    def _audit(self, action, obj, changes=None):
        name = type(obj).__name__
        AuditLog.objects.create(
            workspace=obj.workspace, actor=self.request.user, action=action,
            entity=name, entity_id=obj.pk, changes=changes or {},
        )
        emit_event.delay(obj.workspace_id, f"{name.lower()}.{action}", {"id": obj.pk})

    def perform_create(self, serializer):
        obj = serializer.save(workspace=self.request.membership.workspace, **self.actor_kwargs())
        self._audit("create", obj)

    def perform_update(self, serializer):
        obj = serializer.save()
        self._audit("update", obj, {k: str(v) for k, v in serializer.validated_data.items()})

    def perform_destroy(self, instance):
        self._audit("delete", instance)
        instance.delete()
