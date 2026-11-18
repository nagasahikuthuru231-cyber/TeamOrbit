from django.db import migrations, models

import core.models


def copy_board_columns(apps, schema_editor):
    """Keep each project's workflow: take columns from its first board."""
    Project = apps.get_model("core", "Project")
    Board = apps.get_model("core", "Board")
    for project in Project.objects.all():
        board = Board.objects.filter(project=project).order_by("id").first()
        if board and board.columns:
            project.columns = board.columns
            project.save(update_fields=["columns"])


class Migration(migrations.Migration):

    dependencies = [("core", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="project",
            name="columns",
            field=models.JSONField(default=core.models.default_columns),
        ),
        migrations.RunPython(copy_board_columns, migrations.RunPython.noop),
        migrations.RemoveField(model_name="issue", name="board"),
        migrations.DeleteModel(name="Board"),
    ]
