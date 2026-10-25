# Options-domain LLM

The LLM is a first-class component of Option Orchestrator. It proposes structured position-rescue strategies from normalized market and account context. Its output is advisory: deterministic validators can reject a proposal, and a human remains responsible for any action.

## Model

- Base model: `google/gemma-2-9b-it`
- Adapter: `jabuelouf/Option-Advisor-Gemma-2-9b` (private)
- Adaptation: 4-bit QLoRA with rank 64, alpha 128, and dropout 0.05
- Target modules: attention projections plus gated-MLP projections
- Selected artifact: `checkpoint-1050` (`eval_loss = 1.18061`)
- Deployment: 4-bit quantized inference on a RunPod serverless worker
- Runtime contract: JSON strategy candidates consumed by `backend/orchestrator_layer/knowledge_gateway.py`

The trained adapter is referenced by `HF_ADAPTER_ID`, and the selected checkpoint
by `HF_ADAPTER_SUBFOLDER`. Model weights and adapters are deliberately not stored
in Git. Checkpoint 1300 remains available for task-level comparison; checkpoint
1050 is the configured default because the trainer recorded it as the best
validation checkpoint.

## Layout

```text
llm/
├── training/       Dataset loading and QLoRA/SFT training
├── inference/      RunPod serverless worker and container definition
└── evaluation/     Prompts, JSON schemas, deterministic gates, and eval utilities
```

## Safety boundary

```text
normalized snapshot → domain LLM → structured plan → schema checks → risk validator → human review
```

The model never receives brokerage credentials and never submits orders. Missing model credentials or endpoint availability activates the application's deterministic offline fallback.

## Data and artifacts

Raw books, extracted text, generated datasets, checkpoints, and adapters are excluded from this repository. Only source code, schemas, prompts, and synthetic examples are public. Before reproducing training, use source material you are licensed to process and document dataset provenance in the resulting model card.

See the [model card](../docs/MODEL_CARD.md) and
[LLM architecture](../docs/LLM_ARCHITECTURE.md) for the complete lifecycle.
