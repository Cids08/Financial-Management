"""
Endpoint-level tests for the forecast service.

The service had no Python-side test suite at all, so the behaviour these lock
in was only ever exercised by calling production. Run with:

    .venv/Scripts/python -m pytest tests -q
"""

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-token")

import app.main as main  # noqa: E402
from app.services.arima_service import ARIMAService, ForecastValidationError  # noqa: E402

client = TestClient(main.app)
AUTH = {"X-Internal-Token": "test-token"}

# A real, well-behaved series: 12 periods with genuine movement.
GOOD_SERIES = [100000 + 5000 * i for i in range(12)]


def body(series=None, target="Expenses", periods=6):
    return {
        "forecast_target": target,
        "historical_data": GOOD_SERIES if series is None else series,
        "forecast_period": periods,
    }


def test_unauthenticated_request_is_rejected():
    assert client.post("/forecast/arima", json=body()).status_code == 401


def test_a_bad_token_is_rejected():
    response = client.post(
        "/forecast/arima", json=body(), headers={"X-Internal-Token": "wrong"}
    )
    assert response.status_code == 401


def test_health_stays_open_for_the_orchestrator():
    assert client.get("/health").status_code == 200


def test_a_normal_series_still_forecasts():
    response = client.post("/forecast/arima", json=body(), headers=AUTH)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["success"] is True
    assert len(payload["forecasts"]) == 6


@pytest.mark.parametrize(
    "series",
    [
        pytest.param([0.0] * 12, id="all_zero"),
        pytest.param([50000.0] * 12, id="all_identical"),
    ],
)
def test_a_flat_series_is_refused(series):
    """
    statsmodels fits these without complaint and returns a flat forecast with
    zero-width confidence bounds, which reads exactly like a confident
    prediction. Refuse it rather than pass it off as one.
    """
    response = client.post("/forecast/arima", json=body(series), headers=AUTH)
    assert response.status_code == 422
    assert "no variation" in response.json()["detail"]


def test_too_few_points_is_rejected_by_the_schema():
    """
    ForecastRequest already caps historical_data at 6 items, so this is
    refused before the endpoint runs at all.
    """
    response = client.post(
        "/forecast/arima", json=body([1.0, 2.0, 3.0]), headers=AUTH
    )
    assert response.status_code == 422
    assert "at least 6 items" in str(response.json()["detail"])


def test_the_service_also_enforces_the_minimum_itself():
    """
    Defence in depth: the schema is not the only way in, and a series that
    short must not reach the fitter even when called directly.
    """
    with pytest.raises(ForecastValidationError, match="At least 6"):
        ARIMAService.generate_forecast([1.0, 2.0, 3.0], periods=6, order=(1, 1, 1))


def test_validation_error_is_a_value_error():
    """Keeps our validation path distinguishable from the library's."""
    assert issubclass(ForecastValidationError, ValueError)


def test_an_internal_value_error_is_not_echoed_to_the_caller(monkeypatch):
    """
    The distinction that matters: our own validation is a 422 carrying a
    useful message, anything else is an opaque 500. A library ValueError must
    never be handed back, because it describes the model stack's internals to
    whoever holds the token.
    """
    def boom(*args, **kwargs):
        raise ValueError("shape mismatch in diff, got (6,)")

    monkeypatch.setattr(ARIMAService, "generate_forecast", staticmethod(boom))

    response = client.post("/forecast/arima", json=body(), headers=AUTH)
    assert response.status_code == 500
    assert "shape mismatch" not in response.text
    assert "Forecast generation failed" in response.json()["detail"]


def test_a_fit_slot_is_released_even_when_generation_fails(monkeypatch):
    """A leaked slot would permanently shrink the service's capacity."""

    def boom(*args, **kwargs):
        raise RuntimeError("boom")

    before = main._fit_slots._value
    monkeypatch.setattr(ARIMAService, "generate_forecast", staticmethod(boom))

    client.post("/forecast/arima", json=body(), headers=AUTH)

    assert main._fit_slots._value == before


def test_the_fit_cap_is_configurable_and_sane():
    assert main.MAX_CONCURRENT_FITS >= 1


def test_requests_beyond_the_fit_cap_are_refused_not_queued():
    """
    Saturate every slot, then confirm the next request is refused. Queuing it
    behind the expensive fits already running is what starves the box.
    """
    held = 0
    try:
        while main._fit_slots.acquire(blocking=False):
            held += 1

        response = client.post("/forecast/arima", json=body(), headers=AUTH)
        assert response.status_code == 503
        assert "capacity" in response.json()["detail"]
    finally:
        for _ in range(held):
            main._fit_slots.release()