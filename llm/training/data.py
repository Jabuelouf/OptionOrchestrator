"""Load instruction-tuning data without embedding datasets in the repository."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from datasets import Dataset

from . import config


def load_trading_dataset(file_path: str | None = None) -> Dataset:
    path = file_path or config.DATA_PATH
    if not path.startswith("gs://") and not Path(path).is_file():
        raise FileNotFoundError(
            f"Training dataset not found: {path}. Provide LLM_TRAIN_DATA or pass file_path explicitly."
        )

    frame = pd.read_csv(path)
    required = {"question", "answer"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Training data is missing columns: {sorted(missing)}")

    dataset = Dataset.from_pandas(frame)

    def format_prompt(example: dict) -> dict[str, str]:
        return {"text": f"User: {example['question']}\nAssistant: {example['answer']}"}

    return dataset.map(format_prompt)
