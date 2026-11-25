// Sharpe-focused paper bot for the pump.fun replay (agent-fun/replay/v2).
//
// Idea: pump.fun coins mostly die, a few run fast. This bot only buys a young
// mint after its price has already risen off its own low with buy volume
// dominating sell volume, stakes the same small fixed amount every time, and
// exits quickly on a small take-profit, a tight stop-loss, or a hold-time cap.
// Small equal stakes across many distinct mints keep any single coin from
// dominating the equity curve, which is what an hourly Sharpe ranking rewards.
//
// Everything here is deterministic: every decision is a pure function of the
// hello seed (unused for randomness) and the batches the harness delivers.
// No clock, no randomness, no network, no state outside this closure.

import type { Batch, Bot, BotState, OrderInput } from './vendor/agentfun-bot.ts';

export interface Params {
  /** Fixed SOL staked per buy (before the per-mint reserve cap trims it). */
  stakeSol: number;
  /** Entry: price must be this far above the mint's own low since first seen. */
  entryPct: number;
  /** Exit: sell when the mark is this far above the fill price. */
  takeProfitPct: number;
  /** Exit: sell when the mark is this far below the fill price. */
  stopLossPct: number;
  /** Exit: sell after holding this many slots, however the price moved. */
  maxHoldSlots: number;
  /** Entry: at least this many trades seen on the mint before buying. */
  minTrades: number;
  /** Entry: cumulative buy volume must be at least this multiple of sell volume. */
  buyDominance: number;
  /** Entry: only mints first seen within this many slots. */
  maxAgeSlots: number;
  /** Re-entry: wait this many slots after an exit on the same mint. */
  cooldownSlots: number;
  /** Slippage tolerance on buys, in basis points. */
  buySlippageBps: number;
  /** Slippage tolerance on sells, in basis points. */
  sellSlippageBps: number;
}

export const DEFAULT_PARAMS: Params = {
  stakeSol: 0.02,
  entryPct: 0.01,
  takeProfitPct: 0.05,
  stopLossPct: 0.015,
  maxHoldSlots: 300,
  minTrades: 1,
  buyDominance: 8.0,
  maxAgeSlots: 12000,
  cooldownSlots: 600,
  buySlippageBps: 500,
  sellSlippageBps: 1000,
};

const LAMPORTS_PER_SOL = 1_000_000_000n;
const MIN_ROUND_TRIP_LAMPORTS = 10_000_000n; // 0.01 SOL, the guardrail floor.

interface Tracked {
  firstSlot: number;
  firstPrice: number;
  lowPrice: number;
  trades: number;
  buyLamports: bigint;
  sellLamports: bigint;
  lastPrice: number;
  exitedSlot: number;
  entered: boolean;
}

interface OpenTrade {
  entryPrice: number;
  entrySlot: number;
}

/** Price of one token in SOL, from a curve's virtual reserves. */
function priceOf(curve: { virtual_quote_reserves: bigint; virtual_token_reserves: bigint }): number {
  if (curve.virtual_token_reserves === 0n) return 0;
  return Number(curve.virtual_quote_reserves) / Number(curve.virtual_token_reserves);
}

