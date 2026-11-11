import os

from django.conf import settings
from rest_framework.exceptions import ValidationError

# Extension allowlist. None means plain text (checked for valid UTF-8, no NUL bytes).
# Binary formats must start with the expected magic bytes, so renaming a file does not bypass the check.
SIGNATURES = {
    ".pdf": [b"%PDF-"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".gif": [b"GIF87a", b"GIF89a"],
    ".docx": [b"PK\x03\x04"],
    ".xlsx": [b"PK\x03\x04"],
    ".txt": None,
    ".md": None,
    ".csv": None,
}


def validate_attachment(upload):
    max_bytes = settings.ATTACHMENT_MAX_BYTES
    if upload.size > max_bytes:
        raise ValidationError(f"File exceeds the {max_bytes} byte limit.")

    ext = os.path.splitext(upload.name)[1].lower()
    if ext not in SIGNATURES:
        raise ValidationError(f"File type {ext or 'unknown'} is not allowed.")

    upload.seek(0)
    data = upload.read()
    upload.seek(0)

    signatures = SIGNATURES[ext]
    if signatures is None:
        if b"\x00" in data:
            raise ValidationError("Text attachments must not contain binary data.")
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            raise ValidationError("Text attachments must be UTF-8 encoded.")
    elif not any(data.startswith(sig) for sig in signatures):
        raise ValidationError("File contents do not match its extension.")
