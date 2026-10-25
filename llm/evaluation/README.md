# LLM evaluation and verification

This harness keeps model generation separate from deterministic verification.

1. Validate a normalized market snapshot against `schemas/snapshot.schema.json`.
2. Generate a rescue plan with the system and rescue prompts.
3. Validate the returned JSON against `schemas/plan.schema.json`.
4. Reject undefined-risk plans, excessive contract multiplication, and missing triggers.
5. Run hard-gate regression cases and produce a machine-readable report.

Run commands from this directory after installing `requirements.txt`:

```bash
python scripts/validate_snapshot.py --snapshot scripts/example_snapshot.json
python scripts/validate_plan.py --snapshot scripts/example_snapshot.json --plan scripts/example_plan.json
```

Generation requires access to the configured base model and, when applicable, a LoRA adapter. Deterministic validation does not require model access.
