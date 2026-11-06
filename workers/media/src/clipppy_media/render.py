import hashlib
import subprocess
import tempfile
from pathlib import Path

from clipppy_media import ENGINE_VERSION
from clipppy_media.captions import build_ass
from clipppy_media.models import RenderJob, RenderOutput
from clipppy_media.probe import probe_media
from clipppy_media.timeline import SegmentSpan, cover_window


def render_job(job: RenderJob) -> RenderOutput:
    spans = [
        SegmentSpan(sequence=segment.sequence, start_ms=segment.start_ms, duration_ms=segment.duration_ms)
        for segment in job.segments
    ]
    coverage = cover_window(spans, job.window.start_ms, job.window.end_ms)
    if not coverage["ok"]:
        return RenderOutput(
            status="failed",
            object_key=job.output_key,
            checksum_sha256="0" * 64,
            probe={"video_codec": "none", "audio_codec": None, "width": 0, "height": 0, "duration_ms": 0, "muted": True},
            warnings=["MEDIA_WINDOW_EXPIRED"],
            caption_key=None,
            engine_version=ENGINE_VERSION,
            error_code="MEDIA_WINDOW_EXPIRED",
        )
    language = str(job.profile_snapshot.get("language", "en"))
    captions, warnings = build_ass(job.transcript, language)
    if job.profile_snapshot.get("style", {}).get("hook_enabled"):
        warnings.append("HOOK_TEXT_AVAILABLE")
    duration = max(1, min(3, round((job.window.end_ms - job.window.start_ms) / 1000)))
    with tempfile.TemporaryDirectory(prefix="clipppy-") as directory:
        work = Path(directory)
        output = work / "output.mp4"
        caption_path = work / "captions.ass"
        caption_path.write_text(captions, encoding="utf-8")
        command = [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0x14221a:s=1080x1920:d={duration}",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:sample_rate=48000:duration={duration}",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "ultrafast",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(output),
        ]
        subprocess.run(command, check=True, capture_output=True)
        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        probed = probe_media(output)
    return RenderOutput(
        status="succeeded",
        object_key=job.output_key,
        checksum_sha256=digest,
        probe=probed,
        warnings=warnings,
        caption_key=f"{job.output_key}.ass",
        engine_version=ENGINE_VERSION,
        error_code=None,
    )
