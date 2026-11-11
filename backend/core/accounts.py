from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .billing import enforce_member_limit
from .models import Invitation, Membership, Workspace
from .services import hash_token


def _token_response(user, code=200):
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key}, status=code)


@api_view(["POST"])
@permission_classes([AllowAny])
def signup(request):
    email = (request.data.get("email") or "").strip().lower()
    password = request.data.get("password") or ""
    if not email or not password:
        return Response({"detail": "Email and password are required."}, status=400)
    User = get_user_model()
    if User.objects.filter(username=email).exists():
        return Response({"detail": "An account with this email already exists."}, status=400)
    try:
        validate_password(password)
    except DjangoValidationError as e:
        return Response({"detail": " ".join(e.messages)}, status=400)
    user = User.objects.create_user(
        username=email, email=email, password=password,
        first_name=(request.data.get("name") or "")[:150],
    )
    return _token_response(user, 201)


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    email = (request.data.get("email") or "").strip().lower()
    user = authenticate(request, username=email, password=request.data.get("password") or "")
    if user is None:
        return Response({"detail": "Invalid email or password."}, status=401)
    return _token_response(user)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    workspaces = [
        {"slug": m.workspace.slug, "name": m.workspace.name, "role": m.role, "plan": m.workspace.plan}
        for m in user.memberships.select_related("workspace")
    ]
    return Response({"id": user.id, "email": user.email, "name": user.first_name, "workspaces": workspaces})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=204)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_workspace(request):
    name = (request.data.get("name") or "").strip()
    slug = slugify(name)
    if not name or not slug:
        return Response({"detail": "Workspace name is required."}, status=400)
    if Workspace.objects.filter(slug=slug).exists():
        return Response({"detail": "A workspace with a similar name already exists."}, status=400)
    workspace = Workspace.objects.create(name=name, slug=slug)
    Membership.objects.create(workspace=workspace, user=request.user, role=Membership.Role.OWNER)
    return Response({"slug": workspace.slug, "name": workspace.name, "role": "owner",
                     "plan": workspace.plan}, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_invitation(request):
    token = request.data.get("token") or ""
    invite = Invitation.objects.filter(token_hash=hash_token(token)).first()
    if invite is None or invite.accepted_at or invite.expires_at <= timezone.now():
        return Response({"detail": "This invitation is invalid or has expired."}, status=400)
    if invite.email != (request.user.email or "").lower():
        return Response({"detail": "This invitation was sent to a different email address."}, status=403)
    with transaction.atomic():
        workspace = Workspace.objects.select_for_update().get(pk=invite.workspace_id)
        if not Membership.objects.filter(workspace=workspace, user=request.user).exists():
            enforce_member_limit(workspace)
            Membership.objects.create(workspace=workspace, user=request.user, role=invite.role)
        invite.accepted_at = timezone.now()
        invite.save(update_fields=["accepted_at"])
    return Response({"workspace": workspace.slug, "role": invite.role})
