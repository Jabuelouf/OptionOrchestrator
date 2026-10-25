from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LLM_ROOT = REPO_ROOT / "llm"


def test_public_llm_assets_are_present_and_parseable() -> None:
    expected = [
        LLM_ROOT / "training" / "train.py",
        LLM_ROOT / "inference" / "handler.py",
        LLM_ROOT / "evaluation" / "prompts" / "analyst_system.txt",
        LLM_ROOT / "evaluation" / "schemas" / "snapshot.schema.json",
        LLM_ROOT / "evaluation" / "schemas" / "plan.schema.json",
    ]
    assert all(path.is_file() and path.stat().st_size > 0 for path in expected)

    for schema_name in ("snapshot.schema.json", "plan.schema.json"):
        schema_path = LLM_ROOT / "evaluation" / "schemas" / schema_name
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        assert schema.get("type") == "object"


def test_llm_prompts_define_structured_and_safe_behavior() -> None:
    prompt_root = LLM_ROOT / "evaluation" / "prompts"
    system_prompt = (prompt_root / "analyst_system.txt").read_text(encoding="utf-8")
    rescue_prompt = (prompt_root / "rescue_prompt.txt").read_text(encoding="utf-8")

    assert "do NOT place trades" in system_prompt
    assert "{{SNAPSHOT_JSON}}" in rescue_prompt
    assert "JSON" in rescue_prompt


def test_no_model_artifacts_are_tracked_in_llm_tree() -> None:
    forbidden_suffixes = {".bin", ".ckpt", ".gguf", ".onnx", ".pt", ".pth", ".safetensors"}
    tracked_candidates = [path for path in LLM_ROOT.rglob("*") if path.is_file()]
    assert not [path for path in tracked_candidates if path.suffix.lower() in forbidden_suffixes]
