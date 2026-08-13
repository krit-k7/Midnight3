// SPDX-License-Identifier: Apache-2.0
//
// Builds the midnight-js provider set from a connected Lace wallet.
//
// The DApp Connector and midnight-js speak different dialects:
//
//   connector: transactions as hex strings, proving delegated to the wallet
//   midnight-js: typed `Transaction` objects, a `ProofProvider` interface
//
// This module is the adapter between them:
//
//   * proving   — `getProvingProvider(keyMaterial)` gives us a Ledger-level
//                 ProvingProvider; `createProofProvider` lifts it to the
//                 transaction-level ProofProvider midnight-js wants. Proving
//                 happens inside the wallet, so the DApp needs no proof server.
//   * balancing — serialize the unbound tx, hand it to the wallet, deserialize
//                 the sealed tx it returns.
//   * submission— serialize and relay through the wallet.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import { createProofProvider } from '@midnight-ntwrk/midnight-js-types';
import type {
  MidnightProvider,
  WalletProvider,
  UnboundTransaction,
} from '@midnight-ntwrk/midnight-js/types';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { MidnightBech32m } from '@midnight-ntwrk/wallet-sdk-address-format';
import type { VotingCircuits, VotingProviders } from './contract-types';
import { VotingPrivateStateId } from './contract-types';
import { ZK_BASE_URL } from '../config';

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

/**
 * The connector returns Bech32m-encoded keys, while midnight-js expects the
 * raw hex form. Decode, then hex-encode the payload.
 */
const bech32mToHex = (address: string): string => {
  const decoded = MidnightBech32m.parse(address);
  return toHex(decoded.data);
};

/**
 * Bridge the connected wallet into the WalletProvider + MidnightProvider pair
 * that midnight-js uses to balance and submit transactions.
 */
export const createWalletProviders = async (
  api: ConnectedAPI,
): Promise<WalletProvider & MidnightProvider> => {
  const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } = await api.getShieldedAddresses();

  const coinPublicKey = bech32mToHex(shieldedCoinPublicKey);
  const encryptionPublicKey = bech32mToHex(shieldedEncryptionPublicKey);

  return {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,

    async balanceTx(tx: UnboundTransaction): Promise<ledger.Transaction<
      ledger.SignatureEnabled,
      ledger.Proof,
      ledger.Binding
    >> {
      // Unbound (pre-binding) tx -> wallet pays fees, adds inputs/outputs,
      // signs and seals it -> sealed (bound) tx ready to submit.
      const { tx: sealedHex } = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
      return ledger.Transaction.deserialize<ledger.SignatureEnabled, ledger.Proof, ledger.Binding>(
        'signature',
        'proof',
        'binding',
        fromHex(sealedHex),
      );
    },

    async submitTx(tx): Promise<string> {
      await api.submitTransaction(toHex(tx.serialize()));
      // The connector resolves void; midnight-js wants an identifier to watch.
      const [identifier] = tx.identifiers();
      return identifier;
    },
  } as WalletProvider & MidnightProvider;
};

/**
 * Assemble the full provider set. Proving is delegated to the wallet, so the
 * only network services we talk to directly are the indexer (public ledger
 * reads) and browser-local storage for the private witness.
 */
export const createProviders = async (api: ConnectedAPI): Promise<VotingProviders> => {
  const config = await api.getConfiguration();

  const zkConfigProvider = new FetchZkConfigProvider<VotingCircuits>(ZK_BASE_URL);

  // The wallet performs the proof; we only supply the circuit key material.
  const provingProvider = await api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider());
  const proofProvider = createProofProvider(provingProvider);

  const walletAndMidnightProvider = await createWalletProviders(api);

  // The private-state store is keyed and encrypted per account, exactly as in
  // voting-cli: the coin public key identifies the account, and its base64 form
  // seeds the storage password.
  const accountId = walletAndMidnightProvider.getCoinPublicKey();
  const storagePassword = `${btoa(String.fromCharCode(...fromHex(accountId)))}!`;

  return {
    // The voter's secret key lives here — IndexedDB in the browser, never sent.
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'shadowballot-private-state',
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    zkConfigProvider,
    proofProvider,
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  } as unknown as VotingProviders;
};

export { VotingPrivateStateId };
