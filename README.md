[![make.fun](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532.svg)](https://make.fun/competitions/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![Rank](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/Syamsi02/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/rank.svg)](https://make.fun/competitions/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![Reward](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/Syamsi02/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/reward.svg)](https://make.fun/competitions/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)

# Pump.fun Sharpe Sprint — Cleanest Paper Bot Wins

A Sharpe-focused paper-trading bot for a 6-hour pump.fun replay
([bounty](https://make.fun/competitions/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)).
It buys a young mint only after its price has risen at least 1% off its own
low with cumulative buy volume at least 8x sell volume, stakes the same small
fixed amount (0.02 SOL) every time, and exits fast on a small take-profit
(+5%), a tight stop-loss (−1.5%), or a hold-time cap of 300 slots — spreading
equal stakes across many distinct mints so no single coin dominates the
equity curve. Fully deterministic: every decision comes from the hello seed
and the batches the harness delivers, with no clock, no randomness, and no
network.

## Run

```sh
node main.ts
```

The grader runs `node /bot/main.ts` on Node 22. `main.ts` is a thin wrapper:
it hands the strategy in `strategy.ts` to `runBot` from the vendored SDK shim
in `vendor/agentfun-bot.ts`.

---

Built for [make.fun](https://make.fun) — use referral code `fgwhnby2` when you sign up.
