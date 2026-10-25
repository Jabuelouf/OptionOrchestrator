"""Knowledge-layer gateway for RunPod-backed strategy prompts."""

import os
import time
from typing import Optional

import requests


class KnowledgeGateway:
    """Thin client for querying the deployed knowledge model."""

    JSON_CONTRACT = (
        "Return ONLY valid JSON (no markdown, no code fences) matching exactly one of:\n"
        '1) {"candidates":[{"action":string,"rationale":string,"net_cost":number|null,"risk_rating":string}]}\n'
        '2) [{"action":string,"rationale":string,"net_cost":number|null,"risk_rating":string}]\n'
        "Constraints:\n"
        "- Provide exactly 2 candidates.\n"
        '- "risk_rating" should be one of: low|moderate|high.\n'
        "- net_cost should be <= max_loss_tolerance when provided.\n"
    )

    def __init__(
        self,
        endpoint_id: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout_seconds: int = 25,
    ) -> None:
        self.endpoint_id = endpoint_id or os.environ.get("KNOWLEDGE_ENDPOINT_ID", "")
        self.api_key = api_key or os.environ.get("RUNPOD_API_KEY", "")
        self.timeout_seconds = timeout_seconds
        self.base_url = f"https://api.runpod.ai/v2/{self.endpoint_id}" if self.endpoint_id else ""

    def query_rescue_strategies(self, symbol: str, spot_price: float, max_loss_tolerance: float) -> Optional[str]:
        """Return strategy text from knowledge model, or None on unavailability."""
        if not self.api_key or not self.endpoint_id:
            return None

        question = (
            f"Ticker: {symbol}. Spot price: {spot_price:.2f}. "
            f"Max tolerable additional loss: {max_loss_tolerance:.2f}. "
            "Provide 2 practical rescue choices for a stressed short-options position. "
            "For each choice include action, rationale, and risk level.\n\n"
            f"{self.JSON_CONTRACT}"
        )

        payload = {
            "input": {
                "messages": [{"role": "user", "content": question}],
                "max_tokens": 250,
                "max_new_tokens": 250,
                "temperature": 0.3,
            }
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        try:
            run_resp = requests.post(
                f"{self.base_url}/run",
                headers=headers,
                json=payload,
                timeout=15,
            )
            run_resp.raise_for_status()
            job_id = run_resp.json().get("id")
            if not job_id:
                return None

            start = time.time()
            while (time.time() - start) < self.timeout_seconds:
                status_resp = requests.get(
                    f"{self.base_url}/status/{job_id}",
                    headers=headers,
                    timeout=15,
                )
                status_resp.raise_for_status()
                data = status_resp.json()
                status = data.get("status")
                if status == "COMPLETED":
                    return self._extract_text(data.get("output", {}))
                if status in ("FAILED", "CANCELLED"):
                    return None
                time.sleep(1.5)
        except requests.RequestException:
            return None

        return None

    @staticmethod
    def _extract_text(output: object) -> str:
        if isinstance(output, dict):
            if isinstance(output.get("response"), str):
                return output["response"]
            if isinstance(output.get("generated_text"), str):
                return output["generated_text"]
            return str(output)
        return str(output)
