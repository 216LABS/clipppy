import json
from pathlib import Path

from clipppy_media.models import RenderJob
from clipppy_media.render import render_job


def health() -> dict:
    return {
        "ok": True,
        "gpu": False,
        "fallback": "cpu",
        "note": "GPU provider is undecided (O1). This process is the CPU ffmpeg fallback and does not publish.",
    }


def run_render_file(path: Path) -> dict:
    job = RenderJob.model_validate_json(path.read_text(encoding="utf-8"))
    return render_job(job).model_dump()


def main() -> None:
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "health":
        print(json.dumps(health()))
        return
    if len(sys.argv) > 2 and sys.argv[1] == "render":
        print(json.dumps(run_render_file(Path(sys.argv[2]))))
        return
    raise SystemExit("usage: python -m clipppy_media.worker health|render <job.json>")


if __name__ == "__main__":
    main()
