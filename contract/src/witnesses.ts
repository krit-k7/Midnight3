// SPDX-License-Identifier: Apache-2.0

import { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { Ledger } from "./managed/voting/contract/index.js";

/**
 * Private state for the anonymous voting contract.
 *
 * `voterSecretKey` is the voter's secret identity. It lives only on the
 * voter's machine and is never written to the ledger. The contract hashes it
 * into a nullifier (via disclose(persistentHash(...))) so double-voting can be
 * prevented without ever revealing the key on-chain.
 */
export type VotingPrivateState = {
  readonly voterSecretKey: Uint8Array;
};

export const createVotingPrivateState = (
  voterSecretKey: Uint8Array
): VotingPrivateState => ({ voterSecretKey });

export const witnesses = {
  voterSecretKey: ({
    privateState
  }: WitnessContext<Ledger, VotingPrivateState>): [
    VotingPrivateState,
    Uint8Array
  ] => [privateState, privateState.voterSecretKey]
};
