---
name: market-pulse-ops
description: Operate or extend the Market Pulse internal Korean-market dashboard, including data-source adapters, market-regime signals, leverage indicators, and news timelines.
---

# Market Pulse Operations

Use this skill when modifying the Market Pulse dashboard or its data pipeline.

## Product boundary

The product is a small, invite-only market-awareness dashboard. It helps a team observe market conditions; it does not place orders, manage individual brokerage accounts, or provide deterministic investment recommendations.

Preserve the distinction between:

- **Intraday data**: prices, index futures, exchange rate, and investor flow. Always surface the source timestamp and whether it is delayed.
- **End-of-day data**: credit balances, repayment data, and leverage-risk components. Never present these as live intraday values.
- **Interpretation**: summaries or risk labels derived from data. Show the inputs and label causality as an interpretation, not a confirmed fact.

## Data-provider adapters

Keep provider credentials in server-side environment variables. Do not put credentials, account identifiers, order permissions, or raw upstream responses into browser JavaScript.

Normalize every provider response before it reaches the UI. Each normalized payload should include:

```json
{
  "asOf": "ISO-8601 timestamp",
  "source": "provider identifier",
  "isDelayed": false,
  "data": {}
}
```

When a provider fails, retain the latest valid observation, report stale status with its timestamp, and do not silently substitute a different source.

## Market-regime and leverage signals

Keep the market regime explainable. Prefer a small set of visible inputs: KOSPI/KOSDAQ, KOSPI200 futures, foreign investor flow, USD/KRW, Nasdaq futures, US Treasury yields, oil, gold, and volatility.

Calculate leverage risk separately for KOSPI and KOSDAQ. Use credit-balance level, change speed, liquidity burden, concentration, and price fragility as independently visible components. A high score is a condition to inspect, not a trade instruction.

## News timeline

Store the source URL, publisher, published timestamp, received timestamp, and classification confidence. Present summaries with their original source link. Do not copy article bodies into the dashboard. Mark uncertain market-impact links as possible interpretations.

## Security and release checks

Before adding a provider or releasing a change:

1. Confirm the provider permits the intended internal display and any redistribution.
2. Confirm no secret appears in tracked files, browser assets, logs, or error responses.
3. Preserve read-only operation: do not add order, account, or personal-margin tools without a separate user request and approval design.
4. Verify the relevant payload has `asOf`, `source`, and `isDelayed` fields.
