import json
import logging
from pathlib import Path

from huggingface_hub import snapshot_download, hf_hub_download

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

# --- Constants for Patching ---
TRELLIS_OLD_LAYER_CODE = """        for i, layer_module in enumerate(self.model.layer):
            hidden_states = layer_module(
                hidden_states,
                position_embeddings=position_embeddings,
            )
"""

TRELLIS_NEW_LAYER_CODE = """        encoder = getattr(self.model, "model", self.model)
        encoder_layers = getattr(encoder, "layer", None)
        if encoder_layers is None:
            encoder_layers = getattr(encoder, "layers")

        for layer_module in encoder_layers:
            hidden_states = layer_module(
                hidden_states,
                position_embeddings=position_embeddings,
            )
"""

TRELLIS_OLD_CUMESH_CODE = """    def fill_holes(self, max_hole_perimeter=3e-2):
        vertices = self.vertices.cuda()
        faces = self.faces.cuda()
        
        mesh = cumesh.CuMesh()
        mesh.init(vertices, faces)
        mesh.get_edges()
        mesh.get_boundary_info()
        if mesh.num_boundaries == 0:
            return
        mesh.get_vertex_edge_adjacency()
        mesh.get_vertex_boundary_adjacency()
        mesh.get_manifold_boundary_adjacency()
        mesh.read_manifold_boundary_adjacency()
        mesh.get_boundary_connected_components()
        mesh.get_boundary_loops()
        if mesh.num_boundary_loops == 0:
            return
        mesh.fill_holes(max_hole_perimeter=max_hole_perimeter)
        new_vertices, new_faces = mesh.read()"""

TRELLIS_NEW_CUMESH_CODE = """    def fill_holes(self, max_hole_perimeter=3e-2):
        vertices = self.vertices.cuda()
        faces = self.faces.cuda()
        
        mesh = cumesh.CuMesh()
        mesh.init(vertices, faces)
        
        try:
            # Try to free up caching allocator memory first before native CuMesh allocation
            torch.cuda.empty_cache()
            mesh.get_edges()
            mesh.get_boundary_info()
            if mesh.num_boundaries == 0:
                return
            mesh.get_vertex_edge_adjacency()
            mesh.get_vertex_boundary_adjacency()
            mesh.get_manifold_boundary_adjacency()
            mesh.read_manifold_boundary_adjacency()
            mesh.get_boundary_connected_components()
            mesh.get_boundary_loops()
            if mesh.num_boundary_loops == 0:
                return
            mesh.fill_holes(max_hole_perimeter=max_hole_perimeter)
        except RuntimeError as e:
            if "out of memory" in str(e).lower():
                print("[Warning] CuMesh out of memory during fill_holes(). Skipping hole filling to prevent crash.")
                return
            raise e
            
        new_vertices, new_faces = mesh.read()"""


def patch_file(file_path: Path, old: str, new: str) -> bool:
    """Replaces 'old' with 'new' in the target file. Returns True if patched, False otherwise."""
    if not file_path.exists():
        logging.error(f"File not found: {file_path}")
        return False

    content = file_path.read_text()

    if new in content:
        logging.info(f"Already patched: {file_path.name}")
        return True

    if old not in content:
        logging.warning(
            f"Target string not found in {file_path.name}. Upstream code may have changed."
        )
        return False

    file_path.write_text(content.replace(old, new))
    logging.info(f"Successfully patched: {file_path.name}")
    return True


def patch_trellis_dinov3_api(repo_root: Path) -> None:
    logging.info("Patching TRELLIS DINOv3 API...")

    targets = [
        repo_root / "trellis2/trellis2/modules/image_feature_extractor.py",
        repo_root
        / "trellis2/trellis2/trainers/flow_matching/mixins/image_conditioned.py",
    ]

    for target_path in targets:
        patch_file(target_path, TRELLIS_OLD_LAYER_CODE, TRELLIS_NEW_LAYER_CODE)


def patch_trellis_cumesh_oom(repo_root: Path) -> None:
    logging.info("Patching TRELLIS CuMesh OOM handling...")

    target_path = repo_root / "trellis2/trellis2/representations/mesh/base.py"

    patch_file(target_path, TRELLIS_OLD_CUMESH_CODE, TRELLIS_NEW_CUMESH_CODE)


def download_repo(repo_id: str, target_dir: Path) -> None:
    logging.info(f"Downloading {repo_id} to {target_dir}...")
    target_dir.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id,
        local_dir=str(target_dir),
        local_dir_use_symlinks=False,
    )


