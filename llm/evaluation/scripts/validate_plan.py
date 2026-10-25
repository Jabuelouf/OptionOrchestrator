from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator


def load_json(path: str):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--plan_schema", default="schemas/plan.schema.json")
    ap.add_argument("--risk_cfg", default="configs/risk_limits.yaml")
    args = ap.parse_args()

    snapshot = load_json(args.snapshot)
    plan_text = Path(args.plan).read_text(encoding="utf-8").strip()

    # Plan may be wrapped; try to parse JSON strictly
    try:
        plan = json.loads(plan_text)
    except Exception as e:
        print("PLAN INVALID JSON:", e)
        sys.exit(2)

    schema = load_json(args.plan_schema)
    v = Draft7Validator(schema)
    errors = sorted(v.iter_errors(plan), key=lambda e: e.path)
    if errors:
        print("PLAN SCHEMA FAIL:")
        for e in errors:
            print(f"- {list(e.path)}: {e.message}")
        sys.exit(2)

    # Deterministic guardrails
    rl = snapshot.get("risk_limits", {})
    allow_undef = bool(rl.get("allow_undefined_risk", False))
    max_mult = float(rl.get("max_contract_multiplier", 2.0))

    # 1) Reject undefined risk orders if not allowed
    for opt in plan.get("options", []):
        for o in opt.get("orders", []):
            if (not allow_undef) and (not o.get("defined_risk", True)):
                print("PLAN REJECTED: undefined-risk order present but not allowed.")
                sys.exit(3)

    # 2) Reject position-size increases beyond multiplier (simple heuristic)
    #    Compare total qty in plan orders vs current position legs
    cur_qty = sum(abs(l.get("qty",0)) for l in snapshot["position"]["legs"] if l["type"] in ("call","put"))
    plan_qty = sum(abs(o.get("qty",0)) for opt in plan.get("options",[]) for o in opt.get("orders",[]) if o.get("leg_type") in ("call","put"))
    if cur_qty > 0 and (plan_qty / cur_qty) > max_mult:
        print(f"PLAN REJECTED: contract multiplier {plan_qty/cur_qty:.2f} exceeds max {max_mult:.2f}")
        sys.exit(3)

    # 3) Require triggers/guardrails when action OK
    if plan.get("action") == "OK":
        if not plan.get("risk_guardrails"):
            print("PLAN REJECTED: missing risk_guardrails")
            sys.exit(3)
        for opt in plan.get("options", []):
            if not opt.get("triggers"):
                print("PLAN REJECTED: option missing triggers")
                sys.exit(3)

    print("PLAN OK")

if __name__ == "__main__":
    main()
