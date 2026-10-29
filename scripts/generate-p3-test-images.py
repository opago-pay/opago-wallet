"""Synthetic solid-colour fixtures; no actual identity document or external service."""
import base64
import io
import json
from pathlib import Path
from PIL import Image

def image(width, height, kind, metadata=False):
    output = io.BytesIO()
    options = {}
    if metadata:
        exif = Image.Exif()
        exif[274] = 6
        exif[270] = "synthetic-GPS-location-metadata"
        options["exif"] = exif
    Image.new("RGB", (width, height), (245, 245, 245)).save(output, kind, **options)
    return base64.b64encode(output.getvalue()).decode()

target = Path(__file__).resolve().parents[1] / "tests/fixtures/p3-photo.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps({"source_jpeg": image(600,800,"JPEG",True),
    "normalized_jpeg": image(800,600,"JPEG"), "png": image(600,800,"PNG")}, indent=2) + "\n", encoding="utf-8")
