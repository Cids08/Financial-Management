"""
main.py

FastAPI entry point for the Python Forecast Service.

Exposes a single forecasting endpoint that the Laravel backend calls to
generate ARIMA-based financial forecasts.

Version: 1.0.0
"""

import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.schemas.forecast_schema import ForecastRequest, ForecastResponse
from app.services.arima_service import ARIMAService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Financial Management System — Forecast Service",
    description="ARIMA-based financial forecasting for Alibaton Construction Inc.",
    version=ARIMAService.MODEL_VERSION,
)

# Restrict this in production to the Laravel backend's origin only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Fixed default ARIMA (p, d, q) per forecast_target. ForecastRequest does
# not expose a manual override, so this is the single place that decides
# model order per target. Falls back to (1, 1, 1) for anything unmapped.
# NOTE: these are starting-point defaults, not backtested against real
# Collections/Disbursements/Expenses data — revisit once there's enough
# forecast history to compare orders against actual outcomes.
DEFAULT_ORDERS: dict[str, tuple[int, int, int]] = {
    "Revenue": (2, 1, 2),
    "Expenses": (2, 1, 1),
    "Cash Flow": (1, 1, 1),
    "Collections": (2, 1, 1),
    "Accounts Receivable": (1, 1, 1),
}


@app.get("/health")
def health_check():
    """Simple liveness probe for Docker/orchestration."""
    return {"status": "ok", "model_version": ARIMAService.MODEL_VERSION}


@app.post("/forecast/arima", response_model=ForecastResponse)
def forecast_arima(request: ForecastRequest) -> ForecastResponse:
    """
    Generate an ARIMA forecast for the given forecast_target.

    Forecasts are estimates derived from historical data and are always
    returned with confidence intervals. They support planning and must
    not be treated as guaranteed outcomes.

    Validation failures (too little data, invalid periods) return 422.
    Unexpected model-fitting failures return 500. success/message on the
    response body describe the happy path only — ForecastResponse's
    numeric fields (predicted_amount, forecasts, arima_order, ...) are
    required, not Optional, so there's no well-formed way to populate them
    on a failed request. HTTP status carries failure signaling instead.
    """
    order = DEFAULT_ORDERS.get(request.forecast_target, (1, 1, 1))

    try:
        result = ARIMAService.generate_forecast(
            request.historical_data,
            periods=request.forecast_period,
            order=order,
        )
    except ValueError as exc:
        logger.warning("Invalid forecast request: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Forecast generation failed")
        raise HTTPException(status_code=500, detail="Forecast generation failed.") from exc

    return ForecastResponse(
        success=True,
        message="Forecast generated successfully.",
        forecast_target=request.forecast_target,
        historical_observations=len(request.historical_data),
        forecast_period=request.forecast_period,
        **result,
    )