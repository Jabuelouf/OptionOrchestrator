"""Supervised fine-tuning entrypoint."""

from __future__ import annotations

from trl import SFTConfig, SFTTrainer

from . import config
from .data import load_trading_dataset
from .model import get_model_and_tokenizer


def train() -> None:
    dataset = load_trading_dataset()
    model, tokenizer, lora = get_model_and_tokenizer()

    arguments = SFTConfig(
        output_dir=config.OUTPUT_DIR,
        dataset_text_field="text",
        max_length=config.MAX_LENGTH,
        packing=True,
        num_train_epochs=config.EPOCHS,
        per_device_train_batch_size=config.BATCH_SIZE,
        gradient_accumulation_steps=config.GRADIENT_ACCUMULATION_STEPS,
        learning_rate=config.LEARNING_RATE,
        bf16=True,
        fp16=False,
        logging_steps=10,
        save_strategy="epoch",
        optim="paged_adamw_8bit",
        report_to="tensorboard",
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=lora,
        processing_class=tokenizer,
        args=arguments,
    )
    trainer.train()
    trainer.model.save_pretrained(config.OUTPUT_DIR)


if __name__ == "__main__":
    train()
