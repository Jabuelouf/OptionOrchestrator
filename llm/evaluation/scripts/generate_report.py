from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", required=True)
    args = ap.parse_args()

    rep = json.loads(Path(args.report).read_text(encoding="utf-8"))
    scores=[r["score_proxy"] for r in rep["results"] if r["score_proxy"] is not None]
    by_level={}
    for r in rep["results"]:
        if r["score_proxy"] is None: 
            continue
        by_level.setdefault(r["level"], []).append(r["score_proxy"])

    out = {
        "n_scored": len(scores),
        "avg_score_proxy": round(mean(scores),2) if scores else None,
        "avg_by_level": {str(k): round(mean(v),2) for k,v in by_level.items()}
    }
    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()
