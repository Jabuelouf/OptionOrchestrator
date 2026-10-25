from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot", required=True, help="Path to snapshot JSON")
    ap.add_argument("--schema", default="schemas/snapshot.schema.json")
    args = ap.parse_args()

    snapshot = json.loads(Path(args.snapshot).read_text(encoding="utf-8"))
    schema = json.loads(Path(args.schema).read_text(encoding="utf-8"))

    v = Draft7Validator(schema)
    errors = sorted(v.iter_errors(snapshot), key=lambda e: e.path)

    if errors:
        print("SNAPSHOT INVALID:")
        for e in errors:
            print(f"- {list(e.path)}: {e.message}")
        sys.exit(2)

    print("SNAPSHOT OK")

if __name__ == "__main__":
    main()
