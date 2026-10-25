from __future__ import annotations

import sys
from pathlib import Path

# Pytest 8 default import mode can avoid prepending the project root to sys.path,
# which breaks local imports like `import analysis_layer`.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

