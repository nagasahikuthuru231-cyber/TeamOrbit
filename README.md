# Multi-tenant Project Management SaaS

Django REST Framework + React + PostgreSQL + Celery + Stripe (test mode) + Docker + GitHub Actions.

## Local development

```bash
docker compose up --build              # api :8000, postgres, redis, celery worker + beat
cd frontend && npm install && npm run dev   # http://localhost:5173
```

1. Open the frontend and click **Sign up**.
2. Create a workspace. You become its owner.
3. Add a project and a board, then invite teammates by email. The invite link opens the app and joins the workspace after login.

Invite emails print to the console in development (`EMAIL_BACKEND` defaults to the console backend).

## Features

- **Auth:** signup, login, logout, and `/api/auth/me/` (token auth).
- **Tenancy:** shared schema with `workspace_id` on every tenant row. The tenant comes from the `X-Workspace` header.
- **Roles:** viewer < member < admin < owner, enforced per view.
- **Invites:** admins invite by email. The raw token is emailed once and only its SHA-256 hash is stored. Invites expire after `INVITE_TTL_DAYS`. Accepting requires a login with the invited email.
- **Plan limits:** `PLAN_LIMITS` caps projects and members per plan. Pending invites count toward the member cap. Over-limit requests return HTTP 402.
- **Kanban:** drag-and-drop calls `POST /api/issues/{id}/move/` with `{status, index}`. The server reinserts the issue and renumbers the column, so positions stay consistent under concurrent drags.
- **Comments and attachments:** only the author (or an admin/owner) can edit or delete a comment or attachment. Attachments must have an allowed extension, be under `ATTACHMENT_MAX_BYTES` (default 10 MB), and match their magic bytes. Text files must be valid UTF-8. SVG is not allowed.
- **Audit and webhooks:** every mutation writes an `AuditLog` row and emits a signed webhook event.
- **Billing:** `/api/billing/checkout/` (owners) creates a Stripe subscription session. `/billing/webhook/` updates the plan.

## Tests

```bash
cd backend && python manage.py test
```

## Production deploy (GitHub Actions)

On every push to `main`, CI builds the backend image, pushes it to GitHub Container Registry (`ghcr.io/<owner>/<repo>/backend`), then SSHes into the host and runs `docker-compose.prod.yml`.

Configure these repository **secrets** (Settings > Secrets and variables > Actions):

| Secret | Purpose |
|---|---|
| `DEPLOY_HOST` | Host address |
| `DEPLOY_USER` | SSH user with Docker access |
| `DEPLOY_SSH_KEY` | Private key for that user |
| `DEPLOY_PATH` | Directory on the host containing `docker-compose.prod.yml` and `.env` |
| `GHCR_PULL_TOKEN` | Personal access token with `read:packages`, so the host can pull the private image |

The host needs Docker with the Compose plugin, and a `.env` with production values (`DJANGO_SECRET_KEY`, Postgres credentials, `POSTGRES_HOST=db`, `REDIS_URL=redis://redis:6379/0`, Stripe keys, `FRONTEND_URL`). Put a TLS reverse proxy in front of port 8000.

## Known gaps

- Auth is token-only, with no password reset or email verification.
- No rate limiting on login or signup yet.
- Invite tokens travel through the Celery broker. Acceptable for now, but a stronger design would send only the invitation ID.
- Stripe plan downgrades don't remove existing projects or members, so they stay over the free limit.
- Comments and attachments have no UI yet; the API handles them.
