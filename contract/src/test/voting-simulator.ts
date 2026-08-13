// SPDX-License-Identifier: Apache-2.0
//
// Test harness that runs the compiled voting circuits locally (no network,
// no proof server) so we can assert on ledger + private-state transitions.

import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger
} from "../managed/voting/contract/index.js";
import {
  type VotingPrivateState,
  createVotingPrivateState,
  witnesses
} from "../witnesses.js";

export class VotingSimulator {
  readonly contract: Contract<VotingPrivateState>;
  circuitContext: CircuitContext<VotingPrivateState>;

  /**
   * @param voterSecretKey the private identity key for this simulated voter.
   *   Different keys derive different nullifiers; the same key is rejected on a
   *   second vote.
   */
  constructor(voterSecretKey: Uint8Array) {
    this.contract = new Contract<VotingPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState
    } = this.contract.initialState(
      createConstructorContext(
        createVotingPrivateState(voterSecretKey),
        "0".repeat(64)
      )
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState
    );
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public getPrivateState(): VotingPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  /** Swap in a different voter identity for the next vote() call. */
  public setVoterSecretKey(voterSecretKey: Uint8Array): void {
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: createVotingPrivateState(voterSecretKey)
    };
  }

  public vote(choice: boolean): Ledger {
    this.circuitContext = this.contract.impureCircuits.vote(
      this.circuitContext,
      choice
    ).context;
    return ledger(this.circuitContext.currentQueryContext.state);
  }
}
