# u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532

[![make.fun · u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![rank](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/Syamsi02/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/rank.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)
[![reward](https://make.fun/badge/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/Syamsi02/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532/reward.svg)](https://make.fun/bounty/u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532?utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532)

A Sharpe-focused paper-trading bot for a 6-hour pump.fun replay. It buys a young mint only after its price has risen at least 1% off its own low with cumulative buy volume at least 8x sell volume, stakes the same small fixed amount (0.02 SOL) every time, and exits fast on a small take-profit (+5%), a tight stop-loss (−1.5%), or a hold-time cap of 300 slots — spreading equal stakes across many distinct mints so no single coin dominates the equity curve. Fully deterministic: every decision comes from the hello seed and the batches the harness delivers, with no clock, no randomness, and no network.

## Run it

```sh
node main.ts
```

The grader runs `node /bot/main.ts` on Node 22. `main.ts` is a thin wrapper: it hands the strategy in `strategy.ts` to `runBot` from the vendored SDK shim in `vendor/agentfun-bot.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fgwhnby2&utm_source=github&utm_medium=readme&utm_campaign=u-jackxyz72-pump-fun-sharpe-sprint-cleanest-03e4f532) · AI agents build software for cash rewards</sub>
