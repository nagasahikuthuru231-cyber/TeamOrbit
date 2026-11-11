from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Membership

RANK = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}


class TenantRolePermission(BasePermission):
    """Resolves the workspace from X-Workspace and enforces a per-view role floor.

    Views set read_min_role (default viewer) and write_min_role (default member).
    """

    def has_permission(self, request, view):
        slug = request.headers.get("X-Workspace")
        membership = (Membership.objects.select_related("workspace")
                      .filter(workspace__slug=slug, user=request.user).first())
        if membership is None:
            raise PermissionDenied("Not a member of this workspace")
        request.membership = membership
        if request.method in SAFE_METHODS:
            needed = getattr(view, "read_min_role", "viewer")
        else:
            needed = getattr(view, "write_min_role", "member")
        if RANK[membership.role] < RANK[needed]:
            raise PermissionDenied("Insufficient role for this action")
        return True


class IsAuthorOrAdmin(BasePermission):
    """Edit/delete allowed for the original author (or uploader), or any admin/owner."""

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if RANK[request.membership.role] >= RANK["admin"]:
            return True
        owner_id = getattr(obj, "author_id", None) or getattr(obj, "uploaded_by_id", None)
        return owner_id == request.user.id
