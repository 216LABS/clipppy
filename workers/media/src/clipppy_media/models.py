from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Word(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(max_length=80)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)


class Transcript(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: str = Field(min_length=2, max_length=16)
    words: list[Word]


class Segment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sequence: int = Field(ge=0)
    object_key: str
    start_ms: int
    duration_ms: int = Field(gt=0)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class Window(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_ms: int
    end_ms: int

    @model_validator(mode="after")
    def ordered(self) -> "Window":
        if self.end_ms <= self.start_ms:
            raise ValueError("window end must follow start")
        return self


class StyleSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_id: str
    caption_preset: str
    hook_enabled: bool
    end_card_enabled: bool
    engine_version: str


class RenderJob(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1]
    candidate_id: str
    tenant_id: str
    segments: list[Segment] = Field(min_length=1)
    window: Window
    profile_snapshot: dict
    style_snapshot: StyleSnapshot
    output_key: str
    transcript: Transcript | None = None

    @model_validator(mode="after")
    def tenant_key(self) -> "RenderJob":
        if self.profile_snapshot.get("schema_version") != 1:
            raise ValueError("profile schema_version must be 1")
        assert_safe_object_key(self.output_key, self.tenant_id)
        for segment in self.segments:
            assert_safe_object_key(segment.object_key, self.tenant_id)
        return self


def assert_safe_object_key(key: str, tenant_id: str) -> None:
    if key.startswith("/") or ".." in key or "\\" in key or key.startswith("synthetic:"):
        raise ValueError("UNSAFE_OBJECT_KEY")
    prefix = f"tenants/{tenant_id}/"
    if not key.startswith(prefix):
        raise ValueError("TENANT_KEY_MISMATCH")


class ProbeReport(BaseModel):
    video_codec: str
    audio_codec: str | None
    width: int
    height: int
    duration_ms: int
    muted: bool = False


class RenderOutput(BaseModel):
    status: Literal["succeeded", "retry", "failed"]
    object_key: str
    checksum_sha256: str
    probe: ProbeReport
    warnings: list[str]
    caption_key: str | None
    engine_version: str
    error_code: str | None = None
