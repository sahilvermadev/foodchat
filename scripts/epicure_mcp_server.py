#!/usr/bin/env python3
import os
import sys
import json
import numpy as np
from pathlib import Path

# Dynamically set the permanent directory for the model embedding and tags files
SCRIPT_DIR = Path(__file__).resolve().parent
os.environ["EPICURE_DATA_DIR"] = str(SCRIPT_DIR.parent / "data" / "epicure")

# Monkeypatch the slow pairing stats calculation with caching
import epicure_mcp.data_loader as dl

def optimized_load_pairing_stats(normed: np.ndarray) -> dict[str, float]:
    from epicure_mcp.config import load_config
    cfg = load_config()
    cache_file = cfg.data_dir / "pairing_stats_cache.json"
    if cache_file.exists():
        try:
            with open(cache_file, "r") as f:
                return json.load(f)
        except Exception:
            pass

    n = normed.shape[0]
    rows: list[np.ndarray] = []
    for i in range(n):
        rows.append(normed[i] @ normed[i + 1:].T)
    all_sims = np.concatenate(rows)
    stats = {
        "p10": round(float(np.percentile(all_sims, 10)), 4),
        "p25": round(float(np.percentile(all_sims, 25)), 4),
        "median": round(float(np.median(all_sims)), 4),
        "p75": round(float(np.percentile(all_sims, 75)), 4),
        "p90": round(float(np.percentile(all_sims, 90)), 4),
    }
    try:
        with open(cache_file, "w") as f:
            json.dump(stats, f)
    except Exception:
        pass
    return stats

dl._load_pairing_stats = optimized_load_pairing_stats

# Import from the officially installed Kaikaku epicure-mcp package
from epicure_mcp.server import _build_mcp
from epicure_mcp.config import load_config
from epicure_mcp.data_loader import get_bundle

if __name__ == "__main__":
    # Write initialization status to stderr so stdout is reserved for MCP JSON-RPC messages
    print("Initializing official Kaikaku Epicure MCP Server...", file=sys.stderr)
    try:
        cfg = load_config()
        print("Pre-loading data and warming caches...", file=sys.stderr)
        get_bundle()  # Forces data loading and generates static pairing stats cache file
        mcp = _build_mcp(cfg, None)
        print("Epicure MCP Server successfully loaded and running on stdio.", file=sys.stderr)
        mcp.run()
    except Exception as e:
        print(f"FATAL: Epicure MCP Server failed to start: {e}", file=sys.stderr)
        sys.exit(1)
