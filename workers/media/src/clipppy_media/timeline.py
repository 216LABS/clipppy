from dataclasses import dataclass


@dataclass(frozen=True)
class SegmentSpan:
    sequence: int
    start_ms: int
    duration_ms: int


def build_timeline(segments: list[SegmentSpan]) -> dict:
    ordered = sorted(segments, key=lambda item: item.sequence)
    spans = []
    discontinuities = []
    local = 0
    previous = None
    for segment in ordered:
        if previous is not None:
            expected = previous.start_ms + previous.duration_ms
            gap = segment.start_ms - expected
            if gap > 500:
                discontinuities.append({"after_sequence": previous.sequence, "gap_ms": gap})
        spans.append({"sequence": segment.sequence, "local_start_ms": local, "duration_ms": segment.duration_ms})
        local += segment.duration_ms
        previous = segment
    return {"spans": spans, "discontinuities": discontinuities, "duration_ms": local}


def cover_window(segments: list[SegmentSpan], start_ms: int, end_ms: int) -> dict:
    ordered = sorted(segments, key=lambda item: item.start_ms)
    if not ordered:
        return {"ok": False, "code": "MEDIA_WINDOW_EXPIRED", "missing_ms": end_ms - start_ms}
    cursor = start_ms
    missing = 0
    for segment in ordered:
        seg_end = segment.start_ms + segment.duration_ms
        if seg_end <= start_ms or segment.start_ms >= end_ms:
            continue
        if segment.start_ms > cursor:
            missing += segment.start_ms - cursor
        cursor = max(cursor, seg_end)
    if cursor < end_ms:
        missing += end_ms - cursor
    if missing > 2000:
        return {"ok": False, "code": "MEDIA_WINDOW_EXPIRED", "missing_ms": missing}
    return {"ok": True, "missing_ms": missing, "timeline": build_timeline(ordered)}
