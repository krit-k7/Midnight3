// SPDX-License-Identifier: Apache-2.0
//
// Copies the compiled ZK artifacts from the contract workspace into web/public
// in the layout FetchZkConfigProvider expects:
//
//   public/zk/keys/<circuit>.prover
//   public/zk/keys/<circuit>.verifier
//   public/zk/zkir/<circuit>.bzkir
//
// The artifacts live in `contract/src/managed/voting` and are already committed
// there, so we copy rather than duplicate them in git.

import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const managed = path.resolve(here, '..', '..', 'contract', 'src', 'managed', 'voting');
const outRoot = path.resolve(here, '..', 'public', 'zk');

const CIRCUIT = 'vote';

const copies = [
  [path.join(managed, 'keys', `${CIRCUIT}.prover`), path.join(outRoot, 'keys', `${CIRCUIT}.prover`)],
  [path.join(managed, 'keys', `${CIRCUIT}.verifier`), path.join(outRoot, 'keys', `${CIRCUIT}.verifier`)],
  [path.join(managed, 'zkir', `${CIRCUIT}.bzkir`), path.join(outRoot, 'zkir', `${CIRCUIT}.bzkir`)],
];

for (const [src, dest] of copies) {
  if (!existsSync(src)) {
    console.error(
      `[copy-zk-assets] Missing ${src}\n` +
        `Run \`npm run compact -w @shadowballot/voting-contract\` first.`,
    );
    process.exit(1);
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`[copy-zk-assets] ${path.relative(outRoot, dest)}`);
}

console.log('[copy-zk-assets] done');
