from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class ForecastRequest(BaseModel):
    """
    Request data received from the Laravel backend.
    """

    forecast_target: str = Field(
        ...,
        description="Financial value being forecasted.",
        examples=["Cash Flow", "Revenue", "Collections", "Expenses", "Accounts Receivable"]
    )

    forecast_period: int = Field(
        ...,
        ge=1,
        le=120,
        description="Number of future periods to forecast."
    )

    historical_data: List[float] = Field(
        ...,
        min_length=6,
        description="Historical financial values used by the ARIMA model."
    )

    @field_validator("forecast_target")
    @classmethod
    def validate_forecast_target(cls, value: str) -> str:

        allowed_targets = [
            "Cash Flow",
            "Revenue",
            "Collections",
            "Expenses",
            "Accounts Receivable",
        ]

        if value not in allowed_targets:
            raise ValueError(
                f"Forecast target must be one of: "
                f"{', '.join(allowed_targets)}"
            )

        return value

    @field_validator("historical_data")
    @classmethod
    def validate_historical_data(cls, values: List[float]) -> List[float]:

        # ARIMAService.validate_data() requires at least 6 points. Keeping
        # this check here too (in addition to Field(min_length=6)) means a
        # caller invoking this validator directly still gets the same floor
        # as the service, rather than relying solely on Field's message.
        if len(values) < 6:
            raise ValueError(
                "At least 6 historical observations are required."
            )

        # Historical amounts can legitimately go negative for any of the 5
        # forecast targets — refunds/credit memos can push a month's net
        # Revenue negative, timing/overpayment edge cases can push
        # Accounts Receivable's outstanding balance negative, and so on.
        # Not just Cash Flow, which was the original (too narrow) assumption.
        return values


class ForecastPeriodResult(BaseModel):
    """
    Individual forecast period.
    """

    period: int

    predicted_amount: float

    lower_bound: float

    upper_bound: float


class ForecastResponse(BaseModel):
    """
    Response returned by the Python forecasting service.
    """

    success: bool

    message: str

    algorithm: str

    model_version: str

    forecast_target: str

    arima_order: Dict[str, int] = Field(
        ...,
        description="ARIMA (p, d, q) order used to fit the model.",
        examples=[{"p": 1, "d": 1, "q": 1}],
    )

    historical_observations: int

    forecast_period: int

    predicted_amount: float

    confidence_level: float

    mape: Optional[float]

    rmse: Optional[float]

    forecasts: List[ForecastPeriodResult]

    converged: bool = Field(
        default=True,
        description=(
            "Whether the ARIMA optimizer converged during fitting. False "
            "means the reported order (see arima_order) is the best "
            "available fit rather than a fully converged solution, and "
            "callers should present the forecast with that caveat rather "
            "than as a guaranteed outcome."
        ),
    )