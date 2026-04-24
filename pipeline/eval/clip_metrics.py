"""CLIP-based evaluation metrics for the A/B pipeline.

Two metrics:

  clip_preservation(master_image_path, render_paths)
    Measures how well the generated 3D model's renders match the 2D master
    image fed into Trellis.  Higher = the 3D generator faithfully uplifted
    the 2D reference into 3D without hallucinating or distorting the concept.

  clip_closeness(elements, render_paths)
    Measures how close the generated 3D model is to the weighted semantic
    centroid of the moodboard elements.  Higher = the final 3D asset captures
    the collective design intent of the board.

Both return cosine similarities in [0, 1] (negative values are clamped to 0).

Model: open_clip ViT-L/14 pretrained on the OpenAI dataset.  It is loaded once
per process and kept on CUDA.  If CUDA is unavailable the metrics still run on
CPU (slower but functional).

Dependencies:
  pip install open-clip-torch Pillow
"""
from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

_CLIP_MODEL: Any = None
_CLIP_PREPROCESS: Any = None
_CLIP_TOKENIZER: Any = None
_DEVICE: str = "cpu"


def _load_clip():
    global _CLIP_MODEL, _CLIP_PREPROCESS, _CLIP_TOKENIZER, _DEVICE
    if _CLIP_MODEL is not None:
        return

    try:
        import open_clip  # type: ignore
        import torch

        _DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
        _CLIP_MODEL, _, _CLIP_PREPROCESS = open_clip.create_model_and_transforms(
            "ViT-L-14", pretrained="openai", device=_DEVICE
        )
        _CLIP_TOKENIZER = open_clip.get_tokenizer("ViT-L-14")
        _CLIP_MODEL.eval()
    except ImportError as exc:
        raise ImportError(
            "open-clip-torch is required for CLIP metrics. "
            "Install it with: pip install open-clip-torch"
        ) from exc


def encode_image(path: Path) -> np.ndarray:
    """Return the L2-normalised CLIP image embedding for a single image file."""
    _load_clip()
    import torch

    img = _CLIP_PREPROCESS(Image.open(path).convert("RGB")).unsqueeze(0).to(_DEVICE)
    with torch.no_grad():
        emb = _CLIP_MODEL.encode_image(img)
    emb = emb / emb.norm(dim=-1, keepdim=True)
    return emb.cpu().float().numpy()[0]


def encode_text(text: str) -> np.ndarray:
    """Return the L2-normalised CLIP text embedding for a string."""
    _load_clip()
    import torch

    tokens = _CLIP_TOKENIZER([text]).to(_DEVICE)
    with torch.no_grad():
        emb = _CLIP_MODEL.encode_text(tokens)
    emb = emb / emb.norm(dim=-1, keepdim=True)
    return emb.cpu().float().numpy()[0]


def _palette_to_image(colors: list[str]) -> Image.Image:
    """Render a colour palette as a horizontal swatch strip (150×50 px)."""
    n = max(len(colors), 1)
    w, h = 30 * n, 50
    img = Image.new("RGB", (w, h))
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    for i, hex_color in enumerate(colors):
        hc = hex_color.lstrip("#")
        if len(hc) == 3:
            hc = "".join(c * 2 for c in hc)
        rgb = tuple(int(hc[j:j+2], 16) for j in (0, 2, 4))
        draw.rectangle([i * 30, 0, (i + 1) * 30, h], fill=rgb)  # type: ignore
    return img


def _encode_element(elem: dict[str, Any], base_dir: Path) -> np.ndarray | None:
    """Encode a single moodboard element to a CLIP embedding.

    Returns None if the element cannot be encoded (e.g. missing asset).
    """
    etype = elem.get("type", "")

    if etype in ("image", "video"):
        path = base_dir / elem["path"] if elem.get("path") else None
        if path and path.exists():
            return encode_image(path)

    elif etype == "model":
        # Use pre-rendered views if they exist; otherwise skip
        render_dir = elem.get("render_dir")
        if render_dir:
            renders = sorted(Path(render_dir).glob("*.jpg"))
            if renders:
                embs = [encode_image(r) for r in renders]
                avg = np.mean(embs, axis=0)
                norm = np.linalg.norm(avg)
                return avg / norm if norm > 0 else avg

    elif etype == "text":
        text = elem.get("text", "")
        if text.strip():
            return encode_text(text)

    elif etype == "palette":
        colors = elem.get("colors", [])
        if colors:
            img = _palette_to_image(colors)
            import io
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            buf.seek(0)
            import tempfile, os
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
                f.write(buf.read())
                tmp = f.name
            try:
                return encode_image(Path(tmp))
            finally:
                os.unlink(tmp)

    return None


