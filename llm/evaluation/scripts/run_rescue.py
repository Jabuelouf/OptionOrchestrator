from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.llm_client import LLMClient, LLMConfig
from scripts.utils import load_yaml


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--system_prompt", default="prompts/analyst_system.txt")
    ap.add_argument("--user_prompt", default="prompts/rescue_prompt.txt")
    ap.add_argument("--model_cfg", default="configs/model.yaml")
    args = ap.parse_args()

    cfg = load_yaml(args.model_cfg)["advisor"]
    client = LLMClient(LLMConfig(**cfg))

    system = Path(args.system_prompt).read_text(encoding="utf-8")
    tmpl = Path(args.user_prompt).read_text(encoding="utf-8")

    snap = json.loads(Path(args.snapshot).read_text(encoding="utf-8"))
    user = tmpl.replace("{{SNAPSHOT_JSON}}", json.dumps(snap, ensure_ascii=False))

    text = client.generate_text(system=system, user=user)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(text, encoding="utf-8")
    print(f"Wrote raw plan to: {args.out}")

if __name__ == "__main__":
    main()
