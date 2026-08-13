# 🌓 GhostVote — Vote privately, reveal nothing

[![CI](https://github.com/krit-k7/Midnight3/actions/workflows/ci.yml/badge.svg)](https://github.com/krit-k7/Midnight3/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-31%20passing-brightgreen)](#-testing)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](#-license)

A privacy-first anonymous voting dApp built with **Compact** and deployed on
**Midnight**. Voters cast a yes/no ballot whose tally is public and auditable,
while their identity stays private and unlinkable — enforced by a zero-knowledge
proof rather than by trusting a server.

> *Half light, half shadow.* The tally is fully disclosed. The voter is fully
> concealed. Nothing in between is left to chance — every disclosure in this
> contract is a deliberate `disclose()` call.

**Submission:** First Quarter (Level 3) · **Chosen idea:** Private Voting —
anonymous ballots with publicly verifiable tallies.

---

## 🔗 Live Demo & Contract

| | |
|---|---|
| **Live Demo** | https://midnight3-web.vercel.app/ |
| **Deployed Contract Address** | `240c09da2cb5a03df2154c2ecf873331480f367789842d886c7c739f0eaf5d3f` |
| **Network** | Midnight Preview / Preprod |
| **CI** | [GitHub Actions](https://github.com/krit-k7/Midnight3/actions/workflows/ci.yml) — lint, build, 31 tests, web build on every push |

> To pre-fill the canonical poll address, set `VITE_CONTRACT_ADDRESS=<address>`
> in the Vercel project settings and redeploy. The frontend reads it via
> `import.meta.env.VITE_CONTRACT_ADDRESS` in [`web/src/config.ts`](web/src/config.ts).

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/593035a1-68a6-4915-a63e-06064e60ef9a" />


---

## 💡 Product proposal — Private Voting

**Chosen from the provided idea list: _Private Voting — anonymous ballots with
publicly verifiable tallies._**

### The problem

Small organizations — DAOs, co-ops, unions, university societies, hiring panels
— routinely need a yes/no decision where two properties must hold at once:

1. **The result must be publicly verifiable.** Everyone affected by the outcome
   should be able to check the count themselves, not take an administrator's
   word for it.
2. **Individual ballots must stay private.** People vote differently when their
   boss, their landlord, or their peer group can see how they voted.

Today these are traded off against each other. A Google Form gives you privacy
from other members but total exposure to whoever runs the form. A show of hands
or an on-chain token vote gives you verifiability by destroying privacy. The
usual "private" option is just *"trust the person holding the spreadsheet."*

### The solution

GhostVote removes the trusted party. Each voter holds a 32-byte secret key
that never leaves their browser. To vote, they produce a zero-knowledge proof
that publishes only a **nullifier** — a one-way hash of that key — alongside
their choice. The contract:

- **counts the ballot** into a public `yesVotes` / `noVotes` tally anyone can audit,
- **rejects a second ballot** from the same key, because the nullifier repeats,
- **never learns who voted**, because the nullifier is not invertible.

That is one-person-one-vote enforced cryptographically, with a result anyone can
recount, and no administrator who could deanonymize anyone even if compelled to.

### Scope of this submission

| In scope (built) | Out of scope (deliberately) |
|---|---|
| Single yes/no proposal per deployed poll | Multi-option / ranked ballots |
| Cryptographic one-person-one-vote via nullifiers | Voter *eligibility* (see below) |
| Public live tally, refreshed every 8s | Vote delegation, quorum rules |
| Browser dApp with Lace wallet + in-wallet proving | Deadlines / automatic poll closing |
| CLI for deploying and scripted voting | Hosted multi-poll directory |

**The honest limitation:** this contract enforces *one ballot per secret key*,
not *one ballot per eligible human*. Anyone who can generate a key can vote, so
as built it is an anonymous **open** poll. Gating eligibility is the natural next
milestone: commit an allowlist of registered voter-key hashes to the ledger at
deploy time and have the circuit additionally prove Merkle membership in it. The
nullifier machinery here is exactly what that upgrade builds on — it is the
part that is hard to retrofit, and it is already done.

### Who it is for, next

The eventual product is *"create a private poll, share a link, get a result
nobody can quietly rig."* The contract in this repo is that product's trust
anchor; the web app in this repo is its first usable surface.

---

## 🔒 Privacy model — what an observer can and cannot learn

This is the core of the submission. Below is a precise account of what someone
watching the chain actually sees. It includes the limits, not just the wins.

### Threat model

The observer we defend against is **anyone with full read access to the Midnight
ledger and indexer** — including the people who ran the poll. They can read every
byte of public state and every transaction, for as long as the chain exists.

### What the observer CAN learn

| Visible | Why it is visible |
|---|---|
| The running `yesVotes` and `noVotes` counts | This *is* the product — a publicly verifiable tally |
| The exact number of ballots cast | It equals `nullifiers.size()` |
| Each ballot's **choice**, individually | Each vote is one transaction; the state diff shows which counter incremented |
| Each ballot's **nullifier** (32 opaque bytes) | Published so the contract can reject a repeat vote |
| **When** each ballot was cast (block height / time) | Transactions are timestamped on a public chain |
| That every ballot came from a *distinct* key | That is precisely what the nullifier set proves |

### What the observer CANNOT learn

| Hidden | Why it stays hidden |
|---|---|
| **Any voter's secret key** | It is a `witness`, consumed inside the circuit; it is never written to the ledger |
| **Which key produced which nullifier** | `persistentHash` is one-way — the nullifier is not invertible |
| **How any given person voted** | The ballot is never linked on-chain to an identity, only to an opaque nullifier |
| **Whether two ballots share a voter** | They cannot — a repeat key is rejected outright, so no such pair exists to detect |
| **Who has *not* voted yet** | The ledger holds no roster; absence is unobservable |

The pivot is the third row of each table taken together: an observer sees
*"a YES ballot was cast at block 217736 by nullifier `0x8f3a…`"* and can never
turn `0x8f3a…` into a person.

### Where the anonymity actually ends

Being straight about the boundary matters more than claiming a perfect one:

- **Per-ballot choices are public, by design.** GhostVote anonymizes *who*,
  not *what*. If an observer learns by any other means that you voted at 14:32,
  the chain tells them how. A scheme that hides individual choices until a
  reveal phase (committed tallies, homomorphic counting) is a different and
  heavier design; this one deliberately trades that for a live, always-auditable
  tally.
- **Transaction metadata sits outside the circuit.** The ZK proof severs the
  key→ballot link at the contract level, but the transaction still has to be
  balanced, signed and submitted by a wallet, and it reaches the network from
  some IP address. An adversary correlating fee payment or network-level
  metadata operates below the layer this contract controls. Treat the
  cryptographic anonymity set as an upper bound on real-world anonymity, not a
  guarantee of it.
- **Small polls leak statistically.** With three voters and a 3–0 result,
  everyone's vote is known regardless of cryptography. Nullifiers cannot fix
  arithmetic.
- **The secret key is only as private as the browser holding it.** It lives in
  the local private-state store. Device compromise is voter compromise.

### The disclosure decisions in code

Everything public is public because a `disclose()` call put it there. There are
exactly two, and neither reveals a voter — see
[`contract/src/voting.compact`](contract/src/voting.compact):

```compact
export circuit vote(choice: Boolean): [] {
  const sk = voterSecretKey();                              // private witness

  // ONE-WAY hash of the secret key. Publishing it proves "this voter hasn't
  // voted yet" without exposing — or being reversible to — the key itself.
  const nullifier = disclose(persistentHash<Bytes<32>>(sk));

  assert(!nullifiers.member(nullifier), "voter has already cast a vote");
  nullifiers.insert(nullifier);

  // The choice must be public (it IS the tally) but is never linked to sk.
  if (disclose(choice)) {
    yesVotes.increment(1);
  } else {
    noVotes.increment(1);
  }
}
```

| Value | Domain | On-chain? | Why |
|-------|--------|-----------|-----|
| `voterSecretKey()` | **private witness** | ❌ never | It is the voter's identity |
| `persistentHash(sk)` (nullifier) | disclosed | ✅ | One-way; proves uniqueness, not identity |
| `choice` | disclosed | ✅ | It is the vote being counted |
| `yesVotes` / `noVotes` | public ledger | ✅ | The auditable result |

Two tests assert this boundary directly rather than describing it: one checks
the secret key stays in private state while only a derived nullifier reaches the
ledger, another checks a repeat vote from the same key is rejected and leaves the
tally untouched.

---

## 🧪 Testing

**31 tests across two suites, all passing.**

```bash
npm run test:all        # both suites
```

```
 ✓ contract/src/test/voting.test.ts    (7 tests)
 ✓ web/src/midnight/voting.test.ts    (11 tests)
 ✓ web/src/midnight/connector.test.ts (13 tests)

 Test Files  3 passed (3)
      Tests  31 passed (31)
```

### Contract tests — 7 (`contract/src/test/`)

Run the **real compiled circuits** locally against a simulated ledger, no
network required:

| Test | Asserts |
|---|---|
| deterministic initial state | Two fresh deployments produce identical public state |
| empty initial tallies | Starts at 0–0 with no spent nullifiers |
| **secret key never reaches the ledger** | Key stays in private state; only a nullifier is published |
| counts a yes vote / counts a no vote | Each choice increments the correct counter |
| tallies several distinct voters | Three distinct keys → 2 YES / 1 NO / 3 nullifiers |
| **rejects double voting** | A second vote on the same key throws, and the tally is unchanged |

### Application tests — 24 (`web/src/midnight/`)

Cover the dApp logic sitting on top of the SDK:

- **Wallet lifecycle (13)** — discovery when nothing is injected, Lace preferred
  over other wallets regardless of injection order, late injection after first
  paint, timeout when no wallet appears, explicit wallet selection, a single
  batched `hintUsage` covering proving *and* submission (so a vote never stalls
  on a second prompt mid-flow), and session liveness including a wallet that
  throws being treated as disconnected rather than crashing the poll loop.
- **Contract interaction (11)** — ledger counters mapped to a tally with a
  derived total, an unknown poll reported as `null` rather than a fake 0–0
  result, a malformed address rejected *before* the indexer is queried, the
  transaction receipt returned from a finalized call, the contract's
  double-vote rejection propagating to the UI, and — the privacy-relevant one —
  **every poll session minting a distinct, non-zero 32-byte voter key**, since a
  reused key would produce a repeated nullifier and link two ballots to one
  voter.

Writing these caught a real defect: `discoverWallets()` threw a `ReferenceError`
instead of returning `[]` when `window` was absent, despite a guard immediately
below implying that case was handled. Fixed in
[`web/src/midnight/connector.ts`](web/src/midnight/connector.ts).

### Running individually

```bash
npm run test -w @GhostVote/voting-contract   # 7 contract tests
npm run test -w @GhostVote/web               # 24 application tests
```

---

## ⚙️ CI/CD

[![CI](https://github.com/Anuoluwapo25/GhostVote/actions/workflows/ci.yml/badge.svg)](https://github.com/Anuoluwapo25/GhostVote/actions/workflows/ci.yml)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on **every push and
pull request on every branch**:

| Step | Command |
|---|---|
| Install (lockfile-exact) | `npm ci` |
| Lint contract package | `npm run lint -w @GhostVote/voting-contract` |
| Build contract bindings | `npm run build -w @GhostVote/voting-contract` |
| Contract tests | `npm run test -w @GhostVote/voting-contract` |
| Type-check web app | `npx tsc -p web/tsconfig.json --noEmit` |
| Application tests | `npm run test -w @GhostVote/web` |
| Production web build | `npm run build:web` |
| Upload JUnit reports | always, including on failure |

Notes on the design:

- **`npm ci`, not `npm install`** — installs exactly the lockfile and fails
  loudly if `package.json` and `package-lock.json` have drifted.
- **Concurrency group** — a newer push to a branch cancels the in-flight run.
- **No Compact toolchain needed** — the generated `managed/` circuits and
  proving keys are committed deliberately (see the note at the bottom of
  [`.gitignore`](.gitignore)), so CI compiles and tests without installing the
  compiler. Recompiling is a local step: `npm run compact -w @GhostVote/voting-contract`.
- **Reports uploaded with `if: always()`** — a red run still shows which cases broke.

**CD:** the web app deploys to Vercel from `main` ([`vercel.json`](vercel.json)),
building through the workspace so the contract package is compiled first.

---

## 🗂 Repository layout

```
.
├── .github/workflows/ci.yml   # CI: lint → build → 31 tests → web build
├── contract/                  # Compact contract + tests (compiles to ZK circuits)
│   ├── src/
│   │   ├── voting.compact      # THE CONTRACT — witness, nullifier, disclose()
│   │   ├── witnesses.ts        # private-state type + witness implementation
│   │   ├── managed/voting/     # GENERATED: circuits + proving/verifier keys
│   │   └── test/               # 7 tests — run the real circuits locally
│   └── package.json
├── voting-cli/                # deploy + interact CLI (Preprod/Preview)
│   ├── src/
│   │   ├── api.ts              # wallet, providers, deploy, vote
│   │   ├── cli.ts              # interactive menu
│   │   ├── config.ts           # network endpoints
│   │   └── deploy-preview.ts   # non-interactive deploy script
│   └── proof-server.yml        # Docker proof server
└── web/                       # React browser dApp (Vite + TypeScript)
    ├── src/
    │   ├── App.tsx             # UI: connect wallet, join/deploy poll, vote
    │   ├── config.ts           # ZK_BASE_URL + VITE_CONTRACT_ADDRESS
    │   ├── hooks/useWallet.ts  # Lace connect/disconnect lifecycle
    │   └── midnight/
    │       ├── connector.ts    # window.midnight discovery + connect
    │       ├── connector.test.ts   # 13 application tests
    │       ├── providers.ts    # midnight-js provider assembly
    │       ├── voting.ts       # castVote / joinPoll / deployPoll / readTally
    │       └── voting.test.ts      # 11 application tests
    └── vitest.config.ts
```

---

## 🧩 How the privacy model is implemented

### Private witness (never leaves the voter's machine)

```compact
witness voterSecretKey(): Bytes<32>;
```

The voter's 32-byte secret identity key. Generated in the browser with
`crypto.getRandomValues`, stored only in the local private-state store
(`votingPrivateState`), supplied to the circuit at proving time, and **never
written to the ledger**. Per the Compact security model its result is treated as
untrusted input.

### Public ledger state (visible on-chain to everyone)

```compact
export ledger yesVotes: Counter;           // running tally of YES votes
export ledger noVotes: Counter;            // running tally of NO votes
export ledger nullifiers: Set<Bytes<32>>;  // spent nullifiers (anti double-vote)
```

### Proving happens inside the wallet

The browser never runs a proof server. `getProvingProvider` hands the ZK key
material to Lace, which builds the proof, balances the transaction and submits
it ([`web/src/midnight/providers.ts`](web/src/midnight/providers.ts)):

```typescript
const zkConfigProvider = new FetchZkConfigProvider<VotingCircuits>(ZK_BASE_URL);
const provingProvider = await api.getProvingProvider(zkConfigProvider.asKeyMaterialProvider());
const proofProvider = createProofProvider(provingProvider);
```

The circuit call itself ([`web/src/midnight/voting.ts`](web/src/midnight/voting.ts)):

```typescript
export const castVote = async (contract, choice: boolean) => {
  const finalized = await contract.callTx.vote(choice);   // ← ZK proof built in Lace
  return { txId: finalized.public.txId, blockHeight: finalized.public.blockHeight };
};
```

---

## 🛠 Prerequisites

| Tool | Version used | Notes |
|------|--------------|-------|
| Node.js | 20.x / 22.x | see `.nvmrc`; CI runs 20 |
| Docker | 29.x | runs the proof server (CLI deploys only) |
| Compact toolchain | `compact` 0.5.1 / compiler 0.31.1 | only needed to *recompile* the contract |
| Lace wallet | Midnight extension | set to Preprod, for the browser dApp |

Install the Compact toolchain (only if you want to recompile):

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update
compact --version
```

---

## 🚀 Run locally

### 1. Install dependencies

```bash
npm ci
```

### 2. Run the tests

```bash
npm run test:all
```

Expected: **31 passed**. No network, no wallet, no Docker required — the
contract suite runs the compiled circuits directly.

### 3. (Optional) Recompile the contract → ZK circuits

```bash
npm run compact -w @GhostVote/voting-contract
```

Generates `managed/voting/` — `compiler/contract-info.json`, TypeScript
bindings, `keys/vote.{prover,verifier}`, and `zkir/vote.{zkir,bzkir}`. Already
committed, so this is only needed after editing `voting.compact`.

### 4. Run the browser dApp

```bash
npm run dev -w @GhostVote/web
```

Opens at `http://localhost:5173`. With the [Lace wallet](https://www.lace.io/)
extension set to **Preprod**:

1. Click **Connect Lace** → approve in the wallet
2. Enter the contract address and click **Join** (or **Deploy new**)
3. Click **Vote YES** or **Vote NO** — Lace generates the ZK proof in-wallet
4. Watch the live tally update every 8 seconds
5. Try voting a second time — the contract rejects it, and the tally does not move

### 5. (Optional) Deploy your own poll from the CLI

```bash
npm run deploy-preprod -w @GhostVote/voting-cli
```

The script loads or generates a wallet seed, prints an unshielded address to
fund from the [Preprod faucet](https://faucet.preprod.midnight.network/), waits
for sync, registers NIGHT for DUST, deploys the contract, casts one YES vote,
prints the live tally, and saves the result to `voting-cli/.last-deploy.json`.

Then set `VITE_CONTRACT_ADDRESS=<your address>` in the Vercel project settings.

---

## ✅ Level 3 requirements checklist

- [x] **Fully functional dApp meaningfully using Midnight's privacy model** — witness-based voter key, `disclose()`-gated nullifier, in-wallet ZK proving
- [x] **Minimum 3 tests passing** — **31 passing** (7 contract + 24 application)
- [x] **CI/CD pipeline running** — [`ci.yml`](.github/workflows/ci.yml), lint + build + tests + web build on every push, badge above
- [x] **Idea from the provided list** — Private Voting (proposal above)
- [x] **Minimum 10 meaningful commits** — see `git log`
- [x] **Complete README** with privacy model and product proposal
- [x] **Live demo link** — https://midnight3-web.vercel.app/
- [x] **Deployed contract** — `240c09da2cb5a03df2154c2ecf873331480f367789842d886c7c739f0eaf5d3f`

---

## 🔎 Contract metadata (generated)

From `managed/voting/compiler/contract-info.json`:

- **compiler-version:** 0.31.1
- **language-version:** 0.23.0
- **runtime-version:** 0.16.0
- **circuits:** `vote(choice: Boolean)` — proof-generating
- **witnesses:** `voterSecretKey(): Bytes<32>` — private
- **ledger:** `yesVotes: Counter`, `noVotes: Counter`, `nullifiers: Set<Bytes<32>>`

---

## 📜 License

Apache-2.0. Contract CLI adapted from the Apache-2.0 licensed
`midnightntwrk/example-counter`.
