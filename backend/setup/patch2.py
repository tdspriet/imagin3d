import logging
import os
import shutil
import json
from pathlib import Path

from huggingface_hub import snapshot_download

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

TRELLIS_REPO_ID = "microsoft/TRELLIS.2-4B"
TRELLIS_V1_REPO_ID = "microsoft/TRELLIS-image-large"
DINO_V3_REPO_ID = "facebook/dinov3-vitl16-pretrain-lvd1689m"
RMBG_REPO_ID = "briaai/RMBG-2.0"
DINO_V3_DIR_NAME = "dinov3-vitl16-pretrain-lvd1689m"
RMBG_DIR_NAME = "RMBG-2.0"
SPARSE_DECODER_NAME = "ss_dec_conv3d_16l8_fp16"
REQUIRED_TRELLIS_FILES = ("pipeline.json",)
OPTIONAL_TRELLIS_FILES = ("texturing_pipeline.json",)


def copy_missing_files(src: Path, dst: Path) -> None:
    if not src.exists():
        raise FileNotFoundError(f"Missing required source directory: {src}")
    dst.mkdir(parents=True, exist_ok=True)
    for path in src.rglob("*"):
        target = dst / path.relative_to(src)
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)


def copy_file_if_missing(src: Path, dst: Path) -> None:
    if not src.exists():
        raise FileNotFoundError(f"Missing required source file: {src}")
    if dst.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def resolve_hf_snapshot(repo_id: str, allow_patterns: list[str] | None = None) -> Path:
    try:
        path = snapshot_download(
            repo_id,
            allow_patterns=allow_patterns,
            local_files_only=True,
        )
        logging.info("Using cached snapshot for %s", repo_id)
        return Path(path)
    except Exception:
        logging.info("Cached snapshot missing for %s, downloading...", repo_id)
        return Path(snapshot_download(repo_id, allow_patterns=allow_patterns))


def ensure_trellis_bundle(bundle_dir: Path) -> None:
    snapshot_dir = resolve_hf_snapshot(TRELLIS_REPO_ID)
    for name in REQUIRED_TRELLIS_FILES:
        copy_file_if_missing(snapshot_dir / name, bundle_dir / name)
    for name in OPTIONAL_TRELLIS_FILES:
        src = snapshot_dir / name
        if src.exists():
            copy_file_if_missing(src, bundle_dir / name)
    copy_missing_files(snapshot_dir / "ckpts", bundle_dir / "ckpts")


def ensure_sparse_decoder(bundle_dir: Path) -> None:
    snapshot_dir = resolve_hf_snapshot(
        TRELLIS_V1_REPO_ID,
        allow_patterns=[
            f"ckpts/{SPARSE_DECODER_NAME}.json",
            f"ckpts/{SPARSE_DECODER_NAME}.safetensors",
        ],
    )
    copy_file_if_missing(
        snapshot_dir / "ckpts" / f"{SPARSE_DECODER_NAME}.json",
        bundle_dir / "ckpts" / f"{SPARSE_DECODER_NAME}.json",
    )
    copy_file_if_missing(
        snapshot_dir / "ckpts" / f"{SPARSE_DECODER_NAME}.safetensors",
        bundle_dir / "ckpts" / f"{SPARSE_DECODER_NAME}.safetensors",
    )


def ensure_hf_model_bundle(bundle_dir: Path, repo_id: str, dir_name: str) -> None:
    copy_missing_files(
        resolve_hf_snapshot(repo_id),
        bundle_dir / "vendor" / "hf_models" / dir_name,
    )


def patch_file(path: Path) -> None:
    if not path.is_file():
        return
    content = path.read_text()
    original = content
    content = content.replace(
        "torch.linspace(0, drop_path_rate, sum(depths))",
        "torch.linspace(0, drop_path_rate, sum(depths), device='cpu')",
    )
    if "all_tied_weights_keys = {}" not in content:
        content = content.replace(
            "def __init__(self, bb_pretrained=True",
            "all_tied_weights_keys = {}\n    def __init__(self, bb_pretrained=True",
        )
    if content != original:
        path.write_text(content)


def patch_rmbg_code(bundle_dir: Path) -> None:
    patch_file(bundle_dir / "vendor" / "hf_models" / RMBG_DIR_NAME / "birefnet.py")
    hf_cache_base = Path(
        os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")
    )
    modules_root = hf_cache_base / "modules" / "transformers_modules"
    for path in modules_root.rglob("birefnet.py"):
        if "RMBG_hyphen_2_dot_0" in str(path):
            patch_file(path)


def patch_pipeline_config(bundle_dir: Path) -> None:
    config_path = bundle_dir / "pipeline.json"
    data = json.loads(config_path.read_text())
    data["args"]["models"]["sparse_structure_decoder"] = f"ckpts/{SPARSE_DECODER_NAME}"
    data["args"]["image_cond_model"]["args"]["model_name"] = str(
        bundle_dir / "vendor" / "hf_models" / DINO_V3_DIR_NAME
    )
    data["args"]["rembg_model"]["args"]["model_name"] = str(
        bundle_dir / "vendor" / "hf_models" / RMBG_DIR_NAME
    )
    config_path.write_text(json.dumps(data, indent=2) + "\n")


def validate_bundle(bundle_dir: Path) -> None:
    required_files = [
        bundle_dir / "pipeline.json",
        bundle_dir / "ckpts" / f"{SPARSE_DECODER_NAME}.json",
        bundle_dir / "ckpts" / f"{SPARSE_DECODER_NAME}.safetensors",
        bundle_dir / "vendor" / "hf_models" / DINO_V3_DIR_NAME / "config.json",
        bundle_dir / "vendor" / "hf_models" / RMBG_DIR_NAME / "config.json",
    ]
    required_dirs = [
        bundle_dir / "ckpts",
    ]
    missing = [str(path) for path in required_files if not path.is_file()]
    missing.extend(
        str(path) for path in required_dirs if not path.is_dir() or not any(path.iterdir())
    )
    if missing:
        raise FileNotFoundError(
            "Offline TrellisV2 bundle is incomplete:\n" + "\n".join(missing)
        )


def main() -> None:
    bundle_dir = (Path(__file__).resolve().parent / ".." / "trellisv2").resolve()
    logging.info("Preparing offline TrellisV2 bundle at %s", bundle_dir)
    ensure_trellis_bundle(bundle_dir)
    ensure_sparse_decoder(bundle_dir)
    ensure_hf_model_bundle(bundle_dir, DINO_V3_REPO_ID, DINO_V3_DIR_NAME)
    ensure_hf_model_bundle(bundle_dir, RMBG_REPO_ID, RMBG_DIR_NAME)
    patch_rmbg_code(bundle_dir)
    patch_pipeline_config(bundle_dir)
    validate_bundle(bundle_dir)
    logging.info("Offline TrellisV2 bundle is ready.")


if __name__ == "__main__":
    main()
