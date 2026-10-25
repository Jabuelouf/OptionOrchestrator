"""Shared dataclasses for layer-to-layer contracts."""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class StockQuote:
    symbol: str
    company_name: Optional[str]
    price: float
    change: float
    change_percent: float
    volume: int
    avg_volume: int
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    fifty_two_week_high: Optional[float] = None
    fifty_two_week_low: Optional[float] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    timestamp: str = ""


@dataclass
class OHLCV:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class OptionContract:
    contract_symbol: str
    strike: float
    expiration: str
    option_type: str  # call|put
    last_price: float
    bid: float
    ask: float
    volume: int
    open_interest: int
    implied_volatility: float
    in_the_money: bool
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    rho: Optional[float] = None


@dataclass
class OptionsChain:
    symbol: str
    underlying_price: float
    expiration_date: str
    calls: List[OptionContract]
    puts: List[OptionContract]


@dataclass
class MarketOverview:
    vix: float
    vix_change: float
    spy_price: float
    spy_change_percent: float
    qqq_price: float
    qqq_change_percent: float
    timestamp: str


@dataclass
class RSIResult:
    value: float
    condition: str  # oversold|neutral|overbought


@dataclass
class MACDResult:
    macd_line: float
    signal_line: float
    histogram: float
    trend: str  # bullish|bearish|neutral


@dataclass
class BollingerBands:
    upper_band: float
    middle_band: float
    lower_band: float
    bandwidth: float
    percent_b: float


@dataclass
class StochasticResult:
    percent_k: float
    percent_d: float
    condition: str
    signal: str


@dataclass
class TrendAnalysis:
    symbol: str
    direction: str  # bullish|bearish|neutral
    strength: float
    rsi: RSIResult
    macd: MACDResult
    bollinger: BollingerBands
    stochastic: Optional[StochasticResult] = None
    sma_20: float = 0.0
    sma_50: float = 0.0
    sma_200: float = 0.0
    ema_12: float = 0.0
    ema_26: float = 0.0
    price_vs_sma_200: str = "unknown"
    short_term_trend: str = "neutral"
    long_term_trend: str = "neutral"


@dataclass
class VolatilityAnalysis:
    symbol: str
    historical_volatility_10: float
    historical_volatility_30: float
    historical_volatility_60: float
    current_iv: Optional[float] = None
    iv_rank: Optional[float] = None
    iv_percentile: Optional[float] = None
    volatility_level: str = "moderate"
    hv_trend: str = "stable"
    recommendation: str = ""


@dataclass
class StrategyLeg:
    action: str  # buy|sell
    quantity: int
    expiration: Optional[str] = None
    strike: Optional[float] = None
    option_type: Optional[str] = None  # call|put|stock
    premium: float = 0.0


@dataclass
class StrategyScore:
    strategy_name: str
    strategy_type: str
    score: float
    probability_of_profit: float
    max_profit: float
    max_loss: float
    risk_reward_ratio: float
    market_conditions_fit: str
    legs: List[StrategyLeg]


@dataclass
class StrategyComparisonResponse:
    symbol: str
    current_price: float
    market_trend: str
    volatility_level: str
    iv_rank: float
    recommended_strategy: str
    strategy_scores: List[StrategyScore]


@dataclass
class SimulationLeg:
    action: str  # buy|sell
    quantity: int
    option_type: str  # call|put|stock
    strike: Optional[float] = None
    expiration: Optional[str] = None
    premium: float = 0.0
    implied_volatility: Optional[float] = None


@dataclass
class SimulationPoint:
    date: str
    stock_price: float
    projected_profit: float
    days_to_expiry: int


@dataclass
class SimulationResponse:
    data_points: List[SimulationPoint]


@dataclass
class OptionLeg:
    option_type: str
    strike: float
    expiry: str
    quantity: int
    side: str
    entry_price: Optional[float] = None


@dataclass
class PositionSnapshot:
    symbol: str
    legs: List[OptionLeg]
    notes: Optional[str] = None


@dataclass
class AccountConstraints:
    buying_power: float
    max_loss_tolerance: float
    risk_preference: str = "moderate"


@dataclass
class MarketSnapshot:
    symbol: str
    spot_price: float
    iv_percentile: Optional[float] = None
    support_levels: List[float] = field(default_factory=list)
    resistance_levels: List[float] = field(default_factory=list)


@dataclass
class PositionGreeks:
    delta: float
    gamma: float
    theta: float
    vega: float
    est_max_loss: Optional[float] = None


@dataclass
class RescueCandidate:
    action: str
    rationale: str
    net_cost: Optional[float] = None
    risk_rating: str = "unknown"


@dataclass
class ValidationResult:
    valid: bool
    warnings: List[str] = field(default_factory=list)
    blocked_reason: Optional[str] = None


@dataclass
class OrchestrationResult:
    assessment: str
    candidates: List[RescueCandidate]
    validations: List[ValidationResult]
    recommendation_index: Optional[int] = None


@dataclass
class OrderRequest:
    symbol: str
    legs: List[OptionLeg]
    order_type: str = "limit"      # market|limit
    limit_price: Optional[float] = None
    time_in_force: str = "day"     # day|gtc


@dataclass
class OrderResult:
    order_id: str
    status: str                    # pending|filled|rejected|cancelled|stub
    filled_price: Optional[float] = None
    filled_quantity: int = 0
    message: str = ""
