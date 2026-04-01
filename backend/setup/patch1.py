import os
import shutil
import logging
import torch
import rembg
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def cache_dinov2_assets():
    """Pre-downloads the DINOv2 repo and checkpoint into the torch hub cache."""
    logging.info("Pre-downloading DINOv2 weights...")
    try:
        torch.hub.load("facebookresearch/dinov2", "dinov2_vitl14_reg", pretrained=True)
    except Exception as e:
        logging.warning(f"DINOv2 download encountered an issue: {e}")


def vendor_dinov2_assets(trellisv1_dir: Path):
    """Copies cached DINOv2 repo and checkpoints to the local vendor directory."""
    vendored_hub_dir = trellisv1_dir / "vendor" / "torch_hub"
    vendored_repo = vendored_hub_dir / "facebookresearch_dinov2_main"
    vendored_checkpoints = vendored_hub_dir / "checkpoints"

    torch_hub_dir = Path(torch.hub.get_dir())
    cached_repo = torch_hub_dir / "facebookresearch_dinov2_main"
    cached_checkpoint = (
        torch_hub_dir / "checkpoints" / "dinov2_vitl14_reg4_pretrain.pth"
    )

    vendored_checkpoints.mkdir(parents=True, exist_ok=True)

    if cached_repo.is_dir() and not vendored_repo.is_dir():
        shutil.copytree(cached_repo, vendored_repo)

    if cached_checkpoint.is_file():
        shutil.copy2(cached_checkpoint, vendored_checkpoints / cached_checkpoint.name)

def cache_u2net_assets():
    """Ensures rembg downloads the u2net model into the local cache."""
    logging.info("Pre-downloading U2Net weights...")
    try:
        rembg.new_session("u2net")
    except Exception as e:
        logging.warning(f"U2Net download encountered an issue: {e}")

def vendor_u2net_assets(trellisv1_dir: Path):
    """Finds u2net.onnx in common locations and copies it to the vendor directory."""
    vendored_u2net_dir = trellisv1_dir / "vendor" / "u2net"
    vendored_u2net_dir.mkdir(parents=True, exist_ok=True)

    home_dir = Path.home()
    xdg_data_home = Path(os.environ.get("XDG_DATA_HOME", home_dir))

    candidates = [
        home_dir / ".u2net" / "u2net.onnx",
        xdg_data_home / ".u2net" / "u2net.onnx",
    ]

    for candidate in candidates:
        if candidate.is_file():
            shutil.copy2(candidate, vendored_u2net_dir / "u2net.onnx")
            break


def main():
    current_script_dir = Path(__file__).resolve().parent
    trellisv1_dir = (current_script_dir / ".." / "trellisv1").resolve()

    logging.info("Preparing Trellis v1 offline assets...")

    cache_dinov2_assets()
    cache_u2net_assets()
    vendor_dinov2_assets(trellisv1_dir)
    vendor_u2net_assets(trellisv1_dir)

    logging.info("Trellis v1 offline assets are ready.")


if __name__ == "__main__":
    main()
