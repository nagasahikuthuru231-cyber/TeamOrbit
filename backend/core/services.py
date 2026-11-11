import hashlib

from django.db import transaction

from .models import Issue


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@transaction.atomic
def place_issue(issue, status, index):
    """Insert `issue` into the `status` column at `index` and renumber that column 1..n.

    Positions are server-managed, so concurrent drags on one column are serialized
    by row locks on its issues.
    """
    siblings = list(
        Issue.objects.select_for_update()
        .filter(project_id=issue.project_id, board_id=issue.board_id, status=status)
        .exclude(pk=issue.pk)
        .order_by("position", "id")
    )
    index = max(0, min(index, len(siblings)))
    issue.status = status
    siblings.insert(index, issue)
    changed = []
    for pos, item in enumerate(siblings, start=1):
        if item is issue or item.position != pos:
            item.position = float(pos)
            changed.append(item)
    Issue.objects.bulk_update(changed, ["status", "position"])
