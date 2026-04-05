# osmosis-cancel-limitorders

Look up and cancel Osmosis limit orders.

## Features

- Query active limit orders for any Osmosis wallet address
- Display order details: ID, direction, quantity, tick, placement date, and TX link
- Cancel selected or all orders via Keplr wallet signing
- Fetches order data from the Osmosis orderbook contract and enriches with archive RPC tx history

## Endpoints

| Purpose | URL |
|---------|-----|
| Contract queries (LCD) | `rest-osmosis.ecostake.com` |
| Archive tx history (RPC) | `rpc.archive.osmosis.zone` |
| Broadcast transactions (RPC) | `rpc.osmosis.zone` |

## Contract

Osmosis orderbook: `osmo1slqv7yv45v4k3ccrvwv24u2scqn6hyrut7j5m69ygw3j66ayqnesxemawx`

## Development

```bash
npm install
npm run dev      # watch + local server on :8080
npm run dist     # build bundle + copy assets to docs/
npm run serve    # serve docs/ on :8080
```

## Deploy

The `docs/` folder is the build output for GitHub Pages. After running `npm run dist`, commit and push to deploy.
