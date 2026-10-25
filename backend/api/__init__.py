"""API layer package.

This package explicitly loads repo-root `.env` to support a single env source-of-truth
across workstations.
"""

from shared.env import load_root_env

load_root_env()
