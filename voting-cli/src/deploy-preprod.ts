// This file is part of shadowballot.
// SPDX-License-Identifier: Apache-2.0
//
// Non-interactive Preprod deploy driver.
//
// Runs the full happy path end-to-end without any menu prompts, so the deploy
// can be reproduced (and captured) in one command:
//
//   1. Build a wallet from a persisted seed (generated on first run, reused on
//      restart so a funded address survives a re-run).
//   2. Print the unshielded funding address and block until the faucet funds it.
//   3. Register NIGHT for DUST generation (fee token).
//   4. Deploy the voting contract and print + persist the contract address.
//   5. Cast one YES vote and display the live public tally (best-effort).
//
// The seed is written to `.deploy-seed` and the result to `.last-deploy.json`,
// both git-ignored.

import { toHex } from '@midnight-ntwrk/midnight-js/utils';
import { generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { Buffer } from 'buffer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger-utils.js';
import { PreprodConfig, currentDir } from './config.js';
import * as api from './api.js';

const SEED_FILE = path.resolve(currentDir, '..', '.deploy-seed');
const RESULT_FILE = path.resolve(currentDir, '..', '.last-deploy.json');
const DIV = '──────────────────────────────────────────────────────────────';

/** Load a persisted seed, or generate + persist a fresh one. */
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
  console.log(`
${DIV}
  New Wallet Seed — saved to ${SEED_FILE}
${DIV}
  ${seed}
${DIV}
`);
  return seed;
};

const main = async (): Promise<void> => {
  const config = new PreprodConfig();
  const logger = await createLogger(config.logDir);
  api.setLogger(logger);

  console.log(`
${DIV}
  ShadowBallot — non-interactive Preprod deploy
${DIV}
`);

  const seed = loadOrCreateSeed();

  // Build wallet, print funding address, block until funded, register DUST.
  const walletCtx = await api.buildWalletAndWaitForFunds(config, seed);

  const providers = await api.withStatus('Configuring providers', () =>
    api.configureProviders(walletCtx, config),
  );

  // Deploy.
  const contract = await api.withStatus('Deploying voting contract', () =>
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
      { network: 'preprod', contractAddress, deployedAt: new Date().toISOString() },
      null,
      2,
    ) + '\n',
  );
  console.log(`  Wrote deploy record to ${RESULT_FILE}`);

  // Best-effort: cast one YES vote and show the live tally.
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
