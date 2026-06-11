#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from epicure_core_mcp_server import (
    closest_mode,
    compare_on_axis,
    cultural_profile,
    find_pairings,
    model,
    morph,
    neighbors,
    pairing_score,
)

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_TOOLS = {
    "neighbors",
    "find_pairings",
    "pairing_score",
    "closest_mode",
    "compare_on_axis",
    "morph",
    "cultural_profile",
}


def assert_core(name: str, payload: dict) -> None:
    if payload.get("model") != "Kaikaku/epicure-core":
        raise SystemExit(f"{name} returned wrong model marker: {payload.get('model')}")
    print(f"{name}: ok")


def smoke_stdio_server() -> None:
    python = os.environ.get("EPICURE_SMOKE_PYTHON", "/usr/bin/python3")
    server = ROOT / "scripts" / "epicure_core_mcp_server.py"
    messages = [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "epicure-core-smoke", "version": "1.0.0"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "neighbors", "arguments": {"ingredient": "chicken", "top_k": 2}},
        },
    ]
    proc = subprocess.run(
        [python, str(server)],
        input="\n".join(json.dumps(message) for message in messages) + "\n",
        text=True,
        capture_output=True,
        cwd=ROOT,
        timeout=20,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(f"stdio server exited {proc.returncode}\nSTDERR:\n{proc.stderr}")

    responses = [json.loads(line) for line in proc.stdout.splitlines() if line.strip()]
    by_id = {response.get("id"): response for response in responses}
    tool_names = {tool["name"] for tool in by_id[2]["result"]["tools"]}
    if tool_names != EXPECTED_TOOLS:
        raise SystemExit(f"Unexpected stdio tools: {sorted(tool_names)}")

    payload = json.loads(by_id[3]["result"]["content"][0]["text"])
    if payload.get("model") != "Kaikaku/epicure-core":
        raise SystemExit(f"stdio tool returned wrong model marker: {payload.get('model')}")
    print("stdio_mcp: ok")


def main() -> None:
    core = model()
    if core.config.get("schema") != "core":
        raise SystemExit(f"Expected core schema, got {core.config.get('schema')}")
    if len(core.vocab) != 1790:
        raise SystemExit(f"Expected 1790 vocabulary entries, got {len(core.vocab)}")
    if len(core.modes) != 193:
        raise SystemExit(f"Expected 193 modes, got {len(core.modes)}")
    if len(core.supervised_poles) != 113:
        raise SystemExit(f"Expected 113 supervised poles, got {len(core.supervised_poles)}")

    assert_core("neighbors", neighbors("chicken", top_k=3))
    assert_core("find_pairings", find_pairings(["rice", "chicken"]))
    assert_core("pairing_score", pairing_score("chicken", "pork"))
    assert_core("closest_mode", closest_mode("chocolate", top_k=2))
    assert_core("compare_on_axis", compare_on_axis("lemon", "cream", "sour"))
    assert_core("morph", morph("rice", "cuisine:South_Asian", angle_deg=30, top_k=3))
    assert_core("cultural_profile", cultural_profile("miso"))
    smoke_stdio_server()


if __name__ == "__main__":
    main()
