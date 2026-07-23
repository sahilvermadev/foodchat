"""Modal deployment for the Rekky realtime voice worker."""

from pathlib import Path

import modal

ROOT = Path(__file__).parent

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("ffmpeg", "sox", "gcc", "g++")
    .uv_pip_install(
        "fastapi==0.116.1",
        "speech-to-speech==0.2.10",
        "uvicorn[standard]==0.35.0",
        "websockets==15.0.1",
    )
    .add_local_file(ROOT / "gateway.py", "/opt/rekky/gateway.py")
    .add_local_file(ROOT / "tokens.py", "/opt/rekky/tokens.py")
)

app = modal.App("rekky-voice")
model_cache = modal.Volume.from_name("rekky-voice-models", create_if_missing=True)
auth_secret = modal.Secret.from_name("rekky-voice-auth")
provider_secret = modal.Secret.from_name("rekky-voice-provider")


@app.function(
    image=image,
    gpu="L4",
    min_containers=0,
    max_containers=2,
    scaledown_window=600,
    timeout=3600,
    secrets=[auth_secret, provider_secret],
    volumes={"/cache": model_cache},
)
@modal.concurrent(max_inputs=1)
@modal.web_server(port=8000, startup_timeout=1200)
def serve() -> None:
    import os
    import subprocess

    environment = {
        **os.environ,
        "HF_HOME": "/cache/huggingface",
        "XDG_CACHE_HOME": "/cache",
    }
    subprocess.Popen(
        [
            "python",
            "-m",
            "uvicorn",
            "gateway:app",
            "--app-dir",
            "/opt/rekky",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
            "--no-access-log",
        ],
        env=environment,
    )
