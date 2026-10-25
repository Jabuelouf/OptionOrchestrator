"""Shared exception types."""


class InputValidationError(Exception):
    """Raised when input payloads are malformed or missing required fields."""


class MarketDataError(Exception):
    """Raised when market data cannot be retrieved or is incomplete."""


class ValidationError(Exception):
    """Raised when a rescue candidate violates account or risk constraints."""


class OrchestrationError(Exception):
    """Raised when orchestration fails due to dependency or runtime issues."""


class BrokerError(Exception):
    """Raised when broker API calls fail or return unexpected data."""
