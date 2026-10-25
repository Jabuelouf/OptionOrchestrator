# Option Advisor Gemma 2 9B — model card

## Overview

Option Advisor is the strategy-generation component of Option Orchestrator. It
is a parameter-efficient adaptation of `google/gemma-2-9b-it` intended to turn a
normalized options-position snapshot into a structured rescue plan. Its output
is advisory and always passes through schema validation, deterministic risk
rules, and human review.

The adapter is stored in the private Hugging Face repository
`jabuelouf/Option-Advisor-Gemma-2-9b`. The public Git repository contains the
training and serving source, prompts, schemas, and synthetic evaluation fixtures,
but not model weights or proprietary training material.

## Model details

| Property | Value |
| --- | --- |
| Base model | `google/gemma-2-9b-it` |
| Method | Supervised fine-tuning with 4-bit QLoRA / PEFT |
| LoRA rank / alpha / dropout | 64 / 128 / 0.05 |
| Target modules | `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj` |
| Selected checkpoint | `checkpoint-1050` |
| Selection criterion | Minimum recorded validation loss |
| Serving | 4-bit inference through a RunPod serverless worker |

## Checkpoint selection

The training state names checkpoint 1050 as the best model checkpoint with a
validation loss of `1.1806100607`. The final retained checkpoint, 1300, recorded
`1.1987503767`. The deployment configuration selects checkpoint 1050 while
retaining checkpoint 1300 for comparative evaluation.

This difference is modest, and validation loss is not a complete measure of
domain quality. A release decision should also compare structured-output success,
options-mechanics correctness, unsupported claims, risk-rule rejection rate, and
human preference on a held-out scenario set.

## Intended use

- Generate candidate adjustments for an existing options position.
- Explain mechanics, trade-offs, triggers, and exit conditions.
- Produce machine-readable plans for deterministic downstream verification.
- Support research, education, and portfolio demonstrations.

## Out-of-scope use

- Autonomous trading or order execution.
- Personalized financial advice or fiduciary decision-making.
- Guaranteeing profitability, fills, liquidity, or future market behavior.
- Processing brokerage secrets or unredacted personal account data.

## Data and provenance

Training used curated options-domain question-and-answer records. Raw source
documents, intermediate extracted text, and generated datasets are excluded from
the public repository to avoid distributing licensed material, personal data, or
credentials. Anyone reproducing the training pipeline must use material they are
authorized to process and should document its provenance and license separately.

## Evaluation and safety

The repository separates probabilistic generation from deterministic
verification. Public evaluation assets cover:

1. Input snapshot schema validation.
2. Output plan schema validation.
3. Rejection of undefined-risk or oversized plans.
4. Required triggers, exits, and explicit guardrails.
5. Reproducible synthetic regression cases.

These checks validate contracts and safety properties; they do not establish
real-world trading performance. The governing rule is: **the model proposes,
rules validate, and a human decides.**

## Known limitations

- Model output can be incorrect, incomplete, stale, or overconfident.
- Validation loss may not correlate with financial reasoning quality.
- Market regimes and available contracts can differ from training examples.
- Deterministic validation reduces risk but cannot prove a proposal is suitable.
- Reproducing hosted inference requires access to the gated Gemma base model and
  an authorized adapter repository, or a compatible replacement adapter.
