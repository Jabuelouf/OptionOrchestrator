# Market Data Layer

Provides market snapshot context required for rescue decisioning.

## Entry Point
- `client.py`
- `flatfiles_client.py`

## Provider Strategy
- `MARKET_DATA_PROVIDER=auto` (default)
  - prefers Finnhub stock quotes when `FINNHUB_API_KEY` is present (official Python SDK path)
  - uses Twelve Data (`TWELVEDATA_API_KEY`) as a low-cost stock quote/history fallback when Finnhub is unavailable
  - uses non-Massive providers for stock quotes and stock movers
  - Home headlines use Massive news, but only for the current top gainers/losers ticker set
  - by default (`MASSIVE_OPTIONS_ONLY=true`), uses non-Massive providers for stock quotes/history
  - can try Massive for stocks only when `MASSIVE_OPTIONS_ONLY=false`
  - falls back to Yahoo quote endpoint
  - falls back to yfinance where supported if upstream calls fail
- `MARKET_DATA_PROVIDER=finnhub`
  - Finnhub stock quotes only (requires `FINNHUB_API_KEY`)
- `MARKET_DATA_PROVIDER=twelvedata`
  - Twelve Data stock quote/history via `time_series` endpoint (requires `TWELVEDATA_API_KEY`)
- `MARKET_DATA_PROVIDER=massive`
  - uses Massive for options data paths
  - stock quote/movers behavior should remain non-Massive when `MASSIVE_OPTIONS_ONLY=true`
- `MARKET_DATA_PROVIDER=yahoo`
  - Yahoo only
- `MASSIVE_API_BASE`
  - optional REST base URL override (default `https://api.massive.com`)
- `MASSIVE_OPTIONS_ONLY` (default `true`)
  - when true, reserve Massive usage for options and keep stock quote/history off Massive by default
- `FINNHUB_API_KEY`
  - enables Finnhub quote endpoint for stock prices (`/api/v1/quote`)
- `FINNHUB_API_BASE`
  - optional override (default `https://finnhub.io`)
- `TWELVEDATA_API_KEY`
  - enables Twelve Data quote/history fallback via `time_series`
- `TWELVEDATA_API_BASE`
  - optional override (default `https://api.twelvedata.com`)
- `HISTORY_CACHE_TTL_SECONDS`
  - short in-memory TTL for history/twelvedata-series cache (default `60`)
- `HOME_NEWS_WATCHLIST`
  - legacy/deprecated for Home headlines (Home news now follows top gainers/losers tickers)

## Notes
- Spot price is real when Massive or Yahoo succeeds.
- Finnhub integration is SDK-first via `finnhub-python`; REST fallback is only used when SDK is unavailable.
- Twelve Data integration uses `time_series` only and minimizes API spend by:
  - requesting the smallest `outputsize` needed for requested period/interval,
  - caching recent series responses in-memory for a short TTL.
- Top movers are equity data and should use non-Massive providers.
- Home headlines intentionally use Massive news, scoped to current movers only.
- Massive runtime usage is otherwise options-focused (`MASSIVE_OPTIONS_ONLY=true` policy).
- IV percentile and levels are currently approximated placeholders.
- Historical data ingestion uses Massive flatfiles (`flatfiles_client.py`) as a read-only source.
- Project artifacts should be stored in dedicated project storage, not Massive flatfiles.
- API routes set `X-Market-Data-Provider` (and sometimes `X-Market-Data-Detail`) based on `MarketDataClient.last_provider` for debugging fallbacks.