def download_v1_checkpoints(bundle_dir: Path) -> None:
    logging.info("Downloading V1 sparse structure decoder...")
    for ext in ["json", "safetensors"]:
        hf_hub_download(
            repo_id="microsoft/TRELLIS-image-large",
            filename=f"ckpts/ss_dec_conv3d_16l8_fp16.{ext}",
            local_dir=str(bundle_dir),
        )


def patch_local_rmbg_bundle(bundle_dir: Path) -> None:
    logging.info("Patching local RMBG bundle...")
    birefnet_path = bundle_dir / "birefnet.py"

    if not birefnet_path.exists():
        logging.error("birefnet.py not found in bundle directory.")
        return

    content = birefnet_path.read_text()

    # Patch device
    content = content.replace(
        "torch.linspace(0, drop_path_rate, sum(depths))",
        "torch.linspace(0, drop_path_rate, sum(depths), device='cpu')",
    )

    # Patch tied weights
    if "all_tied_weights_keys = {}" not in content:
        content = content.replace(
            "def __init__(self, bb_pretrained=True",
            "all_tied_weights_keys = {}\n    def __init__(self, bb_pretrained=True",
        )

    birefnet_path.write_text(content)
    logging.info("Successfully patched birefnet.py")


def patch_local_pipeline_config(bundle_dir: Path) -> None:
    logging.info("Patching local pipeline configs...")

    # Patch main pipeline.json
    pipeline_path = bundle_dir / "pipeline.json"
    if pipeline_path.exists():
        try:
            pipeline = json.loads(pipeline_path.read_text())
            args = pipeline.get("args", {})

            # NOTE: This is dangerous as running 512 will not work anymore
            models = args.setdefault("models", {})
            models.pop("tex_slat_flow_model_512", None)

            # Repoint sparse_structure_decoder to the locally downloaded V1 weights
            if "sparse_structure_decoder" in models:
                models["sparse_structure_decoder"] = "ckpts/ss_dec_conv3d_16l8_fp16"

            image_cond = args.get("image_cond_model", {})
            rembg = args.get("rembg_model", {})

            image_cond.setdefault("args", {})["model_name"] = str(
                bundle_dir / "vendor" / "hf_models" / "dinov3-vitl16-pretrain-lvd1689m"
            )
            rembg.setdefault("args", {})["model_name"] = str(
                bundle_dir / "vendor" / "hf_models" / "RMBG-2.0"
            )

            pipeline_path.write_text(json.dumps(pipeline, indent=2) + "\n")
            logging.info("Successfully patched pipeline.json")
        except json.JSONDecodeError:
            logging.error("Failed to parse pipeline.json.")
    else:
        logging.error(f"pipeline.json not found at {pipeline_path}")

    # Patch texturing_pipeline.json
    texturing_path = bundle_dir / "texturing_pipeline.json"
    if texturing_path.exists():
        try:
            pipeline = json.loads(texturing_path.read_text())
            args = pipeline.get("args", {})

            image_cond = args.get("image_cond_model", {})
            rembg = args.get("rembg_model", {})

            image_cond.setdefault("args", {})["model_name"] = str(
                bundle_dir / "vendor" / "hf_models" / "dinov3-vitl16-pretrain-lvd1689m"
            )
            rembg.setdefault("args", {})["model_name"] = str(
                bundle_dir / "vendor" / "hf_models" / "RMBG-2.0"
            )

            texturing_path.write_text(json.dumps(pipeline, indent=2) + "\n")
            logging.info("Successfully patched texturing_pipeline.json")
        except json.JSONDecodeError:
            logging.error("Failed to parse texturing_pipeline.json.")
    else:
        logging.warning(f"texturing_pipeline.json not found at {texturing_path}")


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    bundle_dir = repo_root / "backend" / "trellisv2"
    vendor_dir = bundle_dir / "vendor" / "hf_models"

    logging.info(f"Starting setup. Repository root: {repo_root}")

    download_repo("microsoft/TRELLIS.2-4B", bundle_dir)
    download_v1_checkpoints(bundle_dir)
    download_repo(
        "facebook/dinov3-vitl16-pretrain-lvd1689m",
        vendor_dir / "dinov3-vitl16-pretrain-lvd1689m",
    )
    download_repo("briaai/RMBG-2.0", vendor_dir / "RMBG-2.0")

    patch_local_rmbg_bundle(vendor_dir / "RMBG-2.0")
    patch_local_pipeline_config(bundle_dir)
    patch_trellis_dinov3_api(repo_root)
    patch_trellis_cumesh_oom(repo_root)

    logging.info("Setup complete.")


if __name__ == "__main__":
    main()
