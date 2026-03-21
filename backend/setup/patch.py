from transformers import AutoModelForImageSegmentation
import os
import glob

print("Downloading RMBG-2.0...")
try:
    # This forces the download of the remote code and weights
    AutoModelForImageSegmentation.from_pretrained(
        "briaai/RMBG-2.0",
        trust_remote_code=True,
        low_cpu_mem_usage=False,
    )
except Exception:
    # We expect it to crash here because it isn't patched yet, but the files are now downloaded!
    pass

print("Patching local submodule BiRefNet.py...")
submodule_file = "/workspaces/imagin3d/trellis2/pipelines/rembg/BiRefNet.py"

if os.path.exists(submodule_file):
    with open(submodule_file, "r") as f:
        submodule_content = f.read()

    # Inject the fix into the submodule code if it's not already there
    if "low_cpu_mem_usage=False" not in submodule_content:
        submodule_content = submodule_content.replace(
            "trust_remote_code=True",
            "trust_remote_code=True,\n            low_cpu_mem_usage=False",
        )
        with open(submodule_file, "w") as f:
            f.write(submodule_content)
        print("Submodule file patched successfully!")
    else:
        print("Submodule file already patched.")
else:
    print(f"Warning: Submodule file not found at {submodule_file}")

print("Locating and patching cached Hugging Face birefnet.py...")
cache_dir = os.path.expanduser(
    "~/.cache/huggingface/modules/transformers_modules/briaai/RMBG_hyphen_2_dot_0"
)
# Search for birefnet.py dynamically to avoid hardcoded hashes
birefnet_files = glob.glob(f"{cache_dir}/**/birefnet.py", recursive=True)

if birefnet_files:
    for file_path in birefnet_files:
        with open(file_path, "r") as f:
            content = f.read()

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

        with open(file_path, "w") as f:
            f.write(content)
    print("Cache patches applied successfully!")
else:
    print("Warning: cached birefnet.py not found. Patching failed.")
