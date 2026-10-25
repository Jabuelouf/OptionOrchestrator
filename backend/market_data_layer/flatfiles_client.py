"""Massive flatfiles S3 client for historical market data ingestion."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

try:
    import boto3
except Exception:  # pragma: no cover - optional runtime dependency
    boto3 = None


class MassiveFlatFilesClient:
    """Read-only client for Massive flatfiles bucket."""

    def __init__(self) -> None:
        self.endpoint = (
            os.environ.get("MASSIVE_FLATFILES_ENDPOINT")
            or os.environ.get("MASSIVE_S3_ENDPOINT")
            or "https://files.massive.com"
        )
        self.bucket = (
            os.environ.get("MASSIVE_FLATFILES_BUCKET")
            or os.environ.get("MASSIVE_S3_BUCKET")
            or "flatfiles"
        )
        self.access_key = (
            os.environ.get("MASSIVE_FLATFILES_ACCESS_KEY_ID")
            or os.environ.get("MASSIVE_S3_ACCESS_KEY_ID")
            or ""
        )
        self.secret_key = (
            os.environ.get("MASSIVE_FLATFILES_SECRET_ACCESS_KEY")
            or os.environ.get("MASSIVE_S3_SECRET_ACCESS_KEY")
            or ""
        )

    def _client(self):
        if boto3 is None:
            raise RuntimeError("boto3 is required for Massive flatfiles access")
        if not self.access_key or not self.secret_key:
            raise RuntimeError("Missing Massive flatfiles credentials")
        return boto3.session.Session(
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
        ).client("s3", endpoint_url=self.endpoint)

    def list_keys(self, prefix: str, limit: int = 200) -> List[str]:
        """List object keys under a prefix."""
        client = self._client()
        response = client.list_objects_v2(Bucket=self.bucket, Prefix=prefix, MaxKeys=max(1, limit))
        return [obj["Key"] for obj in response.get("Contents", [])]

    def download_key(self, key: str, destination: str) -> Path:
        """Download a single key to local filesystem."""
        client = self._client()
        out = Path(destination)
        out.parent.mkdir(parents=True, exist_ok=True)
        client.download_file(self.bucket, key, str(out))
        return out
