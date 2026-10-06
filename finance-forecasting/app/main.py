"""
main.py

FastAPI entry point for the Python Forecast Service.

Exposes a single forecasting endpoint that the Laravel backend calls to
generate ARIMA-based financial forecasts.

Version: 1.0.0
"""

import logging
import os
import threading

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.schemas.forecast_schema import ForecastRequest, ForecastResponse
from app.services.arima_service import ARIMAService, ForecastValidationError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Read the platform's env file so INTERNAL_SERVICE_TOKEN / CORS_ALLOWED_ORIGINS
# resolve the same way they do in the AI service. Dotenv never overrides a real
# environment variable, so platform-set values still win.
load_dotenv()

# Shared secret the Laravel backend sends as X-Internal-Token. Without this,
# /forecast/arima is open to anyone who can reach the container's published
# port — an ARIMA fit costs seconds of CPU, so an outside caller can queue work
# until the service falls over. Must match FORECAST_SERVICE_TOKEN in Laravel's
# .env exactly.
INTERNAL_TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "").strip()

# Browsers must never call this service directly — only the Laravel backend
# does. The default is therefore "no browser origins at all" rather than the
# previous allow_origins=["*"], which combined with the missing auth check let
# any web page drive unbounded model fits. Set CORS_ALLOWED_ORIGINS to a
# comma-separated list of origins if a browser-side caller is ever needed.
_allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

app = FastAPI(
    title="Financial Management System — Forecast Service",
    description="ARIMA-based financial forecasting for Alibaton Construction Inc.",
    version=ARIMAService.MODEL_VERSION,
)

if _allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins,
        allow_methods=["POST", "GET"],
        allow_headers=["*"],
    )
else:
    logger.info(
        "[forecast] CORS_ALLOWED_ORIGINS is empty — no browser origin is "
        "permitted. This service is server-to-server only."
    )

# Fixed default ARIMA (p, d, q) per forecast_target. ForecastRequest does
# not expose a manual override, so this is the single place that decides
# model order per target. Falls back to (1, 1, 1) for anything unmapped.
# NOTE: these are starting-point defaults, not backtested against real
# Collections/Disbursements/Expenses/Budget Utilization data — revisit
# once there's enough forecast history to compare orders against actual
# outcomes.
# Exactly 5 categories per spec. 'Revenue' removed (not in the required
# 5). 'Invoices' renamed back to 'Accounts Receivable' — same underlying
# series, label only; invoices remain a data source for AR, not their
# own category.
DEFAULT_ORDERS: dict[str, tuple[int, int, int]] = {
    "Expenses": (2, 1, 1),
    "Cash Flow": (1, 1, 1),
    "Collections": (2, 1, 1),
    "Accounts Receivable": (1, 1, 1),
    "Budget Utilization": (1, 1, 1),
}

# Concurrency cap on model fits. An ARIMA fit costs seconds of CPU, so the
# damage from a caller with a valid token (a compromised backend, or one user
# hammering refresh) is queue depth, not request volume: unbounded concurrent
# fits pile up until the container is CPU-starved and every forecast,
# including the legitimate ones, times out.
#
# This bounds fits *in progress* rather than requests per minute, because a
# request-rate limit would still let N concurrent fits saturate the box, and
# these endpoints take seconds, not milliseconds. Requests arriving when the
# slots are full are refused immediately instead of being queued behind an
# expensive fit, so the caller gets a fast, honest 503 and can retry.
#
# Note this is per uvicorn worker process, so the effective ceiling is
# MAX_CONCURRENT_FITS x the worker count.
MAX_CONCURRENT_FITS = max(1, int(os.environ.get("MAX_CONCURRENT_FITS", "2")))
_fit_slots = threading.BoundedSemaphore(MAX_CONCURRENT_FITS)


@app.get("/health")
def health_check():
    """Simple liveness probe for Docker/orchestration."""
    return {"status": "ok", "model_version": ARIMAService.MODEL_VERSION}


def verify_internal_token(x_internal_token: str = Header(default="")) -> None:
    """
    Shared-secret gate for the model endpoints.

    /health stays open so the orchestrator's liveness probe still works; the
    fitting endpoint does not, because it is the expensive one.

    "Missing" and "mismatched" both return a bare 401 to the caller but log the
    distinction, because the two failures have completely different fixes (env
    var not set on this service vs. the two services disagreeing).
    """
    if not INTERNAL_TOKEN:
        logger.error(
            "[forecast] 401 REJECTED: INTERNAL_SERVICE_TOKEN is empty on this "
            "service, so no caller can ever authenticate. Set it on the platform."
        )
        raise HTTPException(status_code=401, detail="Invalid or missing internal service token")

    if x_internal_token != INTERNAL_TOKEN:
        logger.error(
            "[forecast] 401 REJECTED: token mismatch (received %d chars, "
            "expected %d). Laravel's FORECAST_SERVICE_TOKEN must match "
            "INTERNAL_SERVICE_TOKEN exactly.",
            len(x_internal_token),
            len(INTERNAL_TOKEN),
        )
        raise HTTPException(status_code=401, detail="Invalid or missing internal service token")

    return None


@app.post("/forecast/arima", response_model=ForecastResponse)
def forecast_arima(
    request: ForecastRequest,
    _token: None = Depends(verify_internal_token),
) -> ForecastResponse:
    """
    Generate an ARIMA forecast for the given forecast_target.

    Forecasts are estimates derived from historical data and are always
    returned with confidence intervals. They support planning and must
    not be treated as guaranteed outcomes.

    Validation failures (too little data, invalid periods, a series with no
    variation) return 422. Unexpected model-fitting failures return 500.
    success/message on the response body describe the happy path only —
    ForecastResponse's numeric fields (predicted_amount, forecasts,
    arima_order, ...) are required, not Optional, so there's no well-formed
    way to populate them on a failed request. HTTP status carries failure
    signaling instead.

    Only ForecastValidationError is echoed to the caller as a 422. numpy and
    statsmodels also raise plain ValueError, for their own internal reasons,
    and returning those messages verbatim would describe the inside of the
    model stack to whoever holds the token — so they are logged server-side
    and reported as an opaque 500 instead.
    """
    order = DEFAULT_ORDERS.get(request.forecast_target, (1, 1, 1))

    if not _fit_slots.acquire(blocking=False):
        logger.warning(
            "[forecast] 503: %d fit(s) already in progress, refusing another",
            MAX_CONCURRENT_FITS,
        )
        raise HTTPException(
            status_code=503,
            detail="Forecast service is at capacity. Retry in a moment.",
        )

    try:
        result = ARIMAService.generate_forecast(
            request.historical_data,
            periods=request.forecast_period,
            order=order,
        )
    except ForecastValidationError as exc:
        logger.warning("Invalid forecast request: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        # Everything else, including ValueErrors raised by numpy/statsmodels,
        # is our failure rather than the caller's: log the traceback, return
        # nothing about it.
        logger.exception("Forecast generation failed")
        raise HTTPException(
            status_code=500, detail="Forecast generation failed."
        )
    finally:
        _fit_slots.release()

    return ForecastResponse(
        success=True,
        message="Forecast generated successfully.",
        forecast_target=request.forecast_target,
        historical_observations=len(request.historical_data),
        forecast_period=request.forecast_period,
        **result,
    )