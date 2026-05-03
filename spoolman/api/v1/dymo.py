"""DYMO helper proxy endpoints."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from spoolman import env

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/dymo",
    tags=["dymo"],
)

HELPER_TIMEOUT_SECONDS = 10.0

JsonValue = str | int | float | bool | None | dict[str, "JsonValue"] | list["JsonValue"]


class DymoLabel(BaseModel):
    """Structured label payload accepted by the DYMO helper."""

    model_config = ConfigDict(populate_by_name=True)

    qr_text: str = Field(alias="qrText", min_length=1, max_length=80)
    brand: str = Field(min_length=1, max_length=80)
    filament_type: str = Field(alias="filamentType", min_length=1, max_length=80)
    color_code: str | None = Field(None, alias="colorCode", max_length=80)
    color_name: str = Field(alias="colorName", min_length=1, max_length=80)


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


def helper_payload(labels_request: DymoLabelsRequest, *, confirmed: bool) -> dict[str, JsonValue]:
    """Build the server-to-server helper payload."""
    labels: list[dict[str, JsonValue]] = [
        {
            "qrText": label.qr_text,
            "brand": label.brand,
            "filamentType": label.filament_type,
            "colorCode": label.color_code,
            "colorName": label.color_name,
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
