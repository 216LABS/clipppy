"""GPU worker entrypoint. Provider selection stays open until the benchmark in the DevOps addendum."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "media" / "src"))

from clipppy_media.worker import health


def main() -> None:
    print(health())


if __name__ == "__main__":
    main()