export function createStrategy(params: Params): Bot {
  const stakeLamports = BigInt(Math.round(params.stakeSol * 1_000_000_000));
  const tracked = new Map<string, Tracked>();
  const open = new Map<string, OpenTrade>();

  function noteTrade(mint: string, slot: number, price: number, isBuy: boolean, solAmount: bigint): void {
    let t = tracked.get(mint);
    if (t === undefined) {
      t = {
        firstSlot: slot,
        firstPrice: price,
        lowPrice: price,
        trades: 0,
        buyLamports: 0n,
        sellLamports: 0n,
        lastPrice: price,
        exitedSlot: -1_000_000_000,
        entered: false,
      };
      tracked.set(mint, t);
    }
    t.trades += 1;
    if (isBuy) t.buyLamports += solAmount;
    else t.sellLamports += solAmount;
    if (price > 0 && price < t.lowPrice) t.lowPrice = price;
    t.lastPrice = price;
  }

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const orders: OrderInput[] = [];
      const slot = batch.slot;

      // Fold this batch's fills in first: a buy fill fixes the entry price
      // (SOL actually paid per token received); a sell fill closes the trade.
      for (const fill of batch.fills) {
        if (fill.status !== 'filled') continue;
        const tokens = BigInt(fill.token_amount);
        const quote = BigInt(fill.quote_lamports);
        if (fill.side === 'buy' && tokens > 0n && quote > 0n) {
          open.set(fill.mint, { entryPrice: Number(quote) / Number(tokens), entrySlot: fill.slot });
          const t = tracked.get(fill.mint);
          if (t !== undefined) t.entered = true;
        } else if (fill.side === 'sell') {
          open.delete(fill.mint);
          const t = tracked.get(fill.mint);
          if (t !== undefined) t.exitedSlot = slot;
        }
      }
      // Harness closes (complete / flatten / writeoff) arrive as sell fills
      // with a reserved client id, so they are covered above. Drop bookkeeping
      // for positions the account no longer holds.
      for (const mint of [...open.keys()]) {
        if (!state.positions.has(mint)) open.delete(mint);
      }

      // Exits first: free the 5-position cap before considering new entries.
      // Iterate sorted mints so the order of sell orders is deterministic.
      const held = [...state.positions.keys()].sort();
      const exiting = new Set<string>();
      for (const mint of held) {
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        const holding = state.positions.get(mint);
        if (holding === undefined || holding.token_amount === 0n) continue;
        // Skip a mint that already has a sell pending for it.
        let sellPending = false;
        for (const p of state.pending.values()) {
          if (p.order.mint === mint && p.order.side === 'sell') sellPending = true;
        }
        if (sellPending) continue;
        let entry = open.get(mint);
        if (entry === undefined) {
          // Fallback: average cost per token still held.
          entry = { entryPrice: Number(holding.cost_lamports) / Number(holding.token_amount), entrySlot: slot };
          open.set(mint, entry);
        }
        const price = priceOf(curve);
        if (price <= 0 || entry.entryPrice <= 0) continue;
        const ret = price / entry.entryPrice - 1;
        const heldSlots = slot - entry.entrySlot;
        if (ret >= params.takeProfitPct || ret <= -params.stopLossPct || heldSlots >= params.maxHoldSlots) {
          // A full sell can be refused when its quote out exceeds the curve's
          // real SOL reserve, leaving the position stuck while the coin rugs.
          // Trim the sale so its quote out stays under 85% of real reserves;
          // the remainder is trimmed again on the next batch.
          let tokens = holding.token_amount;
          const vt = curve.virtual_token_reserves;
          const vq = curve.virtual_quote_reserves;
          const rq = curve.real_quote_reserves;
          if (vt > 0n && vq > 0n && rq > 0n) {
            const qFull = (tokens * vq) / (vt + tokens);
            const limit = (rq * 85n) / 100n;
            if (qFull > limit && vq > limit) {
              const trimmed = (limit * vt) / (vq - limit);
              if (trimmed > 0n && trimmed < tokens) tokens = trimmed;
            }
          }
          // Skip a sale whose proceeds would not even cover its tx fee:
          // the sim rejects it as zero-amount and the bot would otherwise
          // re-emit it on every batch for a dead position.
          const qOut = (tokens * vq) / (vt + tokens);
          const proceeds = qOut - (qOut * 125n) / 10000n - state.txFeeLamports();
          if (proceeds <= 0n) continue;
          orders.push({
            side: 'sell',
            mint,
            token_amount: tokens,
            max_slippage_bps: params.sellSlippageBps,
          });
          exiting.add(mint);
        }
      }

      // Track this batch's events, then consider entries on the mints that
      // actually traded in this batch (cheap: never scan the whole universe).
      const candidates: string[] = [];
      for (const event of batch.events) {
        if (event.event === 'TradeEvent') {
          const curve = state.curves.get(event.mint);
          const price = curve !== undefined ? priceOf(curve) : 0;
          if (price > 0) {
            noteTrade(event.mint, slot, price, event.is_buy, BigInt(event.sol_amount));
            candidates.push(event.mint);
          }
        } else if (event.event === 'CreateEvent') {
          const curve = state.curves.get(event.mint);
          const price = curve !== undefined ? priceOf(curve) : 0;
          if (price > 0 && !tracked.has(event.mint)) {
            tracked.set(event.mint, {
              firstSlot: slot,
              firstPrice: price,
              lowPrice: price,
              trades: 0,
              buyLamports: 0n,
              sellLamports: 0n,
              lastPrice: price,
              exitedSlot: -1_000_000_000,
              entered: false,
            });
          }
        }
      }

      // Entries, in first-seen order of this batch, de-duplicated.
      const seenThisBatch = new Set<string>();
      for (const mint of candidates) {
        if (seenThisBatch.has(mint)) continue;
        seenThisBatch.add(mint);
        if (orders.length >= state.hello.caps.max_orders_per_batch) break;
        if (state.positions.has(mint) || exiting.has(mint)) continue;
        const t = tracked.get(mint);
        if (t === undefined) continue;
        if (slot - t.firstSlot > params.maxAgeSlots) continue;
        if (slot - t.exitedSlot < params.cooldownSlots) continue;
        if (t.trades < params.minTrades) continue;
        if (t.lowPrice <= 0 || t.lastPrice <= 0) continue;
        const rise = t.lastPrice / t.lowPrice - 1;
        if (rise < params.entryPct) continue;
        if (t.buyLamports < t.sellLamports * BigInt(Math.round(params.buyDominance * 1000)) / 1000n) continue;
        // Already committed to this mint (a buy pending)? Skip the duplicate.
        let buyPending = false;
        for (const p of state.pending.values()) {
          if (p.order.mint === mint && p.order.side === 'buy') buyPending = true;
        }
        if (buyPending) continue;
        if (state.committedPositionCount() >= state.hello.caps.max_open_positions) break;
        // Size: fixed stake, trimmed to 90% of the 1%-of-real-reserve cap
        // (a haircut for reserve drift between decision and fill), and never
        // below the 0.01 SOL round-trip floor (a smaller fill would not count).
        const cap = state.maxBuyLamports(mint);
        let size = stakeLamports;
        if (cap > 0n && (cap * 9n) / 10n < size) size = (cap * 9n) / 10n;
        if (size < MIN_ROUND_TRIP_LAMPORTS) continue;
        const txFee = state.txFeeLamports();
        if (state.freeCashLamports() < size + txFee) continue;
        orders.push({
          side: 'buy',
          mint,
          quote_lamports: size,
          max_slippage_bps: params.buySlippageBps,
        });
      }

      return orders;
    },
  };
}
