# Tensor

Unified margin engine with Greeks-aware portfolio margining across perpetuals, options, spot, and lending.

## Architecture

```
tensor/
  programs/
    tensor-margin          Anchor program — margin engine, trading, risk
  crates/
    tensor-types           Shared types (positions, Greeks, enums)
    tensor-math            Margin math, equity, health, liquidation
    tensor-cpi             Zero-copy CPI readers (Sigma, Sovereign, Northtail, ZK Credit)
    tensor-intents         Intent language — multi-leg bundles, builder pattern
    tensor-solver          Off-chain solver — decomposition, ordering, margin simulation
  packages/
    types                  TypeScript type definitions
    sdk                    TypeScript SDK
```

### Chain-Agnostic Core

The core algorithm crates (`tensor-types`, `tensor-math`, `tensor-intents`, `tensor-solver`) are chain-agnostic. Each has an `anchor` feature flag (enabled by default) that controls Anchor/Solana dependencies:

| Crate | `anchor` feature ON (default) | `anchor` feature OFF |
|-------|-------------------------------|----------------------|
| tensor-types | `AnchorSerialize`/`AnchorDeserialize`/`InitSpace` derives, `Pubkey` fields | `borsh::BorshSerialize`/`BorshDeserialize` derives, `[u8; 32]` fields |
| tensor-math | Depends on tensor-types with anchor | Pure math, no Anchor dependency |
| tensor-intents | Depends on tensor-types with anchor | Pure intent DSL, no Anchor dependency |
| tensor-solver | Depends on all above with anchor | Pure solver, no Anchor dependency |

The Solana-specific crates (`tensor-cpi`, `tensor-margin`) always require Anchor.

## Key Features

- **Portfolio Margining** — Delta-netting across spot, perps, and options reduces margin for hedged positions to near zero.
- **Greeks-Aware Risk** — Gamma and vega charges capture non-linear option risk. Theta decay is tracked.
- **Multi-Product** — Perpetual futures, vanilla/exotic options (Asian, barrier), spot trading (via Northtail AMM), and lending/borrowing in a single margin account.
- **Intent Language** — Declarative multi-leg trading intents (e.g., delta-neutral spread, covered call) with constraint validation.
- **Off-Chain Solver** — Decomposes intents into optimal execution sequences, orders hedging legs first to minimize peak margin.
- **ZK Credit Scores** — Privacy-preserving credit tiers (Bronze through Platinum) that reduce initial margin requirements by up to 20% and increase max leverage.
- **Identity-Gated Leverage** — Sovereign reputation tiers map to investor categories (Retail 5x, Qualified 20x, Institutional 50x).
- **Permissionless Cranks** — Anyone can call `compute_margin` to keep accounts up to date.

## Building

Build the Solana program (uses default `anchor` feature):

```sh
anchor build
```

## Testing

Run all tests (with Anchor/Solana features enabled by default):

```sh
cargo test
```

217 tests cover margin math, Greeks computation, delta-netting, liquidation waterfall, intent validation, solver optimization, credit discounts, and end-to-end trading scenarios.

### Chain-Agnostic Build

To verify the core crates compile without any Solana/Anchor dependency:

```sh
cargo check -p tensor-types -p tensor-math -p tensor-intents -p tensor-solver --no-default-features
```

### Using Core Crates Without Anchor

Add the crate with default features disabled:

```toml
[dependencies]
tensor-types = { git = "...", default-features = false }
tensor-math = { git = "...", default-features = false }
```

Types use `borsh` serialization and `[u8; 32]` for address fields instead of `Pubkey`. All math, intent, and solver logic works identically.

## Program ID

```
3uztvRNHpQcS9KgbdY6NFoL9HamSZYujkH9FQWtFoP1h
```

## License

BUSL-1.1
