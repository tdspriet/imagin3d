"""Moodboard dataset loader.

Reads a moodboard.json file and converts it to the backend's MoodboardPayload
shape so orchestrator functions can consume it directly (all assets inlined as
data-URLs, no base64 pre-encoding required by the dataset author).
"""
from __future__ import annotations

import base64
import json
import mimetypes
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Dataset-side models (simple dataclasses, not Pydantic so we avoid importing
# the backend inside the dataset loader).
# ---------------------------------------------------------------------------

@dataclass
class MoodboardElement:
    id: int
    type: str                   # image | video | model | text | palette
    position: dict[str, float]
    size: dict[str, float]
    # type-specific payload
    path: Optional[str] = None       # for image / video / model
    file_name: Optional[str] = None  # for model (defaults to path basename)
    text: Optional[str] = None       # for text
    colors: Optional[list[str]] = None  # for palette


@dataclass
class MoodboardCluster:
    id: int
    title: str
    elements: list[int]          # element IDs


@dataclass
class AdaptSubject:
    type: str                    # "image" | "model"
    path: str
    text: Optional[str] = None


@dataclass
class Moodboard:
    name: str
    prompt: str
    elements: list[MoodboardElement] = field(default_factory=list)
    clusters: list[MoodboardCluster] = field(default_factory=list)
    multiview: bool = False
    adapt_subject: Optional[AdaptSubject] = None
    base_dir: Path = field(default_factory=Path)


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

def load(moodboard_dir: str | Path) -> Moodboard:
    """Load a moodboard from a directory containing moodboard.json."""
    base_dir = Path(moodboard_dir).resolve()
    data = json.loads((base_dir / "moodboard.json").read_text())

    elements = []
    for e in data.get("elements", []):
        elements.append(MoodboardElement(
            id=e["id"],
            type=e["type"],
            position=e["position"],
            size=e["size"],
            path=e.get("path"),
            file_name=e.get("fileName"),
            text=e.get("text"),
            colors=e.get("colors"),
        ))

    clusters = [
        MoodboardCluster(id=c["id"], title=c["title"], elements=c["elements"])
        for c in data.get("clusters", [])
    ]

    adapt_subject = None
    if data.get("adapt_subject"):
        a = data["adapt_subject"]
        adapt_subject = AdaptSubject(type=a["type"], path=a["path"], text=a.get("text"))

    return Moodboard(
        name=data["name"],
        prompt=data["prompt"],
        elements=elements,
        clusters=clusters,
        multiview=data.get("multiview", False),
        adapt_subject=adapt_subject,
        base_dir=base_dir,
    )


# ---------------------------------------------------------------------------
# Conversion to backend MoodboardPayload shape
# (see backend/common.py and frontend serialization in moodboardStore.js)
# ---------------------------------------------------------------------------

_MIME_OVERRIDES = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}

_DEFAULT_SIZES = {
    "image":   {"x": 300, "y": 200},
    "video":   {"x": 400, "y": 225},
    "model":   {"x": 300, "y": 300},
    "text":    {"x": 200, "y": 40},
    "palette": {"x": 150, "y": 100},
}


def _file_to_data_url(path: Path) -> str:
    ext = path.suffix.lower()
    mime = _MIME_OVERRIDES.get(ext) or mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    data = base64.b64encode(path.read_bytes()).decode()
    return f"data:{mime};base64,{data}"


def to_payload(moodboard: Moodboard) -> dict[str, Any]:
    """Convert a Moodboard to the JSON shape expected by POST /extract (and orchestrator)."""
    elements_out: list[dict] = []
    for elem in moodboard.elements:
        default_size = _DEFAULT_SIZES.get(elem.type, {"x": 200, "y": 200})
        # size in the payload is a ratio relative to default size
        size_ratio = {
            "x": elem.size.get("x", 1.0),
            "y": elem.size.get("y", 1.0),
        }

        content_data: dict[str, Any] = {}
        if elem.type in ("image", "video"):
            asset_path = moodboard.base_dir / elem.path
            content_data = {"src": _file_to_data_url(asset_path)}
        elif elem.type == "model":
            asset_path = moodboard.base_dir / elem.path
            file_name = elem.file_name or asset_path.name
            content_data = {"src": _file_to_data_url(asset_path), "fileName": file_name}
        elif elem.type == "text":
            content_data = {"text": elem.text or ""}
        elif elem.type == "palette":
            content_data = {"colors": elem.colors or [], "origin": "manual"}

        elements_out.append({
            "id": elem.id,
            "content": {"type": elem.type, "data": content_data},
            "position": elem.position,
            "size": size_ratio,
        })

    clusters_out = [
        {"id": c.id, "title": c.title, "elements": sorted(c.elements)}
        for c in moodboard.clusters
    ]

    payload: dict[str, Any] = {
        "elements": elements_out,
        "clusters": clusters_out,
        "prompt": moodboard.prompt,
        "multiview": moodboard.multiview,
    }

    if moodboard.adapt_subject:
        s = moodboard.adapt_subject
        if s.text:
            payload["adapt_subject_text"] = s.text
        asset_path = moodboard.base_dir / s.path
        ext = asset_path.suffix.lower()
        asset_type = "model" if ext in (".glb", ".gltf") else "image"
        payload["adapt_subject_file"] = {
            "type": asset_type,
            "data": _file_to_data_url(asset_path),
            "name": asset_path.name,
        }

    return payload
