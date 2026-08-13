// SPDX-License-Identifier: Apache-2.0
//
// Build-time configuration. Set VITE_CONTRACT_ADDRESS in the deployment
// environment (e.g. Vercel project settings) to pre-fill the canonical poll,
// so visitors land on a live tally without pasting an address.

export const DEFAULT_CONTRACT_ADDRESS: string = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

/**
 * Base location of the compiled ZK artifacts, served from `web/public/zk`
 * (populated by scripts/copy-zk-assets.mjs).
 *
 * The same base is handed to both `FetchZkConfigProvider` and the compiled
 * contract's `withCompiledFileAssets`, mirroring how voting-cli passes one
 * `zkConfigPath` to both. The provider resolves
 * `<base>/keys/<circuit>.prover|.verifier` and `<base>/zkir/<circuit>.bzkir`.
 */
export const ZK_BASE_URL = '/zk';
