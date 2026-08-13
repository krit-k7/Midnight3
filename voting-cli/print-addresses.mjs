import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedFile = path.join(here, '.deploy-seed');
const seed = readFileSync(seedFile, 'utf8').trim();

const { HDWallet, Roles } = await import('@midnight-ntwrk/wallet-sdk-hd');
const { MidnightBech32m, ShieldedAddress, ShieldedCoinPublicKey, ShieldedEncryptionPublicKey } =
  await import('@midnight-ntwrk/wallet-sdk-address-format');
const ledger = await import('@midnight-ntwrk/ledger-v8');
const { createKeystore } = await import('@midnight-ntwrk/wallet-sdk-unshielded-wallet');
const { setNetworkId } = await import('@midnight-ntwrk/midnight-js/network-id');

function getAddressesForNetwork(network) {
  setNetworkId(network);
  const hw = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  const derived = hw.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  const keys = derived.keys;
  const zswapKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);

  const coinPubHex = zswapKeys.coinPublicKey;
  const encPubHex = zswapKeys.encryptionPublicKey;

  const coinPub = ShieldedCoinPublicKey.fromHexString(coinPubHex);
  const encPub = ShieldedEncryptionPublicKey.fromHexString(encPubHex);
  const shieldedAddr = MidnightBech32m.encode(network, new ShieldedAddress(coinPub, encPub)).toString();

  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], network);
  const unshieldedAddr = unshieldedKeystore.getBech32Address();

  return { shieldedAddr, unshieldedAddr };
}

const preprod = getAddressesForNetwork('preprod');
const preview = getAddressesForNetwork('preview');

const DIV = '────────────────────────────────────────────────────────────';
console.log(`
${DIV}
  PREPROD NETWORK ADDRESSES
  Faucet: https://faucet.preprod.midnight.network/
${DIV}
  Shielded Address:
  ${preprod.shieldedAddr}

  Unshielded Address:
  ${preprod.unshieldedAddr}

${DIV}
  PREVIEW NETWORK ADDRESSES
  Faucet: https://faucet.preview.midnight.network/
${DIV}
  Shielded Address:
  ${preview.shieldedAddr}

  Unshielded Address:
  ${preview.unshieldedAddr}
${DIV}
`);
