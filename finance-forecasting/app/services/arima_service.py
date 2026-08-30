import warnings
from typing import Any

import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tools.sm_exceptions import ConvergenceWarning


class ARIMAService:

    MODEL_VERSION = "1.0"
    ALGORITHM = "ARIMA"

    # Bounds for the holdout used to compute mape/rmse. Small samples get a
    # small holdout so there's still enough data left to train on.
    MIN_HOLDOUT = 2
    MAX_HOLDOUT = 6

    # If the requested order fails to converge even with a raised iteration
    # cap, fall back to progressively simpler orders rather than returning
    # an unreliable fit silently.
    FALLBACK_ORDERS = [(1, 1, 0), (0, 1, 1), (1, 0, 0)]

    @staticmethod
    def validate_data(data: list[float]) -> None:
        if len(data) < 6:
            raise ValueError(
                "At least 6 historical data points are required "
                "to generate an ARIMA forecast."
            )

        if any(not np.isfinite(value) for value in data):
            raise ValueError(
                "Historical data contains invalid numeric values."
            )

    @staticmethod
    def validate_periods(periods: int) -> None:
        if periods < 1:
            raise ValueError("periods must be at least 1.")

    @staticmethod
    def _fit_once(data: np.ndarray, order: tuple[int, int, int]):
        """
        Attempt a single fit and report whether the optimizer actually
        converged, instead of letting ConvergenceWarning disappear into
        stderr with no signal in the result.
        """
        model = ARIMA(
            data,
            order=order,
            enforce_stationarity=False,
            enforce_invertibility=False,
        )

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ConvergenceWarning)
            # statsmodels' default maxiter (50) is frequently too low for
            # small/irregular financial series; raise it before giving up.
            result = model.fit(method_kwargs={"maxiter": 200, "disp": False})
            converged = not any(
                issubclass(w.category, ConvergenceWarning) for w in caught
            )

        return result, converged

    @staticmethod
    def _fit(
        data: np.ndarray, order: tuple[int, int, int]
    ) -> tuple[Any, bool, tuple[int, int, int]]:
        """
        Fit with convergence diagnostics. If the requested order doesn't
        converge, fall back to simpler orders rather than returning
        unreliable coefficients. Returns (fitted_model, converged, order_used).
        """
        result, converged = ARIMAService._fit_once(data, order)
        if converged:
            return result, True, order

        best_result, best_order = result, order
        for fallback_order in ARIMAService.FALLBACK_ORDERS:
            if fallback_order == order:
                continue
            try:
                fallback_result, fallback_converged = ARIMAService._fit_once(
                    data, fallback_order
                )
            except Exception:
                continue
            if fallback_converged:
                return fallback_result, True, fallback_order
            # Keep the best non-converged attempt (lowest AIC) in case
            # nothing converges at all.
            if fallback_result.aic < best_result.aic:
                best_result, best_order = fallback_result, fallback_order

        # Nothing converged — return the best attempt we found, clearly
        # flagged, per the project's "communicate uncertainty honestly"
        # forecasting standard rather than presenting it as a normal fit.
        return best_result, False, best_order

    @staticmethod
    def _compute_accuracy(
        data: np.ndarray,
        order: tuple[int, int, int],
    ) -> tuple[float | None, float | None]:
        """
        Fit on a train/holdout split of the historical data and compute
        mape and rmse on the held-out periods. financial_forecasts.mape
        and .rmse are nullable, so this returns (None, None) when there
        isn't enough data for a meaningful holdout rather than fabricating
        a number.
        """
        n = len(data)
        holdout_n = min(ARIMAService.MAX_HOLDOUT, max(ARIMAService.MIN_HOLDOUT, n // 5))

        # Need enough data left to train on after removing the holdout.
        if n - holdout_n < 4:
            return None, None

        train, actual_holdout = data[:-holdout_n], data[-holdout_n:]

        try:
            fitted, _converged, _order_used = ARIMAService._fit(train, order)
            predicted = np.asarray(fitted.get_forecast(steps=holdout_n).predicted_mean)
        except Exception:
            # A holdout-sized series can fail to converge even when the
            # full series fits fine. Don't let accuracy scoring crash the
            # whole forecast — just report metrics as unavailable.
            return None, None

        rmse = float(np.sqrt(np.mean((actual_holdout - predicted) ** 2)))

        if np.any(actual_holdout == 0):
            # MAPE is undefined when any true value is zero.
            mape = None
        else:
            mape = float(np.mean(np.abs((actual_holdout - predicted) / actual_holdout)) * 100)

        return (
            round(mape, 4) if mape is not None else None,
            round(rmse, 4),
        )

    @staticmethod
    def generate_forecast(
        data: list[float],
        periods: int,
        order: tuple[int, int, int] = (1, 1, 1),
        alpha: float = 0.05,
    ) -> dict[str, Any]:

        ARIMAService.validate_data(data)
        ARIMAService.validate_periods(periods)

        historical_data = np.array(data, dtype=float)

        fitted_model, converged, order_used = ARIMAService._fit(historical_data, order)

        forecast_result = fitted_model.get_forecast(steps=periods)

        forecast_values = forecast_result.predicted_mean

        confidence_intervals = forecast_result.conf_int(alpha=alpha)

        forecast = []
        for index, value in enumerate(forecast_values):
            lower, upper = confidence_intervals[index]
            forecast.append(
                {
                    "period": index + 1,
                    "predicted_amount": round(float(value), 2),
                    "lower_bound": round(float(lower), 2),
                    "upper_bound": round(float(upper), 2),
                }
            )

        mape, rmse = ARIMAService._compute_accuracy(historical_data, order_used)

        return {
            # Named "forecasts" (plural) and "arima_order" (a p/d/q dict) to
            # match app.schemas.forecast_schema.ForecastResponse exactly, so
            # the FastAPI endpoint can pass this dict straight into that
            # model without a manual field-remapping step.
            "forecasts": forecast,
            "predicted_amount": round(float(np.sum(forecast_values)), 2),
            "confidence_level": round((1 - alpha) * 100, 2),
            "mape": mape,
            "rmse": rmse,
            "algorithm": ARIMAService.ALGORITHM,
            "model_version": ARIMAService.MODEL_VERSION,
            "arima_order": {
                "p": order_used[0],
                "d": order_used[1],
                "q": order_used[2],
            },
            # New field: surfaces optimizer reliability instead of letting
            # a ConvergenceWarning disappear silently, per the project's
            # "communicate uncertainty" forecasting standard.
            "converged": converged,
        }