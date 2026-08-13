// SPDX-License-Identifier: Apache-2.0
//
// Thin wrapper over the Midnight DApp Connector API (v4).
//
// Wallets inject one or more `InitialAPI` objects under `window.midnight`,
// keyed by an arbitrary id. Each advertises an `rdns` (reverse-DNS id) and a
// `connect(networkId)` that returns the `ConnectedAPI` used for everything else.
//
// Note there is deliberately no `disconnect()` in the connector API: a DApp
// "disconnects" by dropping its reference to the ConnectedAPI and clearing its
// own state. `getConnectionStatus()` reports whether the wallet still considers
// the session live (the user can revoke it from inside the wallet).

import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

/** Network id we target. Preprod is the Level 1/2 deployment target. */
export const NETWORK_ID = 'preprod';

/** Lace advertises itself with this reverse-DNS identifier. */
const LACE_RDNS = 'io.lace';

export interface DiscoveredWallet {
  /** Key under `window.midnight` — used to connect. */
  id: string;
  rdns: string;
  name: string;
  icon: string;
  apiVersion: string;
}

/** List every wallet currently injected under `window.midnight`. */
export const discoverWallets = (): DiscoveredWallet[] => {
  // `typeof window` guard rather than a bare `window.midnight`: it keeps the
  // "no wallet available" answer total in any non-browser context (tests,
  // prerender), instead of throwing a ReferenceError past the guard below.
  const injected = typeof window === 'undefined' ? undefined : window.midnight;
  if (!injected) return [];
  return Object.entries(injected).map(([id, api]: [string, InitialAPI]) => ({
    id,
    rdns: api.rdns,
    name: api.name,
    icon: api.icon,
    apiVersion: api.apiVersion,
  }));
};

/**
 * Pick the wallet to connect to: prefer Lace, otherwise the first injected one.
 * Returns undefined when no Midnight wallet is installed.
 */
export const pickWallet = (wallets: DiscoveredWallet[]): DiscoveredWallet | undefined =>
  wallets.find((w) => w.rdns === LACE_RDNS) ?? wallets[0];

/**
 * Wallet extensions inject asynchronously, so a DApp that reads
 * `window.midnight` on first paint often sees nothing. Poll briefly.
 */
export const waitForWallets = async (timeoutMs = 3000): Promise<DiscoveredWallet[]> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = discoverWallets();
    if (found.length > 0) return found;
    if (Date.now() >= deadline) return [];
    await new Promise((r) => setTimeout(r, 150));
  }
};

export class WalletNotFoundError extends Error {
  constructor() {
    super('No Midnight wallet found. Install the Lace extension and reload this page.');
    this.name = 'WalletNotFoundError';
  }
}

/**
 * Connect to a wallet, hinting the methods we intend to use so the wallet can
 * batch its permission prompts into a single approval.
 */
export const connectWallet = async (walletId?: string): Promise<{ api: ConnectedAPI; wallet: DiscoveredWallet }> => {
  const wallets = await waitForWallets();
  if (wallets.length === 0) throw new WalletNotFoundError();

  const chosen = walletId ? wallets.find((w) => w.id === walletId) : pickWallet(wallets);
  if (!chosen) throw new WalletNotFoundError();

  const initial = window.midnight![chosen.id];
  const api = await initial.connect(NETWORK_ID);

  // Ask for every permission we need up front, so voting later doesn't
  // interrupt the user with a second prompt mid-flow.
  await api.hintUsage([
    'getConfiguration',
    'getShieldedAddresses',
    'getUnshieldedAddress',
    'getDustBalance',
    'getProvingProvider',
    'balanceUnsealedTransaction',
    'submitTransaction',
  ]);

  return { api, wallet: chosen };
};

/** True when the wallet still considers this DApp session connected. */
export const isStillConnected = async (api: ConnectedAPI): Promise<boolean> => {
  try {
    const status = await api.getConnectionStatus();
    return status.status === 'connected';
  } catch {
    return false;
  }
};
