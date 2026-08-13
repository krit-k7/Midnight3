// SPDX-License-Identifier: Apache-2.0
//
// Browser-side mirror of voting-cli/src/common-types.ts: wires the compiled
// voting contract into the midnight-js provider/contract type parameters.

import { Voting, type VotingPrivateState } from '@shadowballot/voting-contract';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js/types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js/contracts';
import type { ProvableCircuitId } from '@midnight-ntwrk/compact-js';

export type VotingCircuits = ProvableCircuitId<Voting.Contract<VotingPrivateState>>;

export const VotingPrivateStateId = 'votingPrivateState';

export type VotingProviders = MidnightProviders<
  VotingCircuits,
  typeof VotingPrivateStateId,
  VotingPrivateState
>;

export type VotingContract = Voting.Contract<VotingPrivateState>;

export type DeployedVotingContract = DeployedContract<VotingContract> | FoundContract<VotingContract>;

/** Snapshot of the public tallies read from the ledger. */
export interface VotingTally {
  yesVotes: bigint;
  noVotes: bigint;
  totalVotes: bigint;
}
