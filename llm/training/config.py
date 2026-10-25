"""Environment-driven training configuration."""

from __future__ import annotations

import os

BASE_MODEL_ID = os.getenv("HF_BASE_MODEL_ID", "google/gemma-2-9b-it")
DATA_PATH = os.getenv("LLM_TRAIN_DATA", "data/train_qa_pairs.csv")
OUTPUT_DIR = os.getenv("LLM_OUTPUT_DIR", "artifacts/gemma-2-9b-options-lora")

MAX_LENGTH = int(os.getenv("LLM_MAX_LENGTH", "2048"))
EPOCHS = float(os.getenv("LLM_EPOCHS", "3"))
BATCH_SIZE = int(os.getenv("LLM_BATCH_SIZE", "1"))
GRADIENT_ACCUMULATION_STEPS = int(os.getenv("LLM_GRADIENT_ACCUMULATION_STEPS", "4"))
LEARNING_RATE = float(os.getenv("LLM_LEARNING_RATE", "0.0002"))

LORA_R = int(os.getenv("LLM_LORA_R", "64"))
LORA_ALPHA = int(os.getenv("LLM_LORA_ALPHA", "128"))
LORA_DROPOUT = float(os.getenv("LLM_LORA_DROPOUT", "0.05"))
