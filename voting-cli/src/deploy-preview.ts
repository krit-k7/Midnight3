// SPDX-License-Identifier: Apache-2.0
//
// Non-interactive Preview deploy driver.

import { toHex } from '@midnight-ntwrk/midnight-js/utils';
import { generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { Buffer } from 'buffer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger-utils.js';
import { PreviewConfig, currentDir } from './config.js';
import * as api from './api.js';

const SEED_FILE = path.resolve(currentDir, '..', '.deploy-seed');
const RESULT_FILE = path.resolve(currentDir, '..', '.last-deploy.json');
const DIV = '──────────────────────────────────────────────────────────────';

const loadOrCreateSeed = (): string => {
  if (existsSync(SEED_FILE)) {
    const seed = readFileSync(SEED_FILE, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(seed)) {
      console.log(`  Reusing wallet seed from ${SEED_FILE}`);
      return seed;
    }
  }
  const seed = toHex(Buffer.from(generateRandomSeed()));
  writeFileSync(SEED_FILE, seed + '\n', { mode: 0o600 });
  return seed;
};

const main = async (): Promise<void> => {
  const config = new PreviewConfig();
  const logger = await createLogger(config.logDir);
  api.setLogger(logger);

  console.log(`
${DIV}
  ShadowBallot — non-interactive Preview deploy
${DIV}
`);

  const seed = loadOrCreateSeed();
  const walletCtx = await api.buildWalletAndWaitForFunds(config, seed);

  const providers = await api.withStatus('Configuring providers', () =>
    api.configureProviders(walletCtx, config),
  );

  const contract = await api.withStatus('Deploying voting contract to Preview', () =>
    api.deploy(providers, api.freshVotingPrivateState()),
  );
  const contractAddress = contract.deployTxData.public.contractAddress;

  console.log(`
${DIV}
  Contract deployed at: ${contractAddress}
${DIV}
`);

  writeFileSync(
    RESULT_FILE,
    JSON.stringify(
      { network: 'preview', contractAddress, deployedAt: new Date().toISOString() },
      null,
      2,
    ) + '\n',
  );
  console.log(`  Wrote deploy record to ${RESULT_FILE}`);

  try {
    await api.withStatus('Casting YES vote', () => api.vote(contract, true));
    const { tally } = await api.displayVotingTally(providers, contract);
    if (tally !== null) {
      console.log(`\n  YES: ${tally.yesVotes}   NO: ${tally.noVotes}   TOTAL: ${tally.totalVotes}\n`);
    }
  } catch (e) {
    console.log(`  (skipped demo vote: ${e instanceof Error ? e.message : String(e)})`);
  }

  await walletCtx.wallet.stop();
  console.log('  Done.');
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
