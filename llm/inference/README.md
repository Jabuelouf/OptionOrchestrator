# RunPod inference

Build from the repository root:

```bash
docker build -f llm/inference/Dockerfile -t option-orchestrator-llm .
```

The worker requires:

- `HF_ADAPTER_ID`: Hugging Face repository or mounted path containing the trained LoRA adapter
- `HF_TOKEN`: required when the base model or adapter is gated/private
- `HF_BASE_MODEL_ID`: optional override; defaults to `google/gemma-2-9b-it`

The API accepts RunPod jobs containing `input.messages`, `max_new_tokens`, and `temperature`. Only newly generated response text is returned; prompts and complete decoded sequences are not included in responses.
