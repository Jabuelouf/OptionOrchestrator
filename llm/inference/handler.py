"""RunPod serverless handler for the options-domain Gemma adapter."""

from __future__ import annotations

import os
from typing import Any

import runpod
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

BASE_MODEL_ID = os.getenv("HF_BASE_MODEL_ID", "google/gemma-2-9b-it")
ADAPTER_ID = os.getenv("HF_ADAPTER_ID", "")
ADAPTER_SUBFOLDER = os.getenv("HF_ADAPTER_SUBFOLDER", "").strip()

model = None
tokenizer = None


def load_model() -> None:
    global model, tokenizer
    if not ADAPTER_ID:
        raise RuntimeError("HF_ADAPTER_ID must identify the trained LoRA adapter")

    token = os.getenv("HF_TOKEN") or None
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    base = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_ID,
        quantization_config=quantization,
        device_map="auto",
        token=token,
    )
    adapter_kwargs = {"token": token}
    if ADAPTER_SUBFOLDER:
        adapter_kwargs["subfolder"] = ADAPTER_SUBFOLDER
    model = PeftModel.from_pretrained(base, ADAPTER_ID, **adapter_kwargs)
    model.eval()

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, token=token)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token


def generate(job_input: dict[str, Any]) -> str:
    global model, tokenizer
    if model is None or tokenizer is None:
        load_model()

    messages = job_input.get("messages")
    if not isinstance(messages, list) or not messages:
        raise ValueError("input.messages must be a non-empty list")

    normalized = [
        {
            "role": "model" if item.get("role") == "assistant" else item.get("role", "user"),
            "content": str(item.get("content", "")),
        }
        for item in messages
        if isinstance(item, dict)
    ]
    prompt = tokenizer.apply_chat_template(normalized, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    temperature = max(float(job_input.get("temperature", 0.2)), 0.0)

    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=min(int(job_input.get("max_new_tokens", 512)), 2048),
            do_sample=temperature > 0,
            temperature=temperature if temperature > 0 else None,
            top_p=0.9 if temperature > 0 else None,
            repetition_penalty=1.1,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )

    generated_tokens = outputs[0][inputs["input_ids"].shape[-1] :]
    return tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()


def handler(job: dict[str, Any]) -> dict[str, Any]:
    try:
        return {
            "response": generate(job.get("input", {})),
            "base_model": BASE_MODEL_ID,
            "adapter": ADAPTER_ID,
            "adapter_subfolder": ADAPTER_SUBFOLDER or None,
        }
    except Exception as error:
        return {"error": str(error)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
