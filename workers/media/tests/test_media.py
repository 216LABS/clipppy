import json
from pathlib import Path

from clipppy_media.captions import build_ass, escape_ass
from clipppy_media.models import RenderJob, Transcript, Word
from clipppy_media.render import render_job
from clipppy_media.timeline import SegmentSpan, build_timeline, cover_window
from clipppy_media.worker import health

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "fixtures" / "contracts" / "render-job.json"


def test_contract_fixture_parses():
    job = RenderJob.model_validate_json(FIXTURE.read_text(encoding="utf-8"))
    assert job.schema_version == 1
    assert job.output_key.startswith(f"tenants/{job.tenant_id}/")
    required = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for key in ("schema_version", "candidate_id", "tenant_id", "segments", "output_key"):
        assert key in required


def test_rejects_path_escape():
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    payload["output_key"] = f"tenants/{payload['tenant_id']}/../secret.mp4"
    try:
        RenderJob.model_validate(payload)
    except ValueError:
        return
    raise AssertionError("unsafe key was accepted")


def test_timeline_records_gaps_without_inventing_time():
    timeline = build_timeline(
        [
            SegmentSpan(1, 0, 10_000),
            SegmentSpan(3, 15_000, 10_000),
        ]
    )
    assert timeline["discontinuities"][0]["gap_ms"] == 5_000
    expired = cover_window([SegmentSpan(1, 0, 1_000)], 0, 10_000)
    assert expired["ok"] is False
    assert expired["code"] == "MEDIA_WINDOW_EXPIRED"


def test_captions_escape_and_do_not_fabricate():
    assert escape_ass("a{b}\\c") == r"a\{b\}\\c"
    empty, warnings = build_ass(None, "en")
    assert "Dialogue" not in empty
    assert "CAPTIONS_SKIPPED_NO_WORDS" in warnings
    missing, warnings = build_ass(None, "xx")
    assert "ASR_LANGUAGE_UNAVAILABLE" in warnings
    assert "Dialogue" not in missing
    ass, warnings = build_ass(Transcript(language="en", words=[Word(text="hello", start_ms=0, end_ms=400)]), "en")
    assert "hello" in ass
    assert warnings == []


def test_render_probe_and_worker_does_not_publish():
    job = RenderJob.model_validate_json(FIXTURE.read_text(encoding="utf-8"))
    result = render_job(job)
    assert result.status == "succeeded"
    assert result.probe.video_codec == "h264"
    assert result.probe.audio_codec == "aac"
    assert result.probe.width == 1080
    assert result.probe.height == 1920
    assert result.probe.duration_ms >= 1000
    assert len(result.checksum_sha256) == 64
    source = Path(__file__).resolve().parents[1].joinpath("src", "clipppy_media").read_text() if False else ""
    package = Path(__file__).resolve().parents[1] / "src" / "clipppy_media"
    text = "\n".join(path.read_text(encoding="utf-8") for path in package.glob("*.py"))
    assert "shell=True" not in text
    assert "os.system" not in text
    assert "def upload" not in text
    assert health()["gpu"] is False
    assert source == ""
