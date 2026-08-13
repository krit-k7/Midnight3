// SPDX-License-Identifier: Apache-2.0
//
// React binding for the Lace connection lifecycle.
//
// Connect: discover -> connect(networkId) -> hintUsage -> build providers.
// Disconnect: drop the ConnectedAPI + providers and reset state. The connector
// API has no disconnect method, so "disconnected" is a DApp-side condition; we
// also poll `getConnectionStatus()` so revoking access inside the wallet is
// reflected here.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  connectWallet,
  isStillConnected,
  waitForWallets,
  WalletNotFoundError,
  type DiscoveredWallet,
} from '../midnight/connector';
import { createProviders } from '../midnight/providers';
import type { VotingProviders } from '../midnight/contract-types';

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WalletInfo {
  name: string;
  icon: string;
  apiVersion: string;
  networkId: string;
  unshieldedAddress: string;
  dust: { balance: bigint; cap: bigint };
}

export interface UseWallet {
  status: WalletStatus;
  error: string | null;
  /** Wallets detected in the page, for the "install Lace" empty state. */
  available: DiscoveredWallet[];
  info: WalletInfo | null;
  providers: VotingProviders | null;
  api: ConnectedAPI | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const useWallet = (): UseWallet => {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<DiscoveredWallet[]>([]);
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [providers, setProviders] = useState<VotingProviders | null>(null);
  const apiRef = useRef<ConnectedAPI | null>(null);

  // Detect injected wallets on mount so the UI can tell "not installed" apart
  // from "installed but not connected".
  useEffect(() => {
    let cancelled = false;
    void waitForWallets().then((found) => {
      if (!cancelled) setAvailable(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const disconnect = useCallback(() => {
    apiRef.current = null;
    setProviders(null);
    setInfo(null);
    setError(null);
    setStatus('disconnected');
  }, []);

  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    try {
      const { api, wallet } = await connectWallet();
      apiRef.current = api;

      const [config, unshielded, dust] = await Promise.all([
        api.getConfiguration(),
        api.getUnshieldedAddress(),
        api.getDustBalance(),
      ]);

      const built = await createProviders(api);

      setInfo({
        name: wallet.name,
        icon: wallet.icon,
        apiVersion: wallet.apiVersion,
        networkId: config.networkId,
        unshieldedAddress: unshielded.unshieldedAddress,
        dust: { balance: dust.balance, cap: dust.cap },
      });
      setProviders(built);
      setStatus('connected');
    } catch (e) {
      const message =
        e instanceof WalletNotFoundError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(message);
      setStatus('error');
      apiRef.current = null;
    }
  }, []);

  // If the user revokes the session from inside the wallet, reflect it here.
  useEffect(() => {
    if (status !== 'connected') return;
    const handle = setInterval(() => {
      const api = apiRef.current;
      if (!api) return;
      void isStillConnected(api).then((live) => {
        if (!live) disconnect();
      });
    }, 10_000);
    return () => clearInterval(handle);
  }, [status, disconnect]);

  return {
    status,
    error,
    available,
    info,
    providers,
    api: apiRef.current,
    connect,
    disconnect,
  };
};
