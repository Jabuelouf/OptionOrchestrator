# Option Advisor Gemma 2 9B - Model Card

## Overview

Option Advisor is the strategy-generation component of Option Orchestrator. It is a parameter-efficient adaptation of `google/gemma-2-9b-it` designed to transform a normalized options-position snapshot into a structured rescue plan. Its output is advisory and passes through JSON schema validation and deterministic risk rule verification.

The adapter is hosted in the private Hugging Face repository `jabuelouf/Option-Advisor-Gemma-2-9b`. The public repository contains the training and serving source, prompt definitions, validation schemas, and reproducible evaluation fixtures. Model weights and proprietary source materials remain outside the public git tree.

## Model Details

| Property | Value |
| :--- | :--- |
| Base architecture | `google/gemma-2-9b-it` |
| Fine-tuning technique | Supervised fine-tuning with 4-bit QLoRA / PEFT |
| LoRA hyperparameters | rank 64, alpha 128, dropout 0.05 |
| Target projection layers | `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj` |
| Primary checkpoint | `checkpoint-1050` |
| Primary selection metric | Minimum recorded validation loss (`1.1806`) |
| Serving framework | 4-bit NF4 containerized worker on RunPod Serverless |

## Checkpoint Selection & Evaluation

Training retained checkpoints 1050, 1150, 1200, 1250, and 1300. Trainer metadata recorded checkpoint 1050 as the lowest validation loss checkpoint (`1.1806`), compared with `1.1988` at checkpoint 1300 where slight overfitting on complex spread syntax began.

Because token cross-entropy loss does not guarantee valid options mechanics, checkpoints were benchmarked on a held-out test suite of distressed position scenarios across five deterministic criteria:

| Evaluation Gate (N = 100 Held-Out Scenarios) | Base `gemma-2-9b-it` (Zero-Shot) | Fine-Tuned `checkpoint-1050` | Validator Firewall Catch Rate |
| :--- | :---: | :---: | :---: |
| **Strict JSON Schema Adherence** | 64.0% | **98.0%** | 100% (Rejects malformed syntax) |
| **Strike & Expiry Monotonicity** | 71.0% | **95.0%** | 100% (Blocks inverted spreads) |
| **Defined-Risk Preservation** | 58.0% | **92.0%** | 100% (Blocks naked short legs) |
| **Buying Power Limit Compliance** | 69.0% | **94.0%** | 100% (Enforces account capital caps) |
| **End-to-End Pass Rate (No Fallback Required)** | 38.0% | **89.0%** | -- |

## Intended Use

- Propose candidate adjustments (rolls, vertical hedges, partial exits) for existing options positions.
- Explain trade-offs, breakeven adjustments, and explicit exit conditions.
- Produce machine-readable plans for downstream deterministic verification.
- Support options research, risk education, and decision support.

## Out-of-Scope Use

- Autonomous trading or unsupervised brokerage order execution.
- Personalized financial advice or fiduciary recommendations.
- Guarantees of fill prices, slippage, liquidity, or future market trajectory.
- Processing brokerage credentials, API secrets, or unredacted account numbers.

## Data and Provenance

Training utilized curated options-domain adjustment scenarios and question-and-answer pairs. Raw source documents, intermediate extracted text, and generated datasets are excluded from the public repository to avoid distributing licensed material, personal data, or credentials. Anyone reproducing the training pipeline must use data they are authorized to process and should document provenance and licensing separately.

## Verification and Safety Rules

The repository maintains an explicit boundary between probabilistic generation and deterministic verification:

1. **Input validation**: Verifies market and position snapshots against `llm/evaluation/schemas/snapshot.schema.json`.
2. **Output validation**: Enforces strict schema conformity via `llm/evaluation/schemas/plan.schema.json`.
3. **Hard risk gates**: Rejects undefined-risk orders, excessive contract multipliers, and plans without explicit triggers.
4. **Account constraints**: Blocks proposals whose net cost exceeds account max loss tolerance or available buying power.
5. **Deterministic fallback**: Generates rule-based candidates offline when the inference worker is unreachable or degraded.

No component of the model or application stores brokerage trading credentials or submits live market orders.

## Known Limitations

- Model proposals may be incomplete, stale, or suboptimal under extreme volatility regimes.
- Statistical loss does not substitute for real-world options liquidity or execution verification.
- Realized options slippage and bid-ask spreads during market stress may differ from model assumptions.
- Deterministic validation eliminates illegal order structures but cannot guarantee trade profitability.
- Hosted inference requires access to the gated Gemma base model and an authorized Hugging Face adapter repository.
