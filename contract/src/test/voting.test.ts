// SPDX-License-Identifier: Apache-2.0

import { VotingSimulator } from "./voting-simulator.js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect } from "vitest";

setNetworkId("undeployed");

// Distinct 32-byte secret keys for distinct simulated voters.
const key = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);

const ALICE = key(1);
const BOB = key(2);
const CAROL = key(3);

describe("Anonymous voting smart contract", () => {
  it("generates initial ledger state deterministically", () => {
    const a = new VotingSimulator(ALICE).getLedger();
    const b = new VotingSimulator(ALICE).getLedger();
    // Compare the meaningful public values rather than the live ledger
    // wrapper objects (whose Set internals carry non-value class state).
    expect([a.yesVotes, a.noVotes, a.nullifiers.size()]).toEqual([
      b.yesVotes,
      b.noVotes,
      b.nullifiers.size()
    ]);
  });

  it("starts with empty tallies and no spent nullifiers", () => {
    const sim = new VotingSimulator(ALICE);
    const l = sim.getLedger();
    expect(l.yesVotes).toEqual(0n);
    expect(l.noVotes).toEqual(0n);
    expect(l.nullifiers.isEmpty()).toBe(true);
  });

  it("keeps the voter secret key in private state, never on the ledger", () => {
    const sim = new VotingSimulator(ALICE);
    sim.vote(true);
    // The private state still holds the raw key...
    expect(sim.getPrivateState().voterSecretKey).toEqual(ALICE);
    // ...but the public ledger only ever stored a derived nullifier, and its
    // size is 1 regardless of the key's contents.
    expect(sim.getLedger().nullifiers.size()).toEqual(1n);
  });

  it("counts a yes vote", () => {
    const sim = new VotingSimulator(ALICE);
    const l = sim.vote(true);
    expect(l.yesVotes).toEqual(1n);
    expect(l.noVotes).toEqual(0n);
  });

  it("counts a no vote", () => {
    const sim = new VotingSimulator(ALICE);
    const l = sim.vote(false);
    expect(l.yesVotes).toEqual(0n);
    expect(l.noVotes).toEqual(1n);
  });

  it("tallies votes from several distinct voters", () => {
    const sim = new VotingSimulator(ALICE);
    sim.vote(true);
    sim.setVoterSecretKey(BOB);
    sim.vote(false);
    sim.setVoterSecretKey(CAROL);
    sim.vote(true);
    const l = sim.getLedger();
    expect(l.yesVotes).toEqual(2n);
    expect(l.noVotes).toEqual(1n);
    expect(l.nullifiers.size()).toEqual(3n);
  });

  it("rejects a second vote from the same secret key (no double voting)", () => {
    const sim = new VotingSimulator(ALICE);
    sim.vote(true);
    expect(() => sim.vote(false)).toThrow(/already cast a vote/);
    // Tally is unchanged by the rejected attempt.
    const l = sim.getLedger();
    expect(l.yesVotes).toEqual(1n);
    expect(l.noVotes).toEqual(0n);
  });
});
