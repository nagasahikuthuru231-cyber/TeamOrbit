from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import accounts, billing, views

router = DefaultRouter()
router.register("projects", views.ProjectViewSet)
router.register("boards", views.BoardViewSet)
router.register("sprints", views.SprintViewSet)
router.register("issues", views.IssueViewSet)
router.register("comments", views.CommentViewSet)
router.register("attachments", views.AttachmentViewSet)
router.register("invitations", views.InvitationViewSet)
router.register("webhooks", views.WebhookViewSet)
router.register("audit-logs", views.AuditLogViewSet)

urlpatterns = [
    # explicit paths first so the router's detail routes don't capture them
    path("auth/signup/", accounts.signup),
    path("auth/login/", accounts.login),
    path("auth/logout/", accounts.logout),
    path("auth/me/", accounts.me),
    path("workspaces/", accounts.create_workspace),
    path("invitations/accept/", accounts.accept_invitation),
    path("billing/checkout/", billing.checkout),
    path("", include(router.urls)),
]
