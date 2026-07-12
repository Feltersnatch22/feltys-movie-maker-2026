import { useEffect, useRef, useState } from "react";

/** Replace these with your real wallets before shipping. */
export const DONATION_ADDRESSES = {
  btc: "bc1qjzdv0wz6vnh2he76na3888hamn5zycpg7fjpv6",
  eth: "0x5c430BEa591dd67F2C6dB8E805F5Cc64B4Fb13Af",
  sol: "GnG1fTWFZozh65LCcM3jPoYrxrvnmkx2PvFjaCw3CuJM",
} as const;

const CHAINS: { id: keyof typeof DONATION_ADDRESSES; label: string; network: string }[] = [
  { id: "btc", label: "Bitcoin", network: "BTC" },
  { id: "eth", label: "Ethereum", network: "ETH" },
  { id: "sol", label: "Solana", network: "SOL" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function DonationsDialog({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copyAddress(id: string, address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(id);
    } catch {
      setCopied(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="about-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="about-dialog donations-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="donations-title"
      >
        <header className="about-hero">
          <img className="about-logo" src="/applogo.png" alt="" />
          <div className="about-hero-text">
            <h1 id="donations-title">Donations appreciated</h1>
            <p className="about-year">Thank you</p>
          </div>
        </header>

        <p className="donations-intro">
          Felty&apos;s Movie Maker is free to use and built without subscriptions or tracking.
          If it helps you tell a story, a tip keeps the lights on and the next features coming.
        </p>

        <ul className="donations-list">
          {CHAINS.map((c) => {
            const address = DONATION_ADDRESSES[c.id];
            const placeholder = address.startsWith("REPLACE_");
            return (
              <li key={c.id} className="donations-row">
                <div className="donations-row-head">
                  <span className="donations-ticker">{c.network}</span>
                  <span className="donations-name">{c.label}</span>
                </div>
                <code className={`donations-address ${placeholder ? "is-placeholder" : ""}`}>
                  {address}
                </code>
                <button
                  type="button"
                  className="donations-copy"
                  disabled={placeholder}
                  onClick={() => void copyAddress(c.id, address)}
                >
                  {copied === c.id ? "Copied" : "Copy"}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="donations-note">
          Send only on the matching network. Double-check the address before confirming.
        </p>

        <footer className="about-footer">
          <button ref={closeRef} type="button" className="about-close" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
