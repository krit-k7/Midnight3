import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedFile = path.join(here, '.deploy-seed');
const seed = readFileSync(seedFile, 'utf8').trim();

const { HDWallet, Roles } = await import('@midnight-ntwrk/wallet-sdk-hd');
const { WalletFacade } = await import('@midnight-ntwrk/wallet-sdk-facade');
const { ShieldedWallet } = await import('@midnight-ntwrk/wallet-sdk-shielded');
const { UnshieldedWallet, createKeystore, PublicKey } = await import('@midnight-ntwrk/wallet-sdk-unshielded-wallet');
const { DustWallet } = await import('@midnight-ntwrk/wallet-sdk-dust-wallet');
const ledger = await import('@midnight-ntwrk/ledger-v8');
const { unshieldedToken } = ledger;
const { setNetworkId, getNetworkId } = await import('@midnight-ntwrk/midnight-js/network-id');
const { PreprodConfig } = await import('./dist/config.js');
const Rx = await import('rxjs');
const { WebSocket } = await import('ws');
globalThis.WebSocket = WebSocket;

setNetworkId('preprod');
const config = new PreprodConfig();

const hw = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
const derived = hw.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
  .deriveKeysAt(0);

const keys = derived.keys;
const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], 'preprod');

const buildShieldedConfig = (cfg) => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: cfg.indexer, indexerWsUrl: cfg.indexerWS },
  provingServerUrl: new URL(cfg.proofServer),
  relayURL: new URL(cfg.node.replace(/^http/, 'ws')),
});

const buildUnshieldedConfig = (cfg) => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: cfg.indexer, indexerWsUrl: cfg.indexerWS },
  txHistoryStorage: { getTransactions: () => Promise.resolve([]), saveTransaction: () => Promise.resolve() },
});

const buildDustConfig = (cfg) => ({
  networkId: getNetworkId(),
  costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  indexerClientConnection: { indexerHttpUrl: cfg.indexer, indexerWsUrl: cfg.indexerWS },
  provingServerUrl: new URL(cfg.proofServer),
  relayURL: new URL(cfg.node.replace(/^http/, 'ws')),
});

const walletConfig = {
  ...buildShieldedConfig(config),
  ...buildUnshieldedConfig(config),
  ...buildDustConfig(config),
};

const wallet = await WalletFacade.init({
  configuration: walletConfig,
  shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
  unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
  dust: (cfg) => DustWallet(cfg).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
});

await wallet.start(shieldedSecretKeys, dustSecretKey);

console.log('Listening to wallet state updates...');
wallet.state().subscribe((state) => {
  const bal = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  const dustBal = state.dust.balance(new Date());
  console.log(`[STATE] isSynced=${state.isSynced} | unshieldedBal=${bal} | dustBal=${dustBal} | coins=${state.unshielded.availableCoins.length}`);
});
