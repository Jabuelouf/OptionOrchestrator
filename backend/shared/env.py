"""Environment loading helpers for the backend runtime.

The repository-root `.env` file is the single source of local configuration.
"""

from __future__ import annotations

from pathlib import Path


def load_root_env() -> None:
    """Load repo-root `.env` if present.

    - Uses explicit path so we don't accidentally load nested `.env` files.
    - Does not override variables already present in the environment.
    """

    # Import locally to keep python-dotenv optional for non-local contexts.
    try:
        from dotenv import load_dotenv  # type: ignore
    except Exception:
        return

    repo_root = Path(__file__).resolve().parents[2]
    dotenv_path = repo_root / ".env"
    if not dotenv_path.exists():
        return

    load_dotenv(dotenv_path=dotenv_path, override=False)

