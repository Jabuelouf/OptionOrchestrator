from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def read_jsonl(path: str):
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line=line.strip()
        if line:
            yield json.loads(line)

def simple_check(answer: str, checklist: list[str]) -> dict:
    a = answer.lower()
    hits=[]
    misses=[]
    for item in checklist:
        key = item.lower()
        # naive: require at least one keyword token from the checklist item
        tokens=[t for t in re.split(r"[^a-z0-9]+", key) if len(t)>3]
        ok = any(t in a for t in tokens[:4]) if tokens else False
        (hits if ok else misses).append(item)
    score = 10 * (len(hits) / max(1, len(checklist)))
    return {"score_proxy": round(score,2), "hits": hits, "misses": misses}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gates", required=True, help="JSONL with gold_checklist")
    ap.add_argument("--answers", default=None, help="Optional JSON mapping qnum->answer")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    answers = {}
    if args.answers:
        answers = json.loads(Path(args.answers).read_text(encoding="utf-8"))

    report = {"generated_at": str(Path(args.gates).resolve()), "results": []}

    for row in read_jsonl(args.gates):
        qid = f"{row.get('level', 0)}_{row.get('qnum', 0)}"
        ans = answers.get(qid, "")
        res = {
            "level": row.get("level"),
            "qnum": row.get("qnum"),
            "question": row.get("question"),
            "gold_checklist": row.get("gold_checklist"),
            "answer": ans,
        }
        if ans:
            res.update(simple_check(ans, row.get("gold_checklist", [])))
        else:
            res.update({"score_proxy": None, "hits": [], "misses": row.get("gold_checklist", [])})
        report["results"].append(res)

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote eval report: {args.out}")

if __name__ == "__main__":
    main()
