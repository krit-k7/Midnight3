// SPDX-License-Identifier: Apache-2.0
//
// Application tests for the contract-facing layer.
//
// The Midnight SDK and the compiled contract are stubbed here: these tests are
// about *our* logic sitting on top of them — how a ledger snapshot becomes the
// tally the UI renders, how a finalized transaction becomes the receipt we show
// the voter, and the privacy-relevant invariant that each poll session mints a
// fresh voter secret key rather than reusing one.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ledger = vi.fn();
const createVotingPrivateState = vi.fn((voterSecretKey: Uint8Array) => ({ voterSecretKey }));
const assertIsContractAddress = vi.fn();
const deployContract = vi.fn();
const findDeployedContract = vi.fn();

vi.mock('@shadowballot/voting-contract', () => ({
  Voting: { ledger: (...args: unknown[]) => ledger(...args), Contract: class {} },
  createVotingPrivateState: (...args: [Uint8Array]) => createVotingPrivateState(...args),
  witnesses: {},
}));

vi.mock('@midnight-ntwrk/compact-js', () => ({
  CompiledContract: {
    // `make(...).pipe(a, b)` in voting.ts — a stub token is enough, since the
    // SDK entry points that consume it are themselves stubbed below.
    make: () => ({ pipe: () => 'compiled-contract-stub' }),
    withWitnesses: () => undefined,
    withCompiledFileAssets: () => undefined,
  },
}));

vi.mock('@midnight-ntwrk/midnight-js/contracts', () => ({
  deployContract: (...args: unknown[]) => deployContract(...args),
  findDeployedContract: (...args: unknown[]) => findDeployedContract(...args),
}));

vi.mock('@midnight-ntwrk/midnight-js/utils', () => ({
  assertIsContractAddress: (...args: unknown[]) => assertIsContractAddress(...args),
}));

const { castVote, deployPoll, freshVotingPrivateState, joinPoll, readTally } = await import('./voting');

const ADDRESS = '240c09da2cb5a03df2154c2ecf873331480f367789842d886c7c739f0eaf5d3f';

/**
 * Providers stub whose indexer returns the given contract state. Returns the
 * indexer spy alongside, so a test can assert the query never happened.
 */
const providersReturning = (contractState: unknown) => {
  const queryContractState = vi.fn().mockResolvedValue(contractState);
  return { providers: { publicDataProvider: { queryContractState } } as never, queryContractState };
};

beforeEach(() => {
  vi.clearAllMocks();
  assertIsContractAddress.mockImplementation(() => undefined);
});

describe('reading the public tally', () => {
  it('maps ledger counters to a tally and derives the total', async () => {
    ledger.mockReturnValue({ yesVotes: 7n, noVotes: 3n });

    const tally = await readTally(providersReturning({ data: 'ledger-bytes' }).providers, ADDRESS);

    expect(tally).toEqual({ yesVotes: 7n, noVotes: 3n, totalVotes: 10n });
    expect(ledger).toHaveBeenCalledWith('ledger-bytes');
  });

  it('reports an unknown poll as null instead of an empty tally', async () => {
    // A poll that does not exist and a poll with zero votes must not look the
    // same to the UI: one is an error state, the other a legitimate 0–0 result.
    const tally = await readTally(providersReturning(null).providers, ADDRESS);

    expect(tally).toBeNull();
    expect(ledger).not.toHaveBeenCalled();
  });

  it('still reports a freshly deployed poll with no votes as a real tally', async () => {
    ledger.mockReturnValue({ yesVotes: 0n, noVotes: 0n });

    await expect(readTally(providersReturning({ data: 'ledger-bytes' }).providers, ADDRESS)).resolves.toEqual({
      yesVotes: 0n,
      noVotes: 0n,
      totalVotes: 0n,
    });
  });

  it('rejects a malformed contract address before querying the indexer', async () => {
    assertIsContractAddress.mockImplementation(() => {
      throw new Error('not a contract address');
    });
    const { providers, queryContractState } = providersReturning({ data: 'ledger-bytes' });

    await expect(readTally(providers, 'not-an-address')).rejects.toThrow(/not a contract address/);
    expect(queryContractState).not.toHaveBeenCalled();
  });
});

describe('casting a vote', () => {
  it('returns the transaction receipt from the finalized call', async () => {
    const contract = {
      callTx: { vote: vi.fn().mockResolvedValue({ public: { txId: '0x068f6…de51', blockHeight: 217736 } }) },
    };

    await expect(castVote(contract as never, true)).resolves.toEqual({
      txId: '0x068f6…de51',
      blockHeight: 217736,
    });
    expect(contract.callTx.vote).toHaveBeenCalledWith(true);
  });

  it('passes the NO choice through to the circuit unchanged', async () => {
    const contract = {
      callTx: { vote: vi.fn().mockResolvedValue({ public: { txId: '0xabc', blockHeight: 1 } }) },
    };

    await castVote(contract as never, false);

    expect(contract.callTx.vote).toHaveBeenCalledWith(false);
  });

  it('propagates the contract-side double-vote rejection to the caller', async () => {
    // The `assert(!nullifiers.member(nullifier))` in the circuit surfaces here;
    // the UI depends on it reaching the catch block rather than being swallowed.
    const contract = {
      callTx: { vote: vi.fn().mockRejectedValue(new Error('voter has already cast a vote')) },
    };

    await expect(castVote(contract as never, true)).rejects.toThrow(/already cast a vote/);
  });
});

describe('voter secret key handling', () => {
  it('mints a distinct 32-byte secret key for each poll session', () => {
    const first = freshVotingPrivateState() as unknown as { voterSecretKey: Uint8Array };
    const second = freshVotingPrivateState() as unknown as { voterSecretKey: Uint8Array };

    expect(first.voterSecretKey).toHaveLength(32);
    expect(second.voterSecretKey).toHaveLength(32);
    // Reusing a key across sessions would produce a repeated nullifier, which
    // is exactly what links two ballots to one voter. They must differ.
    expect(Array.from(first.voterSecretKey)).not.toEqual(Array.from(second.voterSecretKey));
  });

  it('never hands the SDK an all-zero (unseeded) key', () => {
    const { voterSecretKey } = freshVotingPrivateState() as unknown as { voterSecretKey: Uint8Array };
    expect(voterSecretKey.some((byte) => byte !== 0)).toBe(true);
  });

  it('joins an existing poll with a fresh private state', async () => {
    findDeployedContract.mockResolvedValue('found-contract');

    await expect(joinPoll(providersReturning(null).providers, ADDRESS)).resolves.toBe('found-contract');

    const options = findDeployedContract.mock.calls[0][1] as { contractAddress: string };
    expect(options.contractAddress).toBe(ADDRESS);
    expect(createVotingPrivateState).toHaveBeenCalledTimes(1);
  });

  it('deploys a new poll with its own fresh private state', async () => {
    deployContract.mockResolvedValue('new-contract');

    await expect(deployPoll(providersReturning(null).providers)).resolves.toBe('new-contract');
    expect(createVotingPrivateState).toHaveBeenCalledTimes(1);
  });
});
