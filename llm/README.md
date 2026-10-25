# Options-domain LLM

The LLM is a first-class component of Option Orchestrator. It proposes structured position-rescue strategies from normalized market and account context. Its output is advisory: deterministic validators can reject a proposal, and a human remains responsible for any action.

## Model

- Base model: `google/gemma-2-9b-it`
- Adaptation: parameter-efficient LoRA fine-tuning
- Deployment: 4-bit quantized inference on a RunPod serverless worker
- Runtime contract: JSON strategy candidates consumed by `backend/orchestrator_layer/knowledge_gateway.py`

The trained adapter is referenced by `HF_ADAPTER_ID`. Model weights and adapters are deliberately not stored in Git.

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

See [LLM architecture](../docs/LLM_ARCHITECTURE.md) for the complete lifecycle.
