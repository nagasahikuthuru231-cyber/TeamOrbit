import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Board, Comment, Invitation, Issue, Membership, Project, Workspace
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
        board = Board.objects.create(workspace=self.w1, project=self.project, name="B")
        a, b, c = [Issue.objects.create(workspace=self.w1, project=self.project, board=board,
                                        title=t, status="To Do", position=i)
                   for i, t in enumerate("abc", 1)]
        r = self.client.post(f"/api/issues/{c.id}/move/", {"status": "To Do", "index": 0},
                             format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 200)
        order = [i.title for i in Issue.objects.filter(board=board).order_by("position")]
        self.assertEqual(order, ["c", "a", "b"])

    def test_move_rejects_unknown_status(self):
        board = Board.objects.create(workspace=self.w1, project=self.project, name="B")
        issue = Issue.objects.create(workspace=self.w1, project=self.project, board=board, title="x")
        r = self.client.post(f"/api/issues/{issue.id}/move/", {"status": "Nope", "index": 0},
                             format="json", HTTP_X_WORKSPACE="one")
        self.assertEqual(r.status_code, 400)
