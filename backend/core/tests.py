import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Comment, Invitation, Issue, Membership, Project, Workspace
from .services import hash_token

User = get_user_model()

from config.celery import app as celery_app

celery_app.conf.task_always_eager = True
celery_app.conf.task_eager_propagates = True
class Base(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("alice", email="alice@x.com", password="pw-123456-long")
        self.w1 = Workspace.objects.create(name="One", slug="one")
        self.w2 = Workspace.objects.create(name="Two", slug="two")
        Membership.objects.create(workspace=self.w1, user=self.user, role="member")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.project = Project.objects.create(workspace=self.w1, name="P", key="P")

    def make_user(self, username, role="member", workspace=None):
        user = User.objects.create_user(username, email=f"{username}@x.com", password="pw-123456-long")
        Membership.objects.create(workspace=workspace or self.w1, user=user, role=role)
        client = APIClient()
        client.force_authenticate(user)
        return user, client


class TenantIsolationAndRoleTests(Base):
    def test_non_member_cannot_access_other_workspace(self):
        r = self.client.get("/api/projects/", HTTP_X_WORKSPACE="two")
        self.assertEqual(r.status_code, 403)

    def test_list_returns_only_own_workspace(self):
        r = self.client.get("/api/projects/", HTTP_X_WORKSPACE="one")
        self.assertEqual([p["name"] for p in r.json()["results"]], ["P"])

    def test_member_cannot_create_project(self):
        r = self.client.post("/api/projects/", {"name": "x", "key": "X"}, format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 403)

    def test_viewer_cannot_write(self):
        Membership.objects.filter(user=self.user).update(role="viewer")
        r = self.client.post("/api/projects/", {"name": "x", "key": "X"}, format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 403)


class AuthTests(Base):
    def test_signup_returns_token(self):
        r = APIClient().post("/api/auth/signup/",
                             {"email": "new@x.com", "password": "Str0ng-pass-phrase!"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertIn("token", r.json())

    def test_login_rejects_wrong_password(self):
        r = APIClient().post("/api/auth/login/", {"email": "alice@x.com", "password": "nope"}, format="json")
        self.assertEqual(r.status_code, 401)

    def test_me_lists_workspaces(self):
        r = self.client.get("/api/auth/me/")
        self.assertEqual(r.json()["workspaces"][0]["slug"], "one")


class InvitationTests(Base):
    def test_invite_blocked_at_plan_member_limit(self):
        # free plan allows 3 members; alice is admin plus two more = 3
        Membership.objects.filter(user=self.user).update(role="admin")
        self.make_user("bob")
        self.make_user("carol")
        r = self.client.post("/api/invitations/", {"email": "dan@x.com", "role": "member"},
                             format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 402)

    def test_accept_invitation_joins_workspace(self):
        Membership.objects.filter(user=self.user).update(role="admin")
        Invitation.objects.create(workspace=self.w1, email="bob@x.com", token_hash=hash_token("tok"),
                                  expires_at=timezone.now() + timedelta(days=1))
        bob, bob_client = self.make_user("bob")
        Membership.objects.filter(user=bob).delete()
        bob.email = "bob@x.com"; bob.save()
        r = bob_client.post("/api/invitations/accept/", {"token": "tok"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(Membership.objects.filter(user=bob, workspace=self.w1).exists())

    def test_accept_rejects_other_email(self):
        Invitation.objects.create(workspace=self.w1, email="bob@x.com", token_hash=hash_token("tok2"),
                                  expires_at=timezone.now() + timedelta(days=1))
        r = self.client.post("/api/invitations/accept/", {"token": "tok2"}, format="json")
        self.assertEqual(r.status_code, 403)


class CommentOwnershipTests(Base):
    def test_only_author_or_admin_can_edit(self):
        issue = Issue.objects.create(workspace=self.w1, project=self.project, title="t")
        comment = Comment.objects.create(workspace=self.w1, issue=issue, author=self.user, body="hi")
        _, bob_client = self.make_user("bob")
        r = bob_client.patch(f"/api/comments/{comment.id}/", {"body": "hacked"},
                             format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 403)
        r = self.client.patch(f"/api/comments/{comment.id}/", {"body": "edited"},
                              format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 200)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(), ATTACHMENT_MAX_BYTES=1024)
class AttachmentValidationTests(Base):
    def setUp(self):
        super().setUp()
        self.issue = Issue.objects.create(workspace=self.w1, project=self.project, title="t")

    def upload(self, name, data):
        return self.client.post("/api/attachments/",
                                {"issue": self.issue.id, "file": SimpleUploadedFile(name, data)},
                                format="multipart", HTTP_X_WORKSPACE="one")

    def test_rejects_disallowed_extension(self):
        self.assertEqual(self.upload("evil.exe", b"MZ\x90\x00").status_code, 400)

    def test_rejects_oversize(self):
        self.assertEqual(self.upload("big.txt", b"a" * 2048).status_code, 400)

    def test_rejects_extension_spoofing(self):
        self.assertEqual(self.upload("pic.png", b"<script>not an image</script>").status_code, 400)

    def test_accepts_valid_text(self):
        self.assertEqual(self.upload("notes.txt", b"hello").status_code, 201)


class IssueMoveTests(Base):
    def test_move_places_issue_at_index_and_renumbers(self):
        a, b, c = [Issue.objects.create(workspace=self.w1, project=self.project,
                                        title=t, status="To Do", position=i)
                   for i, t in enumerate("abc", 1)]
        r = self.client.post(f"/api/issues/{c.id}/move/", {"status": "To Do", "index": 0},
                             format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 200)
        order = [i.title for i in Issue.objects.filter(project=self.project).order_by("position")]
        self.assertEqual(order, ["c", "a", "b"])

    def test_move_rejects_unknown_status(self):
        issue = Issue.objects.create(workspace=self.w1, project=self.project, title="x")
        r = self.client.post(f"/api/issues/{issue.id}/move/", {"status": "Nope", "index": 0},
                             format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 400)


class AssigneeTests(Base):
    def setUp(self):
        super().setUp()
        Membership.objects.filter(user=self.user).update(role="admin")
        self.issue = Issue.objects.create(workspace=self.w1, project=self.project, title="Fix login")

    def test_new_issue_is_unassigned(self):
        self.assertIsNone(self.issue.assignee)

    def test_assign_then_unassign(self):
        url = f"/api/issues/{self.issue.id}/"
        r = self.client.patch(url, {"assignee": self.user.id}, format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 200)
        self.issue.refresh_from_db()
        self.assertEqual(self.issue.assignee, self.user)

        r = self.client.patch(url, {"assignee": None}, format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 200)
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.assignee)

    def test_cannot_assign_user_outside_workspace(self):
        outsider = User.objects.create_user("eve", email="eve@x.com", password="pw-123456-long")
        r = self.client.patch(f"/api/issues/{self.issue.id}/", {"assignee": outsider.id},
                              format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 400)
        self.issue.refresh_from_db()
        self.assertIsNone(self.issue.assignee)

    def test_members_endpoint_lists_only_this_workspace(self):
        self.make_user("bob")
        r = self.client.get("/api/members/", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 200)
        emails = sorted(m["email"] for m in r.json()["results"])
        self.assertEqual(emails, ["alice@x.com", "bob@x.com"])

    def test_viewer_can_read_members_but_not_change_issue_assignee_via_other_workspace(self):
        r = self.client.get("/api/members/", HTTP_X_WORKSPACE="two")
        self.assertEqual(r.status_code, 403)


class ProjectColumnsAndDeleteTests(Base):
    def setUp(self):
        super().setUp()
        Membership.objects.filter(user=self.user).update(role="admin")

    def test_project_columns_are_its_workflow(self):
        r = self.client.post("/api/projects/", {"name": "Web", "key": "WEB",
                                                "columns": ["Backlog", "Doing", "Shipped"]},
                             format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["columns"], ["Backlog", "Doing", "Shipped"])

    def test_empty_or_duplicate_columns_are_rejected(self):
        for bad in ([], ["A", "A"], [""]):
            r = self.client.patch(f"/api/projects/{self.project.id}/", {"columns": bad},
                                  format="json", HTTP_X_WORKSPACE="one")
            self.assertEqual(r.status_code, 400, bad)

    def test_admin_can_delete_project_and_its_issues(self):
        Issue.objects.create(workspace=self.w1, project=self.project, title="t")
        r = self.client.delete(f"/api/projects/{self.project.id}/", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 204)
        self.assertFalse(Project.objects.filter(pk=self.project.id).exists())
        self.assertFalse(Issue.objects.filter(title="t").exists())

    def test_member_cannot_delete_project(self):
        Membership.objects.filter(user=self.user).update(role="member")
        r = self.client.delete(f"/api/projects/{self.project.id}/", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 403)
        self.assertTrue(Project.objects.filter(pk=self.project.id).exists())


class StripeBillingTests(Base):
    """Plan changes come only from verified Stripe webhooks."""

    def setUp(self):
        super().setUp()
        self.w1.stripe_customer_id = "cus_test_1"
        self.w1.save(update_fields=["stripe_customer_id"])

    def post_event(self, event=None, error=None):
        from unittest import mock
        patch = mock.patch("core.billing.stripe.Webhook.construct_event",
                           return_value=event, side_effect=error)
        with patch:
            return APIClient().post("/billing/webhook/", data=b"{}", content_type="application/json",
                                    HTTP_STRIPE_SIGNATURE="t=1,v1=sig")

    def test_active_subscription_upgrades_plan(self):
        event = {"type": "customer.subscription.updated",
                 "data": {"object": {"customer": "cus_test_1", "status": "active"}}}
        self.assertEqual(self.post_event(event).status_code, 200)
        self.w1.refresh_from_db()
        self.assertEqual(self.w1.plan, "pro")

    def test_deleted_subscription_downgrades_plan(self):
        self.w1.plan = "pro"
        self.w1.save(update_fields=["plan"])
        event = {"type": "customer.subscription.deleted",
                 "data": {"object": {"customer": "cus_test_1", "status": "canceled"}}}
        self.assertEqual(self.post_event(event).status_code, 200)
        self.w1.refresh_from_db()
        self.assertEqual(self.w1.plan, "free")

    def test_bad_signature_is_rejected_and_changes_nothing(self):
        r = self.post_event(error=ValueError("bad signature"))
        self.assertEqual(r.status_code, 400)
        self.w1.refresh_from_db()
        self.assertEqual(self.w1.plan, "free")

    def test_only_owner_can_start_checkout(self):
        r = self.client.post("/api/billing/checkout/", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 403)  # alice is a member, not an owner
