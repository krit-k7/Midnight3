// SPDX-License-Identifier: Apache-2.0
//
// Shared types wiring the compiled voting contract into the midnight-js
// provider/contract APIs. Adapted from the official midnightntwrk/example-counter.

import { Voting, type VotingPrivateState } from '@shadowballot/voting-contract';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js/types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js/contracts';
import type { ProvableCircuitId } from '@midnight-ntwrk/compact-js';

export type VotingCircuits = ProvableCircuitId<Voting.Contract<VotingPrivateState>>;

export const VotingPrivateStateId = 'votingPrivateState';

export type VotingProviders = MidnightProviders<VotingCircuits, typeof VotingPrivateStateId, VotingPrivateState>;

export type VotingContract = Voting.Contract<VotingPrivateState>;

export type DeployedVotingContract = DeployedContract<VotingContract> | FoundContract<VotingContract>;