def _mean_render_embedding(render_paths: list[Path]) -> np.ndarray | None:
    if not render_paths:
        return None
    embs = [encode_image(p) for p in render_paths if p.exists()]
    if not embs:
        return None
    avg = np.mean(embs, axis=0)
    norm = np.linalg.norm(avg)
    return avg / norm if norm > 0 else avg


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def clip_preservation(
    master_image_paths: list[Path],
    render_paths: list[Path],
) -> float:
    """CLIP image-to-image similarity between master image(s) and GLB renders.

    For single-view: one master image vs mean of renders.
    For multiview: front master vs front render + back master vs back render,
    averaged — but the caller controls which renders map to which master.
    Simply pass all renders together for a quick overall score.
    """
    if not master_image_paths or not render_paths:
        return 0.0

    render_emb = _mean_render_embedding(render_paths)
    if render_emb is None:
        return 0.0

    master_embs = [encode_image(p) for p in master_image_paths if p.exists()]
    if not master_embs:
        return 0.0

    scores = [max(0.0, _cosine(m, render_emb)) for m in master_embs]
    return float(np.mean(scores))


def clip_closeness(
    elements: list[dict[str, Any]],
    render_paths: list[Path],
    base_dir: Path,
    relevance_threshold: int = 50,
) -> tuple[float, dict[str, float]]:
    """CLIP weighted-centroid similarity between moodboard elements and GLB renders.

    Parameters
    ----------
    elements:
        List of element dicts with keys: id, type, weight (int 0-100), and
        type-specific fields (path, text, colors, render_dir).
    render_paths:
        Paths to Blender-rendered views of the generated GLB.
    base_dir:
        Moodboard base directory for resolving relative asset paths.
    relevance_threshold:
        Elements with weight <= this are excluded (matches Imagin3D's routing).

    Returns
    -------
    (closeness_score, per_element_contributions)
        closeness_score: float in [0, 1]
        per_element_contributions: {str(id): float} for diagnostics
    """
    render_emb = _mean_render_embedding(render_paths)
    if render_emb is None:
        return 0.0, {}

    embeddings: list[np.ndarray] = []
    weights: list[float] = []
    contributions: dict[str, float] = {}

    for elem in elements:
        w = elem.get("weight", 0)
        if w <= relevance_threshold:
            continue
        emb = _encode_element(elem, base_dir)
        if emb is None:
            continue
        embeddings.append(emb)
        weights.append(float(w))
        contributions[str(elem["id"])] = max(0.0, _cosine(emb, render_emb))

    if not embeddings:
        return 0.0, {}

    weights_np = np.array(weights)
    weights_np = weights_np / weights_np.sum()
    centroid = np.average(embeddings, axis=0, weights=weights_np)
    norm = np.linalg.norm(centroid)
    if norm > 0:
        centroid /= norm

    score = max(0.0, _cosine(centroid, render_emb))
    return score, contributions


# ---------------------------------------------------------------------------
# Quick smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    from pathlib import Path

    artifacts = Path(__file__).parent.parent.parent / "backend" / "artifacts"
    renders = sorted(artifacts.glob("model_renders/**/*.jpg"))[:3]
    master = artifacts / "master_image.jpg"

    if not renders or not master.exists():
        print("No existing artifacts found; skipping smoke test.")
        sys.exit(0)

    print(f"Testing preservation with {master} vs {len(renders)} renders...")
    score = clip_preservation([master], renders)
    print(f"  preservation = {score:.3f}")

    if score > 0:
        print("  CLIP smoke test passed.")
    else:
        print("  WARNING: score is 0; check CLIP installation.")
