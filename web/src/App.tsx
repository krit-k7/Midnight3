// SPDX-License-Identifier: Apache-2.0
//
// ShadowBallot DApp shell.
//
// Flow: connect Lace -> join (or deploy) a poll -> cast a ballot -> watch the
// public tally move. The privacy panel makes the central claim observable: the
// tally changes, but nothing on-chain links the new vote to the connected
// wallet, and a second ballot from the same voter is rejected by proof alone.
// The terminal panel makes it audible/visible in real time, as each step
// actually happens — it is a live log, not a decorative prop.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from './hooks/useWallet';
import { castVote, deployPoll, joinPoll, readTally } from './midnight/voting';
import type { DeployedVotingContract, VotingTally } from './midnight/contract-types';
import { DEFAULT_CONTRACT_ADDRESS } from './config';
import { ShaderBackground } from './ShaderBackground';

type Busy = null | 'joining' | 'deploying' | 'voting';
type LogKind = 'cmd' | 'muted' | 'ok' | 'warn' | 'err';
type LogLine = { id: number; kind: LogKind; text: string };

const short = (s: string, head = 10, tail = 8) =>
  s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;

export const App = () => {
  const wallet = useWallet();
  const [contract, setContract] = useState<DeployedVotingContract | null>(null);
  const [address, setAddress] = useState(DEFAULT_CONTRACT_ADDRESS);
  const [tally, setTally] = useState<VotingTally | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [log, setLog] = useState<LogLine[]>([
    { id: 0, kind: 'muted', text: 'waiting for wallet connection…' },
  ]);
  const logId = useRef(1);
  const logBody = useRef<HTMLDivElement>(null);

  const pushLog = useCallback((kind: LogKind, text: string) => {
    setLog((prev) => [...prev.slice(-40), { id: logId.current++, kind, text }]);
  }, []);

  useEffect(() => {
    logBody.current?.scrollTo({ top: logBody.current.scrollHeight });
  }, [log]);

  useEffect(() => {
    if (wallet.status === 'connected' && wallet.info) {
      pushLog('ok', `wallet connected — ${wallet.info.name} (${wallet.info.networkId})`);
    }
  }, [wallet.status, wallet.info, pushLog]);

  const activeAddress = contract?.deployTxData.public.contractAddress ?? null;

  const refreshTally = useCallback(async () => {
    if (!wallet.providers || !activeAddress) return;
    try {
      setTally(await readTally(wallet.providers, activeAddress));
    } catch {
      /* transient indexer hiccup — keep the last known tally */
    }
  }, [wallet.providers, activeAddress]);

  // Poll the public ledger so the tally reflects votes from other people too.
  useEffect(() => {
    if (!activeAddress) return;
    void refreshTally();
    const h = setInterval(() => void refreshTally(), 8000);
    return () => clearInterval(h);
  }, [activeAddress, refreshTally]);

  const handleJoin = async () => {
    if (!wallet.providers) return;
    setBusy('joining');
    setError(null);
    setNotice(null);
    pushLog('cmd', `$ join_poll --address ${short(address.trim())}`);
    try {
      const joined = await joinPoll(wallet.providers, address.trim());
      setContract(joined);
      setNotice('Joined the poll. A fresh voter key was generated in this browser.');
      pushLog('ok', 'voter key generated locally — never leaves this browser');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      pushLog('err', `join failed — ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDeploy = async () => {
    if (!wallet.providers) return;
    setBusy('deploying');
    setError(null);
    setNotice(null);
    pushLog('cmd', '$ deploy_poll');
    try {
      const deployed = await deployPoll(wallet.providers);
      setContract(deployed);
      setAddress(deployed.deployTxData.public.contractAddress);
      setNotice(`New poll deployed at ${deployed.deployTxData.public.contractAddress}`);
      pushLog('ok', `deployed at ${short(deployed.deployTxData.public.contractAddress)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      pushLog('err', `deploy failed — ${msg}`);
    } finally {
      setBusy(null);
    }
  };

  const handleVote = async (choice: boolean) => {
    if (!contract) return;
    setBusy('voting');
    setError(null);
    setNotice(null);
    pushLog('cmd', `$ cast_vote --choice=${choice ? 'YES' : 'NO'}`);
    pushLog('muted', 'generating local ZK proof…');
    try {
      const { txId, blockHeight } = await castVote(contract, choice);
      pushLog('ok', `proof verified — nullifier committed`);
      pushLog(
        'ok',
        `tx ${short(txId)} confirmed in block ${blockHeight}`,
      );
      setNotice(
        `${choice ? 'YES' : 'NO'} vote accepted in block ${blockHeight} (tx ${short(txId)}). ` +
          `Your nullifier is now spent — the chain knows a unique voter voted, not which one.`,
      );
      await refreshTally();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const dup = /already cast|nullifier/i.test(msg);
      pushLog('err', dup ? 'proof rejected — nullifier already spent' : `vote failed — ${msg}`);
      setError(
        dup
          ? 'Rejected: this voter key has already voted. The proof failed the ' +
            'uniqueness check without ever revealing who you are.'
          : msg,
      );
    } finally {
      setBusy(null);
    }
  };

  const connected = wallet.status === 'connected';
  const yes = Number(tally?.yesVotes ?? 0n);
  const no = Number(tally?.noVotes ?? 0n);
  const total = yes + no;
  const yesPct = total === 0 ? 50 : (yes / total) * 100;

  return (
    <>
      <ShaderBackground />
      <div className="wrap">
        <div className="eyebrow">
          <span className="dot" />
          Powered by Midnight Network · Zero-Knowledge Proofs
        </div>

        <header className="masthead">
          <div>
            <h1>
              <span className="moon">🌒</span> GhostVote
            </h1>
          </div>
          <WalletBar wallet={wallet} />
        </header>

        <h2 className="hero-title">
          Vote in the dark.
          <br />
          <span className="grad">Count in the light.</span>
        </h2>
        <p className="tagline">
          Anonymous voting on Midnight Preprod. The tally is public and auditable; the voter is
          not. Double-voting is blocked by a zero-knowledge proof, not by a server that knows
          who you are.
        </p>

        {/* ── Live proof terminal ──────────────────────────── */}
        <div className="terminal" style={{ marginBottom: 18 }}>
          <div className="terminal-bar">
            <span className="tl-dot r" />
            <span className="tl-dot y" />
            <span className="tl-dot g" />
            <span style={{ marginLeft: 6 }}>ghostvote · midnight-preprod</span>
          </div>
          <div className="terminal-body" ref={logBody}>
            {log.map((line) => (
              <div key={line.id} className={`terminal-line ${line.kind}`}>
                {line.kind === 'cmd' ? <span className="prompt">$</span> : <span className="prompt">›</span>}
                <span>{line.text}</span>
              </div>
            ))}
            <div className="terminal-line">
              <span className="prompt">$</span>
              <span className="terminal-cursor" />
            </div>
          </div>
        </div>

        {/* ── Poll ─────────────────────────────────────────── */}
        <section className="card">
          <h2>Poll</h2>
          {!connected ? (
            <p className="muted">Connect Lace to join a poll and cast a ballot.</p>
          ) : (
            <>
              <div className="row" style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  value={address}
                  spellCheck={false}
                  placeholder="Contract address (0x…)"
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={busy !== null}
                />
                <button onClick={handleJoin} disabled={busy !== null || !address.trim()}>
                  {busy === 'joining' ? 'Joining…' : 'Join'}
                </button>
                <button className="primary" onClick={handleDeploy} disabled={busy !== null}>
                  {busy === 'deploying' ? 'Deploying…' : 'Deploy new'}
                </button>
              </div>
              {activeAddress && (
                <div className="addr" title={activeAddress}>
                  {activeAddress}
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Tally + ballot ───────────────────────────────── */}
        {contract && (
          <section className="card">
            <h2>Live public tally</h2>
            <div className="tally">
              <div className="stat yes">
                <div className="n">{yes}</div>
                <div className="k">Yes</div>
              </div>
              <div className="stat no">
                <div className="n">{no}</div>
                <div className="k">No</div>
              </div>
              <div className="stat">
                <div className="n">{total}</div>
                <div className="k">Total</div>
              </div>
            </div>
            <div className="bar">
              <span style={{ width: `${yesPct}%` }} />
            </div>

            <div className="row" style={{ marginTop: 16 }}>
              <button className="yes" onClick={() => handleVote(true)} disabled={busy !== null}>
                {busy === 'voting' ? 'Proving…' : 'Vote YES'}
              </button>
              <button className="no" onClick={() => handleVote(false)} disabled={busy !== null}>
                {busy === 'voting' ? 'Proving…' : 'Vote NO'}
              </button>
              <button onClick={() => void refreshTally()} disabled={busy !== null}>
                Refresh
              </button>
            </div>
            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Voting builds a ZK proof inside Lace. Try voting twice with the same key — the
              second attempt is rejected on-chain.
            </p>
          </section>
        )}

        {error && <div className="msg err">{error}</div>}
        {notice && <div className="msg ok">{notice}</div>}

        {/* ── Privacy claim ────────────────────────────────── */}
        <section className="card">
          <h2>What is proven vs. what is shown</h2>
          <div className="split">
            <div className="lane private">
              <h3>🔒 Stays in this browser</h3>
              <ul>
                <li>
                  Your 32-byte <code>voterSecretKey</code> — the private witness, held in local
                  private state
                </li>
                <li>The link between your wallet and your ballot</li>
                <li>Which way any individual voted</li>
              </ul>
            </div>
            <div className="lane public">
              <h3>🌐 Written on-chain</h3>
              <ul>
                <li>
                  <code>yesVotes</code> / <code>noVotes</code> — the auditable tally
                </li>
                <li>
                  A one-way <code>nullifier = persistentHash(sk)</code>, unlinkable to your key
                </li>
                <li>Nothing that identifies the voter</li>
              </ul>
            </div>
          </div>
          <div className="msg info">
            <strong>The observable behaviour:</strong> casting a ballot moves the public tally,
            yet the chain records no address, no signature over your choice, and no way to tie
            the two together. Voting a second time from the same key fails the contract's
            <code> assert(!nullifiers.member(nullifier)) </code> check — proving the voter is
            unique <em>without</em> proving who they are.
          </div>
        </section>

        <footer>
          Midnight Preprod · circuits compiled with Compact · proving delegated to your wallet
        </footer>
      </div>
    </>
  );
};

/** Connect / disconnect control plus a summary of the live session. */
const WalletBar = ({ wallet }: { wallet: ReturnType<typeof useWallet> }) => {
  const { status, info, error, available, connect, disconnect } = wallet;

  if (status === 'connected' && info) {
    return (
      <div style={{ textAlign: 'right' }}>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <span className="pill">
            <span className="dot" />
            {info.icon && <img className="wallet-icon" src={info.icon} alt="" />}
            {info.name} · {info.networkId}
          </span>
          <button onClick={disconnect}>Disconnect</button>
        </div>
        <div className="muted" style={{ fontSize: '0.76rem', marginTop: 6 }}>
          {short(info.unshieldedAddress, 14, 10)} · DUST {info.dust.balance.toLocaleString()}
        </div>
      </div>
    );
  }

  const noWallet = available.length === 0;

  return (
    <div style={{ textAlign: 'right' }}>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <span className="pill">
          <span className="dot off" />
          Not connected
        </span>
        {noWallet ? (
          <a href="https://www.lace.io/" target="_blank" rel="noreferrer">
            <button className="primary">Install Lace</button>
          </a>
        ) : (
          <button className="primary" onClick={() => void connect()} disabled={status === 'connecting'}>
            {status === 'connecting' ? 'Connecting…' : 'Connect Lace'}
          </button>
        )}
      </div>
      {status === 'error' && error && (
        <div className="muted" style={{ fontSize: '0.76rem', marginTop: 6, maxWidth: 320 }}>
          {error}
        </div>
      )}
    </div>
  );
};
