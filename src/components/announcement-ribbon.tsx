"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Pause, Play, X } from "@phosphor-icons/react";
import type { RibbonMessage } from "@/lib/server/public-content";

const DWELL_MS = 6500;

/**
 * The announcement ribbon above the header. Messages take turns: words of the
 * outgoing note lift away and the next one rises in, word by word, while a
 * champagne hairline along the bottom measures the time until the next.
 * Offer codes are set as a perforated tag that copies on tap.
 *
 * Rotation pauses on hover, on keyboard focus, when the tab is hidden and
 * with the pause control (WCAG 2.2.2). Reduced motion swaps without movement
 * (the hairline still keeps time, invisibly).
 * Closing hides it for the rest of the visit, until the messages change.
 */
export function AnnouncementRibbon({ messages }: { messages: RibbonMessage[] }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false); // hover / focus / hidden tab
  const [closedNow, setClosed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [cycle, setCycle] = useState(0); // restarts the progress line
  const root = useRef<HTMLDivElement>(null);
  const many = messages.length > 1;
  const key = `ribbon:${messages.map((m) => m.text + (m.code ?? "")).join("|")}`;
  // Closed earlier in this visit (and the messages haven't changed since)?
  const closedEarlier = useSyncExternalStore(noop, readClosed, () => null) === key;
  const closed = closedNow || closedEarlier;

  useEffect(() => {
    const onVis = () => setHeld(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // The progress hairline is the clock: when its animation ends, the next message comes in.
  // Pausing the animation (hover, focus, hidden tab, pause button) pauses the rotation exactly.
  function advance() {
    setLeaving(index);
    setIndex((i) => (i + 1) % messages.length);
    setCycle((c) => c + 1);
  }

  useEffect(() => {
    if (leaving === null) return;
    const t = window.setTimeout(() => setLeaving(null), 700);
    return () => window.clearTimeout(t);
  }, [leaving]);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 1800);
    } catch {
      /* clipboard blocked: the code stays visible to copy by hand */
    }
  }

  function close() {
    setClosed(true);
    try {
      sessionStorage.setItem("ribbon-closed", key);
    } catch {
      /* ignore */
    }
  }

  if (closed) return null;
  const running = many && !paused && !held;

  return (
    <div
      ref={root}
      className="ribbon on-night relative bg-night text-ivory"
      role="region"
      aria-label="Announcements"
      aria-roledescription="carousel"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(document.hidden)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !root.current?.contains(e.relatedTarget as Node) && setHeld(false)}
    >
      <div className="leopard-dark absolute inset-y-0 left-0 w-1.5" aria-hidden />
      <div className="mx-auto grid min-h-11 max-w-[1440px] grid-cols-[auto_1fr_auto] items-center gap-2 py-1.5 pl-3 pr-1 sm:gap-3 sm:pl-5 sm:pr-2 md:gap-6 md:pl-8 md:pr-6">
        <p className="ribbon-meta flex items-center gap-3 text-[0.62rem] font-medium uppercase tracking-[0.24em] text-champagne-light" aria-hidden>
          <span className="max-md:hidden">Atelier notes</span>
          {many && (
            <span className="tabular-nums text-ivory/55 max-sm:hidden">
              {String(index + 1).padStart(2, "0")}
              <span className="mx-1 text-ivory/30">/</span>
              {String(messages.length).padStart(2, "0")}
            </span>
          )}
        </p>

        <div className="ribbon-stage relative grid min-h-8 items-center" aria-live={running ? "off" : "polite"}>
          {messages.map((m, i) =>
            i === index || i === leaving ? (
              <RibbonLine key={`${i}-${i === index ? cycle : "out"}`} message={m} state={i === index ? "in" : "out"} copied={copied === m.code} onCopy={copy} />
            ) : null,
          )}
        </div>

        <div className="flex items-center">
          {many && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="inline-flex h-9 w-8 items-center justify-center text-ivory/60 transition-colors hover:text-ivory sm:w-9"
              aria-label={paused ? "Play announcements" : "Pause announcements"}
            >
              {paused ? <Play size={11} weight="fill" aria-hidden /> : <Pause size={11} weight="fill" aria-hidden />}
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="inline-flex h-9 w-8 items-center justify-center text-ivory/60 transition-colors hover:text-ivory sm:w-9"
            aria-label="Close announcements"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </div>
      {many && (
        <span
          key={cycle}
          className="ribbon-progress absolute inset-x-0 bottom-0 h-px origin-left bg-champagne-light/80"
          style={{ ["--dwell" as string]: `${DWELL_MS}ms`, animationPlayState: running ? "running" : "paused" }}
          onAnimationEnd={advance}
          aria-hidden
        />
      )}
    </div>
  );
}

const noop = () => () => {};
function readClosed() {
  try {
    return sessionStorage.getItem("ribbon-closed");
  } catch {
    return null; // storage unavailable: always show
  }
}

function RibbonLine({ message, state, copied, onCopy }: { message: RibbonMessage; state: "in" | "out"; copied: boolean; onCopy: (code: string) => void }) {
  const words = message.text.split(/\s+/);
  const text = (
    <span className="ribbon-text">
      {words.map((w, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="ribbon-word" style={{ ["--w" as string]: i }}>
            <span>{w}</span>
          </span>
        </Fragment>
      ))}
    </span>
  );
  const external = message.href?.startsWith("https://");
  return (
    <p className="ribbon-line col-start-1 row-start-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center" data-state={state} aria-hidden={state === "out" || undefined}>
      {message.href ? (
        external ? (
          <a href={message.href} className="ribbon-link group" target="_blank" rel="noopener noreferrer" tabIndex={state === "out" ? -1 : undefined}>
            {text}
            <ArrowRight size={12} aria-hidden className="ribbon-arrow" />
          </a>
        ) : (
          <Link href={message.href} className="ribbon-link group" tabIndex={state === "out" ? -1 : undefined}>
            {text}
            <ArrowRight size={12} aria-hidden className="ribbon-arrow" />
          </Link>
        )
      ) : (
        text
      )}
      {message.code && (
        <button
          type="button"
          className="ribbon-code"
          onClick={() => onCopy(message.code!)}
          aria-label={copied ? `Code ${message.code} copied` : `Copy code ${message.code}`}
          tabIndex={state === "out" ? -1 : undefined}
        >
          <span className="ribbon-code-label">{copied ? "Copied" : message.code}</span>
        </button>
      )}
    </p>
  );
}
