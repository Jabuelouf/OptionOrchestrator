from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


@dataclass
class LLMConfig:
    # provider must be "local_transformers" for this implementation
    provider: str
    model_name: str  # HF repo id or local path
    adapter_name: Optional[str] = None  # Optional PEFT adapter repo or local path
    adapter_subfolder: Optional[str] = None  # Optional checkpoint directory
    temperature: float = 0.2
    max_tokens: int = 800

    # Optional generation/config knobs
    device: str = "auto"  # "auto", "cuda", "cpu", "mps"
    dtype: str = "auto"  # "auto", "float16", "bfloat16", "float32"
    load_in_4bit: bool = False  # requires bitsandbytes
    load_in_8bit: bool = False  # requires bitsandbytes
    trust_remote_code: bool = False
    use_chat_template: bool = True  # uses tokenizer.apply_chat_template if available


def _resolve_dtype(dtype: str):
    if dtype == "float16":
        return torch.float16
    if dtype == "bfloat16":
        return torch.bfloat16
    if dtype == "float32":
        return torch.float32
    return None  # "auto" -> let HF decide


class LLMClient:
    """Local Hugging Face Transformers inference client."""

    def __init__(self, cfg: LLMConfig):
        self.cfg = cfg
        if cfg.provider not in ("local_transformers", "transformers"):
            raise ValueError("provider must be 'local_transformers' or 'transformers'")

        torch_dtype = _resolve_dtype(cfg.dtype)

        model_kwargs: Dict[str, Any] = dict(
            torch_dtype=torch_dtype,
            trust_remote_code=cfg.trust_remote_code,
            device_map="auto" if cfg.device == "auto" else None,
        )

        # Bitsandbytes loading flags (optional)
        if cfg.load_in_4bit:
            model_kwargs["load_in_4bit"] = True
        if cfg.load_in_8bit:
            model_kwargs["load_in_8bit"] = True

        token = os.getenv("HF_TOKEN") or None
        self.tokenizer = AutoTokenizer.from_pretrained(
            cfg.model_name,
            trust_remote_code=cfg.trust_remote_code,
            token=token,
        )
        self.model = AutoModelForCausalLM.from_pretrained(cfg.model_name, token=token, **model_kwargs)
        if cfg.adapter_name:
            adapter_kwargs: Dict[str, Any] = {"token": token}
            if cfg.adapter_subfolder:
                adapter_kwargs["subfolder"] = cfg.adapter_subfolder
            self.model = PeftModel.from_pretrained(
                self.model,
                cfg.adapter_name,
                **adapter_kwargs,
            )

        # If device_map not used, move model
        if cfg.device != "auto":
            self.model.to(cfg.device)

        self.model.eval()

        # Some tokenizers need an explicit pad token
        if self.tokenizer.pad_token_id is None and self.tokenizer.eos_token_id is not None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

    @torch.inference_mode()
    def generate_text(self, system: str, user: str) -> str:
        temperature = float(self.cfg.temperature)
        do_sample = temperature > 0.0

        if self.cfg.use_chat_template and hasattr(self.tokenizer, "apply_chat_template"):
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]
            input_ids = self.tokenizer.apply_chat_template(
                messages,
                add_generation_prompt=True,
                return_tensors="pt"
            )
            input_ids = input_ids.to(self.model.device)
        else:
            prompt = f"<SYSTEM>\n{system}\n</SYSTEM>\n<USER>\n{user}\n</USER>\n<ASSISTANT>\n"
            enc = self.tokenizer(prompt, return_tensors="pt")
            input_ids = enc["input_ids"].to(self.model.device)

        gen = self.model.generate(
            input_ids=input_ids,
            max_new_tokens=int(self.cfg.max_tokens),
            do_sample=do_sample,
            temperature=temperature if do_sample else None,
            top_p=1.0,
            pad_token_id=self.tokenizer.pad_token_id,
            eos_token_id=self.tokenizer.eos_token_id,
        )

        out_ids = gen[0][input_ids.shape[-1]:]
        text = self.tokenizer.decode(out_ids, skip_special_tokens=True)
        return text.strip()
