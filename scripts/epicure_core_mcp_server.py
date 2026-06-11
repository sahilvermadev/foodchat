#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import re
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_DIR = ROOT / "data" / "epicure-core"
MODEL_DIR = Path(os.environ.get("EPICURE_CORE_DIR", str(DEFAULT_MODEL_DIR)))
SERVER_NAME = os.environ.get("MCP_SERVER_NAME", "epicure")
SERVER_INSTRUCTIONS = (
    "Read-only access to Kaikaku/epicure-core, a 300-dimensional ingredient embedding with "
    "1,790 canonical ingredients. Use find_pairings for recipe design, neighbors for "
    "substitutions, pairing_score for compatibility, closest_mode for flavor families, "
    "compare_on_axis for sensory or culinary axes, morph for directed fusion, and "
    "cultural_profile for cuisine alignment."
)


def _unit(v: np.ndarray, axis: int = -1, eps: float = 1e-9) -> np.ndarray:
    norm = np.linalg.norm(v, axis=axis, keepdims=True)
    return v / np.maximum(norm, eps)


def _slug(value: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", value.lower())).strip("_")


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@dataclass(frozen=True)
class Mode:
    mode_id: str
    kind: str
    property: str
    label: str
    members: tuple[str, ...]
    pole: np.ndarray


class EpicureCore:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.config = _read_json(model_dir / "config.json")
        self.vocab: dict[str, int] = {str(k): int(v) for k, v in _read_json(model_dir / "vocab.json").items()}
        self.itos: dict[int, str] = {int(k): str(v) for k, v in _read_json(model_dir / "itos.json").items()}
        raw_embeddings = np.load(model_dir / "embeddings.npy").astype(np.float32)
        self.embeddings = _unit(raw_embeddings).astype(np.float32)
        self.supervised_poles = {
            str(k): _unit(np.array(v, dtype=np.float32)) for k, v in _read_json(model_dir / "supervised_poles.json").items()
        }
        self.factor_poles = _unit(np.load(model_dir / "factor_poles.npy").astype(np.float32))
        self.factor_index = _read_json(model_dir / "factor_pole_index.json")
        self.modes = tuple(self._load_modes(_read_json(model_dir / "modes.json")))
        self.lookup = self._build_lookup()

    def _load_modes(self, raw_modes: list[dict[str, Any]]) -> list[Mode]:
        modes: list[Mode] = []
        for mode in raw_modes:
            pole = _unit(np.array(mode["pole"], dtype=np.float32))
            modes.append(
                Mode(
                    mode_id=str(mode["mode_id"]),
                    kind=str(mode.get("kind", "")),
                    property=str(mode.get("property", "")),
                    label=str(mode.get("label", "")),
                    members=tuple(str(m) for m in mode.get("members", [])),
                    pole=pole,
                )
            )
        return modes

    def _build_lookup(self) -> dict[str, str]:
        lookup: dict[str, str] = {}
        for name in self.vocab:
            lookup[_slug(name)] = name
            lookup[_slug(name.replace("_", " "))] = name
        return lookup

    def canonical(self, value: str) -> str:
        if value in self.vocab:
            return value
        key = _slug(value)
        if key in self.lookup:
            return self.lookup[key]
        compact = key.replace("_", "")
        for slug, name in self.lookup.items():
            if slug.replace("_", "") == compact:
                return name
        matches = [name for slug, name in self.lookup.items() if compact in slug.replace("_", "")]
        if matches:
            return sorted(set(matches), key=len)[0]
        raise ValueError(f'Unknown ingredient "{value}". Use a canonical Epicure ingredient name.')

    def vector(self, value: str) -> tuple[str, np.ndarray]:
        name = self.canonical(value)
        return name, self.embeddings[self.vocab[name]]

    def nearest(self, query: np.ndarray, top_k: int, exclude: set[str] | None = None) -> list[dict[str, Any]]:
        exclude = exclude or set()
        sims = self.embeddings @ _unit(query)
        for name in exclude:
            if name in self.vocab:
                sims[self.vocab[name]] = -np.inf
        order = np.argsort(-sims)[: max(1, int(top_k))]
        return [{"ingredient": self.itos[int(i)], "score": round(float(sims[i]), 4)} for i in order]

    def resolve_direction(self, target: str) -> tuple[str, np.ndarray]:
        if target in self.vocab or _slug(target) in self.lookup:
            name, vec = self.vector(target)
            return f"ingredient:{name}", vec

        wanted = _slug(target.replace("cuisine:", ""))
        exact = [
            (key, vec)
            for key, vec in self.supervised_poles.items()
            if _slug(key) == wanted or _slug(key.split("/")[-1]) == wanted
        ]
        if exact:
            return exact[0]

        matching = [
            (key, vec)
            for key, vec in self.supervised_poles.items()
            if wanted in _slug(key) or wanted in _slug(key.split("/")[-1])
        ]
        if matching:
            vec = _unit(np.mean([vec for _, vec in matching], axis=0))
            return f"average:{target}", vec

        mode_matches = [mode for mode in self.modes if wanted in _slug(mode.label) or wanted in _slug(mode.mode_id)]
        if mode_matches:
            vec = _unit(np.mean([mode.pole for mode in mode_matches], axis=0))
            return f"mode_average:{target}", vec

        raise ValueError(f'Unknown Epicure target or axis "{target}".')


@lru_cache(maxsize=1)
def model() -> EpicureCore:
    core = EpicureCore(MODEL_DIR)
    print(
        f"Epicure Core loaded from {core.model_dir} "
        f"(schema={core.config.get('schema')}, vocab={len(core.vocab)}, modes={len(core.modes)}, "
        f"supervised_poles={len(core.supervised_poles)})",
        file=sys.stderr,
    )
    return core


def neighbors(ingredient: str, top_k: int = 5) -> dict[str, Any]:
    core = model()
    name, vec = core.vector(ingredient)
    return {
        "model": "Kaikaku/epicure-core",
        "ingredient": name,
        "neighbors": core.nearest(vec, top_k=top_k, exclude={name}),
    }

def pairing_score(ingredient_a: str, ingredient_b: str) -> dict[str, Any]:
    core = model()
    name_a, vec_a = core.vector(ingredient_a)
    name_b, vec_b = core.vector(ingredient_b)
    score = float(vec_a @ vec_b)
    return {
        "model": "Kaikaku/epicure-core",
        "ingredient_a": name_a,
        "ingredient_b": name_b,
        "cosine_similarity": round(score, 4),
        "interpretation": "higher is closer in the Core ingredient embedding",
    }

def find_pairings(
    ingredients: list[str] | str,
    is_vegan: bool = False,
    is_vegetarian: bool = False,
) -> dict[str, Any]:
    core = model()
    seeds = [ingredients] if isinstance(ingredients, str) else ingredients
    canonical = [core.vector(seed)[0] for seed in seeds]
    vectors = [core.vector(seed)[1] for seed in seeds]
    query = _unit(np.mean(vectors, axis=0))
    candidates = core.nearest(query, top_k=18, exclude=set(canonical))
    bridges: list[dict[str, Any]] = []
    for candidate in candidates[:10]:
        _, cvec = core.vector(candidate["ingredient"])
        seed_scores = {
            seed: round(float(cvec @ vec), 4)
            for seed, vec in zip(canonical, vectors)
        }
        bridges.append(
            {
                "ingredient": candidate["ingredient"],
                "blend_score": candidate["score"],
                "seed_scores": seed_scores,
                "why": "nearest to the combined Core vector while staying close to each seed",
            }
        )
    return {
        "model": "Kaikaku/epicure-core",
        "seeds": canonical,
        "top_pairings": candidates[:12],
        "bridges": bridges,
        "filters": {
            "is_vegan": is_vegan,
            "is_vegetarian": is_vegetarian,
            "note": "Core artifact has no diet tags; apply dietary constraints in recipe composition.",
        },
    }

def closest_mode(ingredient: str, property: str | None = None, top_k: int = 3) -> dict[str, Any]:
    core = model()
    name, vec = core.vector(ingredient)
    prop = _slug(property or "")
    scored = []
    for mode in core.modes:
        if prop and prop not in _slug(mode.property) and prop not in _slug(mode.label):
            continue
        scored.append(
            {
                "mode_id": mode.mode_id,
                "kind": mode.kind,
                "property": mode.property,
                "label": mode.label,
                "score": round(float(mode.pole @ vec), 4),
                "members": list(mode.members[:8]),
            }
        )
    scored.sort(key=lambda item: item["score"], reverse=True)
    return {"model": "Kaikaku/epicure-core", "ingredient": name, "modes": scored[: max(1, int(top_k))]}

def compare_on_axis(ingredient_a: str, ingredient_b: str, axis: str) -> dict[str, Any]:
    core = model()
    name_a, vec_a = core.vector(ingredient_a)
    name_b, vec_b = core.vector(ingredient_b)
    axis_name, axis_vec = core.resolve_direction(axis)
    score_a = float(vec_a @ axis_vec)
    score_b = float(vec_b @ axis_vec)
    return {
        "model": "Kaikaku/epicure-core",
        "axis": axis_name,
        "ingredient_a": {"name": name_a, "score": round(score_a, 4)},
        "ingredient_b": {"name": name_b, "score": round(score_b, 4)},
        "higher": name_a if score_a >= score_b else name_b,
        "difference": round(abs(score_a - score_b), 4),
    }

def morph(seed: str, target: str, angle_deg: float = 30.0, top_k: int = 5) -> dict[str, Any]:
    core = model()
    seed_name, seed_vec = core.vector(seed)
    target_name, target_vec = core.resolve_direction(target)
    target_vec = _unit(target_vec)
    tangent = target_vec - float(target_vec @ seed_vec) * seed_vec
    tangent_norm = float(np.linalg.norm(tangent))
    if tangent_norm < 1e-9:
        query = seed_vec
    else:
        theta = math.radians(float(angle_deg))
        query = _unit(math.cos(theta) * seed_vec + math.sin(theta) * (tangent / tangent_norm))
    return {
        "model": "Kaikaku/epicure-core",
        "seed": seed_name,
        "target": target_name,
        "angle_deg": angle_deg,
        "results": core.nearest(query, top_k=top_k, exclude={seed_name}),
    }

def cultural_profile(ingredient: str) -> dict[str, Any]:
    core = model()
    name, vec = core.vector(ingredient)
    scores = []
    for key, pole in core.supervised_poles.items():
        if key.startswith("cuisine:"):
            scores.append({"cuisine": key.split(":", 1)[1], "score": round(float(vec @ pole), 4)})
    scores.sort(key=lambda item: item["score"], reverse=True)
    return {"model": "Kaikaku/epicure-core", "ingredient": name, "cuisines": scores}


def _schema(properties: dict[str, dict[str, Any]], required: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": False,
    }


TOOLS: list[dict[str, Any]] = [
    {
        "name": "neighbors",
        "description": "Find nearest ingredients to a single seed in Kaikaku/epicure-core.",
        "inputSchema": _schema(
            {
                "ingredient": {"type": "string"},
                "top_k": {"type": "integer", "default": 5, "minimum": 1, "maximum": 20},
            },
            ["ingredient"],
        ),
    },
    {
        "name": "pairing_score",
        "description": "Calculate cosine compatibility between two ingredients.",
        "inputSchema": _schema(
            {"ingredient_a": {"type": "string"}, "ingredient_b": {"type": "string"}},
            ["ingredient_a", "ingredient_b"],
        ),
    },
    {
        "name": "find_pairings",
        "description": "Find Core-backed pairing candidates for one or more seed ingredients.",
        "inputSchema": _schema(
            {
                "ingredients": {
                    "anyOf": [
                        {"type": "string"},
                        {"type": "array", "items": {"type": "string"}, "minItems": 1},
                    ]
                },
                "is_vegan": {"type": "boolean", "default": False},
                "is_vegetarian": {"type": "boolean", "default": False},
            },
            ["ingredients"],
        ),
    },
    {
        "name": "closest_mode",
        "description": "Return the closest named Core modes for an ingredient.",
        "inputSchema": _schema(
            {
                "ingredient": {"type": "string"},
                "property": {"type": "string"},
                "top_k": {"type": "integer", "default": 3, "minimum": 1, "maximum": 20},
            },
            ["ingredient"],
        ),
    },
    {
        "name": "compare_on_axis",
        "description": "Compare two ingredients along a Core axis or mode.",
        "inputSchema": _schema(
            {
                "ingredient_a": {"type": "string"},
                "ingredient_b": {"type": "string"},
                "axis": {"type": "string"},
            },
            ["ingredient_a", "ingredient_b", "axis"],
        ),
    },
    {
        "name": "morph",
        "description": "Rotate a seed ingredient toward a Core target and return nearest ingredients.",
        "inputSchema": _schema(
            {
                "seed": {"type": "string"},
                "target": {"type": "string"},
                "angle_deg": {"type": "number", "default": 30.0},
                "top_k": {"type": "integer", "default": 5, "minimum": 1, "maximum": 20},
            },
            ["seed", "target"],
        ),
    },
    {
        "name": "cultural_profile",
        "description": "Score an ingredient against Core cuisine poles.",
        "inputSchema": _schema({"ingredient": {"type": "string"}}, ["ingredient"]),
    },
]

TOOL_HANDLERS = {
    "neighbors": neighbors,
    "pairing_score": pairing_score,
    "find_pairings": find_pairings,
    "closest_mode": closest_mode,
    "compare_on_axis": compare_on_axis,
    "morph": morph,
    "cultural_profile": cultural_profile,
}


def _write_message(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def _success(message_id: Any, result: dict[str, Any]) -> None:
    _write_message({"jsonrpc": "2.0", "id": message_id, "result": result})


def _error(message_id: Any, code: int, message: str) -> None:
    _write_message({"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}})


def _tool_result(payload: dict[str, Any], is_error: bool = False) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}],
        "isError": is_error,
    }


def _handle_request(request: dict[str, Any]) -> None:
    method = request.get("method")
    message_id = request.get("id")
    params = request.get("params") or {}

    if method == "notifications/initialized":
        return
    if message_id is None:
        return

    try:
        if method == "initialize":
            _success(
                message_id,
                {
                    "protocolVersion": params.get("protocolVersion", "2024-11-05"),
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": SERVER_NAME, "version": "1.0.0"},
                    "instructions": SERVER_INSTRUCTIONS,
                },
            )
        elif method == "tools/list":
            _success(message_id, {"tools": TOOLS})
        elif method == "tools/call":
            name = params.get("name")
            arguments = params.get("arguments") or {}
            handler = TOOL_HANDLERS.get(name)
            if handler is None:
                _error(message_id, -32601, f"Unknown tool: {name}")
                return
            _success(message_id, _tool_result(handler(**arguments)))
        elif method == "ping":
            _success(message_id, {})
        else:
            _error(message_id, -32601, f"Method not found: {method}")
    except Exception as exc:
        _success(message_id, _tool_result({"error": str(exc)}, is_error=True))


def run_stdio_server() -> None:
    print("Starting Epicure Core MCP server on stdio.", file=sys.stderr)
    model()
    print("Epicure Core MCP server successfully loaded and running on stdio.", file=sys.stderr)
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            _handle_request(json.loads(line))
        except json.JSONDecodeError as exc:
            _error(None, -32700, f"Parse error: {exc}")


if __name__ == "__main__":
    run_stdio_server()
