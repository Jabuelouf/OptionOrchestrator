FROM runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04

WORKDIR /app
COPY llm/inference/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY llm/inference/handler.py ./handler.py

ENV HF_HOME=/runpod-volume/.cache/huggingface
CMD ["python", "-u", "handler.py"]
