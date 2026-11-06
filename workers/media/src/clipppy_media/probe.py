import json
import subprocess
from pathlib import Path

from clipppy_media.models import ProbeReport


def probe_media(path: Path) -> ProbeReport:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    report = json.loads(completed.stdout)
    video = next(stream for stream in report["streams"] if stream.get("codec_type") == "video")
    audio_streams = [stream for stream in report["streams"] if stream.get("codec_type") == "audio"]
    duration = float(report["format"]["duration"])
    return ProbeReport(
        video_codec=video["codec_name"],
        audio_codec=audio_streams[0]["codec_name"] if audio_streams else None,
        width=int(video["width"]),
        height=int(video["height"]),
        duration_ms=int(round(duration * 1000)),
        muted=not audio_streams,
    )
