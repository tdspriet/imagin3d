import os
import shutil
import logging
import torch
from pathlib import Path
from transformers import AutoModelForImageSegmentation
from huggingface_hub import snapshot_download

# Setup basic logging to replace silent 'pass' statements
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def pre_download_models():
    """Pre-downloads TRELLIS, DINOv2, and RMBG-2.0 weights to local caches."""
    logging.info("Pre-downloading TRELLIS weights...")
    try:
        snapshot_download("microsoft/TRELLIS.2-4B")
    except Exception as e:
        logging.warning(f"TRELLIS download encountered an issue: {e}")

    logging.info("Pre-downloading DINOv2 weights...")
    try:
        torch.hub.load("facebookresearch/dinov2", "dinov2_vitl14_reg", pretrained=True)
    except Exception as e:
        logging.warning(f"DINOv2 download encountered an issue: {e}")

    logging.info("Pre-downloading RMBG-2.0 remote code and weights...")
    try:
        # Forces the download of the remote code and weights
        AutoModelForImageSegmentation.from_pretrained(
            "briaai/RMBG-2.0", trust_remote_code=True
        )
    except Exception:
        # We expect it to crash here because it isn't patched yet,
        # but the files are successfully downloaded to the cache.
        pass


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


def patch_birefnet_code():
    """Finds dynamically downloaded birefnet.py and applies necessary hotfixes."""
    hf_cache_base = Path(
        os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")
    )
    cache_dir = (
        hf_cache_base
        / "modules"
        / "transformers_modules"
        / "briaai"
        / "RMBG_hyphen_2_dot_0"
    )

    # Search for birefnet.py dynamically to avoid hardcoded hashes
    birefnet_files = list(cache_dir.rglob("birefnet.py"))

    for file_path in birefnet_files:
        content = file_path.read_text()
        original_content = content

        # Patch 1: CPU math for meta tensors
        content = content.replace(
            "torch.linspace(0, drop_path_rate, sum(depths))",
            "torch.linspace(0, drop_path_rate, sum(depths), device='cpu')",
        )

        # Patch 2: Missing tied weights variable
        if "all_tied_weights_keys = {}" not in content:
            content = content.replace(
                "def __init__(self, bb_pretrained=True",
                "all_tied_weights_keys = {}\n    def __init__(self, bb_pretrained=True",
            )

        # Only write back if changes were actually made
        if content != original_content:
            file_path.write_text(content)
            logging.info(f"Patched {file_path}")


def main():
    # Define the base trellisv1 directory relative to this script
    current_script_dir = Path(__file__).resolve().parent
    trellisv1_dir = (current_script_dir / ".." / "trellisv1").resolve()

    # Execute the preparation steps sequentially
    logging.info("Starting setup process...")

    pre_download_models()
    vendor_dinov2_assets(trellisv1_dir)
    vendor_u2net_assets(trellisv1_dir)
    patch_birefnet_code()

    logging.info("Setup and patching complete.")


if __name__ == "__main__":
    main()
