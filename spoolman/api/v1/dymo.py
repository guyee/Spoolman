"""DYMO helper proxy endpoints."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from spoolman import env

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/dymo",
    tags=["dymo"],
)

HELPER_TIMEOUT_SECONDS = 10.0

JsonValue = str | int | float | bool | None | dict[str, "JsonValue"] | list["JsonValue"]


class DymoTextSegment(BaseModel):
    """Styled text segment accepted by the DYMO helper v2 contract."""

    text: str = Field(min_length=1, max_length=80)
    bold: bool | None = None
    italic: bool | None = None


DymoTextField = str | DymoTextSegment | list[DymoTextSegment]


class DymoLabel(BaseModel):
    """Structured label payload accepted by the DYMO helper."""

    model_config = ConfigDict(populate_by_name=True)

    qr_text: str = Field(alias="qrText", min_length=1, max_length=80)
    brand: DymoTextField
    filament_type: DymoTextField = Field(alias="filamentType")
    color_code: DymoTextField | None = Field(None, alias="colorCode")
    color_name: DymoTextField = Field(alias="colorName")

    @field_validator("brand", "filament_type", "color_name")
    @classmethod
    def validate_required_text_field(cls, value: DymoTextField) -> DymoTextField:
        """Validate required styled label text fields before proxying to the helper."""
        validate_text_field(value, required=True)
        return value

    @field_validator("color_code")
    @classmethod
    def validate_optional_text_field(cls, value: DymoTextField | None) -> DymoTextField | None:
        """Validate optional styled label text fields before proxying to the helper."""
        validate_text_field(value, required=False)
        return value


class DymoLabelsRequest(BaseModel):
    """Request body for rendering or printing DYMO labels."""

    copies: int = Field(1, ge=1, le=20)
    labels: list[DymoLabel] = Field(min_length=1, max_length=100)


def dymo_helper_url(path: str) -> str:
    """Build a DYMO helper URL for an endpoint path."""
    return f"{env.get_dymo_helper_url()}{path}"


def dymo_error_response(status_code: int, message: str) -> JSONResponse:
    """Return a normalized DYMO error response."""
    return JSONResponse(status_code=status_code, content={"ok": False, "error": message})


def text_field_length(value: DymoTextField | None) -> int:
    """Return the total text length for a styled DYMO text field."""
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value.strip())
    if isinstance(value, DymoTextSegment):
        return len(value.text.strip())
    return sum(len(segment.text.strip()) for segment in value)


def validate_text_field(value: DymoTextField | None, *, required: bool) -> None:
    """Validate helper v2 plain-string or styled-segment text fields."""
    length = text_field_length(value)
    if required and length == 0:
        raise ValueError("Field is required.")
    if length > 80:
        raise ValueError("Field must be 80 characters or fewer.")


def text_field_payload(value: DymoTextField | None) -> JsonValue:
    """Serialize a styled DYMO text field for the helper payload."""
    if value is None or isinstance(value, str):
        return value
    if isinstance(value, DymoTextSegment):
        return value.model_dump(exclude_none=True)
    return [segment.model_dump(exclude_none=True) for segment in value]


def helper_payload(labels_request: DymoLabelsRequest, *, confirmed: bool) -> dict[str, JsonValue]:
    """Build the server-to-server helper payload."""
    labels: list[dict[str, JsonValue]] = [
        {
            "qrText": label.qr_text,
            "brand": text_field_payload(label.brand),
            "filamentType": text_field_payload(label.filament_type),
            "colorCode": text_field_payload(label.color_code),
            "colorName": text_field_payload(label.color_name),
        }
        for label in labels_request.labels
    ]
    payload: dict[str, JsonValue] = {
        "printerName": env.get_dymo_printer_name(),
        "copies": labels_request.copies,
        "labels": labels,
    }
    if confirmed:
        payload["confirmed"] = True
    return payload


async def call_dymo_helper(method: str, path: str, json: dict[str, JsonValue] | None = None) -> JSONResponse:
    """Call the DYMO helper and preserve its JSON contract for the frontend."""
    helper_url = dymo_helper_url(path)
    try:
        async with httpx.AsyncClient(timeout=HELPER_TIMEOUT_SECONDS) as client:
            response = await client.request(method, helper_url, json=json)
    except httpx.RequestError as exc:
        logger.warning("Failed to reach DYMO helper at %s: %s", helper_url, exc)
        return dymo_error_response(
            status.HTTP_502_BAD_GATEWAY,
            f"Failed to reach DYMO helper at {env.get_dymo_helper_url()}: {exc}",
        )

    try:
        body: object = response.json()
    except ValueError:
        logger.warning("DYMO helper returned non-JSON response from %s: %s", helper_url, response.text)
        return dymo_error_response(status.HTTP_502_BAD_GATEWAY, "DYMO helper returned a non-JSON response.")

    status_code = response.status_code
    if isinstance(body, dict) and body.get("ok") is False and status_code < status.HTTP_400_BAD_REQUEST:
        status_code = status.HTTP_502_BAD_GATEWAY

    return JSONResponse(status_code=status_code, content=body)


@router.get("/health")
async def dymo_health() -> JSONResponse:
    """Check the configured DYMO helper and printer."""
    return await call_dymo_helper("GET", "/health")


@router.get("/contract")
async def dymo_contract() -> JSONResponse:
    """Return the configured DYMO helper label contract."""
    return await call_dymo_helper("GET", "/contract")


@router.post("/render")
async def dymo_render(body: DymoLabelsRequest) -> JSONResponse:
    """Render DYMO labels through the helper without printing."""
    return await call_dymo_helper("POST", "/render", json=helper_payload(body, confirmed=False))


@router.post("/print")
async def dymo_print(body: DymoLabelsRequest) -> JSONResponse:
    """Print DYMO labels through the helper after an explicit UI action."""
    return await call_dymo_helper("POST", "/print", json=helper_payload(body, confirmed=True))
