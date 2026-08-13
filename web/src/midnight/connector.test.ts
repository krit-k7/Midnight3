// SPDX-License-Identifier: Apache-2.0
//
// Application tests for the wallet connector.
//
// These cover the DApp-side session lifecycle that Level 2 wired up: which
// wallet gets picked when several are injected, what happens when none is,
// that every permission we need is requested in a single up-front batch (so a
// vote never stalls on a second prompt), and that a wallet-side revocation is
// observable.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectWallet,
  discoverWallets,
  isStillConnected,
  NETWORK_ID,
  pickWallet,
  waitForWallets,
  WalletNotFoundError,
  type DiscoveredWallet,
} from './connector';

/** Minimal stand-in for a wallet's injected InitialAPI. */
const injectedWallet = (rdns: string, name: string, connect = vi.fn()) => ({
  rdns,
  name,
  icon: `data:image/svg+xml;,${name}`,
  apiVersion: '4.0.0',
  connect,
});

/** Install a fake `window.midnight` containing the given wallets. */
const injectWindow = (wallets: Record<string, ReturnType<typeof injectedWallet>>): void => {
  (globalThis as { window?: unknown }).window = { midnight: wallets };
};

/** Remove `window` entirely — the "no extension installed" case. */
const clearWindow = (): void => {
  delete (globalThis as { window?: unknown }).window;
};

afterEach(() => {
  clearWindow();
  vi.restoreAllMocks();
});

describe('wallet discovery', () => {
  it('returns no wallets when nothing is injected', () => {
    clearWindow();
    expect(discoverWallets()).toEqual([]);
  });

  it('maps every injected wallet to its advertised identity', () => {
    injectWindow({
      lace: injectedWallet('io.lace', 'Lace'),
      other: injectedWallet('com.example.wallet', 'Example'),
    });

    expect(discoverWallets()).toEqual([
      { id: 'lace', rdns: 'io.lace', name: 'Lace', icon: expect.any(String), apiVersion: '4.0.0' },
      {
        id: 'other',
        rdns: 'com.example.wallet',
        name: 'Example',
        icon: expect.any(String),
        apiVersion: '4.0.0',
      },
    ]);
  });

  it('prefers Lace over other wallets regardless of injection order', () => {
    const wallets: DiscoveredWallet[] = [
      { id: 'other', rdns: 'com.example.wallet', name: 'Example', icon: '', apiVersion: '4.0.0' },
      { id: 'lace', rdns: 'io.lace', name: 'Lace', icon: '', apiVersion: '4.0.0' },
    ];
    expect(pickWallet(wallets)?.id).toBe('lace');
  });

  it('falls back to the first wallet when Lace is absent', () => {
    const wallets: DiscoveredWallet[] = [
      { id: 'other', rdns: 'com.example.wallet', name: 'Example', icon: '', apiVersion: '4.0.0' },
    ];
    expect(pickWallet(wallets)?.id).toBe('other');
    expect(pickWallet([])).toBeUndefined();
  });

  it('gives up after the timeout when no wallet ever appears', async () => {
    clearWindow();
    const started = Date.now();
    await expect(waitForWallets(300)).resolves.toEqual([]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(280);
  });

  it('picks up a wallet that is injected after first paint', async () => {
    clearWindow();
    setTimeout(() => injectWindow({ lace: injectedWallet('io.lace', 'Lace') }), 200);

    const found = await waitForWallets(3000);
    expect(found.map((w) => w.rdns)).toEqual(['io.lace']);
  });
});

describe('connecting', () => {
  it('throws WalletNotFoundError when no wallet is installed', async () => {
    clearWindow();
    await expect(connectWallet()).rejects.toBeInstanceOf(WalletNotFoundError);
  });

  it('connects on the target network and batches every permission up front', async () => {
    const hintUsage = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn().mockResolvedValue({ hintUsage });
    injectWindow({ lace: injectedWallet('io.lace', 'Lace', connect) });

    const { wallet } = await connectWallet();

    expect(wallet.rdns).toBe('io.lace');
    expect(connect).toHaveBeenCalledWith(NETWORK_ID);
    // A single hintUsage call, covering proving and submission, so casting a
    // vote later never triggers a second approval prompt mid-flow.
    expect(hintUsage).toHaveBeenCalledTimes(1);
    expect(hintUsage.mock.calls[0][0]).toEqual(
      expect.arrayContaining(['getProvingProvider', 'balanceUnsealedTransaction', 'submitTransaction']),
    );
  });

  it('connects to an explicitly chosen wallet instead of the preferred one', async () => {
    const laceConnect = vi.fn();
    const otherConnect = vi.fn().mockResolvedValue({ hintUsage: vi.fn().mockResolvedValue(undefined) });
    injectWindow({
      lace: injectedWallet('io.lace', 'Lace', laceConnect),
      other: injectedWallet('com.example.wallet', 'Example', otherConnect),
    });

    const { wallet } = await connectWallet('other');

    expect(wallet.id).toBe('other');
    expect(otherConnect).toHaveBeenCalledWith(NETWORK_ID);
    expect(laceConnect).not.toHaveBeenCalled();
  });

  it('rejects when the requested wallet id is not installed', async () => {
    injectWindow({ lace: injectedWallet('io.lace', 'Lace') });
    await expect(connectWallet('nonexistent')).rejects.toBeInstanceOf(WalletNotFoundError);
  });
});

describe('session liveness', () => {
  it('reports a live session as connected', async () => {
    const api = { getConnectionStatus: vi.fn().mockResolvedValue({ status: 'connected' }) };
    await expect(isStillConnected(api as never)).resolves.toBe(true);
  });

  it('detects a session the user revoked inside the wallet', async () => {
    const api = { getConnectionStatus: vi.fn().mockResolvedValue({ status: 'disconnected' }) };
    await expect(isStillConnected(api as never)).resolves.toBe(false);
  });

  it('treats a throwing wallet as disconnected rather than crashing the poll', async () => {
    const api = { getConnectionStatus: vi.fn().mockRejectedValue(new Error('extension gone')) };
    await expect(isStillConnected(api as never)).resolves.toBe(false);
  });
});
