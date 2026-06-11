#!/usr/bin/env python3
from __future__ import annotations

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


def assert_core(name: str, payload: dict) -> None:
    if payload.get("model") != "Kaikaku/epicure-core":
        raise SystemExit(f"{name} returned wrong model marker: {payload.get('model')}")
    print(f"{name}: ok")


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


if __name__ == "__main__":
    main()
