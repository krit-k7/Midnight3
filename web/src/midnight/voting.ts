// SPDX-License-Identifier: Apache-2.0
//
// Contract operations exposed to the UI: join an existing poll, read the public
// tally, and cast a vote.
//
// The privacy-relevant part lives in `freshVoterSecretKey`: a 32-byte key
// generated in the browser and written only to the local private-state store.
// It is supplied to the `vote` circuit as a witness at proving time. What
// reaches the chain is `persistentHash(sk)` — a one-way nullifier that proves
// "this voter has not voted before" without identifying them.

import { Voting, createVotingPrivateState, witnesses, type VotingPrivateState } from '@shadowballot/voting-contract';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js/utils';
import {
  VotingPrivateStateId,
  type DeployedVotingContract,
  type VotingContract,
  type VotingProviders,
  type VotingTally,
} from './contract-types';
import { ZK_BASE_URL } from '../config';

/**
 * Compiled contract binding. Both requirements must be discharged before
 * midnight-js will accept it: witnesses (supplied at call time from private
 * state) and the compiled-asset base, which resolves against the same
 * `ZK_BASE_URL` given to the ZK config provider.
 */
const votingCompiledContract = CompiledContract.make<VotingContract>('voting', Voting.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(ZK_BASE_URL),
);

/**
 * Generate the voter's 32-byte secret identity key. This is the private
 * witness: it never leaves the browser.
 */
const freshVoterSecretKey = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

/** Build a fresh private state holding a new voter secret key. */
export const freshVotingPrivateState = () => createVotingPrivateState(freshVoterSecretKey());

/** The contract instance carrying our witness implementations. */
export const votingContractInstance = new Voting.Contract<VotingPrivateState>(witnesses);

/** Read the public tally straight from the ledger — no wallet required. */
export const readTally = async (
  providers: VotingProviders,
  contractAddress: string,
): Promise<VotingTally | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (contractState == null) return null;
  const l = Voting.ledger(contractState.data);
  return {
    yesVotes: l.yesVotes,
    noVotes: l.noVotes,
    totalVotes: l.yesVotes + l.noVotes,
  };
};

/** Join a poll that is already deployed at `contractAddress`. */
export const joinPoll = async (
  providers: VotingProviders,
  contractAddress: string,
): Promise<DeployedVotingContract> => {
  assertIsContractAddress(contractAddress);
  return await findDeployedContract(providers, {
    contractAddress,
    compiledContract: votingCompiledContract,
    privateStateId: VotingPrivateStateId,
    initialPrivateState: freshVotingPrivateState(),
  });
};

/** Deploy a brand new poll. */
export const deployPoll = async (providers: VotingProviders): Promise<DeployedVotingContract> =>
  await deployContract(providers, {
    compiledContract: votingCompiledContract,
    privateStateId: VotingPrivateStateId,
    initialPrivateState: freshVotingPrivateState(),
  });

/**
 * Cast a ballot. This is the circuit call: it builds a ZK proof (inside the
 * wallet), which the wallet then balances, signs and submits.
 *
 * Throws if this voter's nullifier is already present on-chain — the
 * contract's `assert(!nullifiers.member(nullifier))` rejects a second ballot.
 */
export const castVote = async (
  contract: DeployedVotingContract,
  choice: boolean,
): Promise<{ txId: string; blockHeight: number }> => {
  const finalized = await contract.callTx.vote(choice);
  return {
    txId: finalized.public.txId,
    blockHeight: finalized.public.blockHeight,
  };
};