from clipppy_media.models import Transcript

SUPPORTED_ASR = {"en", "es", "pt", "fr", "de"}


def escape_ass(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")


def build_ass(transcript: Transcript | None, language: str) -> tuple[str, list[str]]:
    warnings: list[str] = []
    if language not in SUPPORTED_ASR:
        warnings.append("ASR_LANGUAGE_UNAVAILABLE")
        return _header(), warnings
    if transcript is None or not transcript.words:
        warnings.append("CAPTIONS_SKIPPED_NO_WORDS")
        return _header(), warnings
    lines = [_header(), "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    for word in transcript.words:
        if word.end_ms < word.start_ms:
            warnings.append("WORD_TIMING_IGNORED")
            continue
        lines.append(
            f"Dialogue: 0,{_ts(word.start_ms)},{_ts(word.end_ms)},Karaoke,,0,0,0,,{escape_ass(word.text)}"
        )
    return "\n".join(lines) + "\n", warnings


def _header() -> str:
    return "\n".join(
        [
            "[Script Info]",
            "ScriptType: v4.00+",
            "PlayResX: 1080",
            "PlayResY: 1920",
            "WrapStyle: 0",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            "Style: Karaoke,Arial,72,&H00FFFFFF,&H00000000,&H64000000,1,0,1,3,0,2,40,40,120,1",
            "",
        ]
    )


def _ts(ms: int) -> str:
    hours = ms // 3_600_000
    minutes = (ms % 3_600_000) // 60_000
    seconds = (ms % 60_000) // 1000
    centis = (ms % 1000) // 10
    return f"{hours}:{minutes:02d}:{seconds:02d}.{centis:02d}"
