"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { motion, useScroll, useTransform } from "motion/react";
import type { HeroVideoSource } from "@/lib/server/public-content";

/** Fraction of the clip shown as a still frame to visitors who prefer reduced motion. */
const STILL_AT = 0.62;

/**
 * Full-bleed hero film. A landscape clip for computers and an optional
 * portrait clip for phones (chosen by the browser through `<source media>`).
 *
 * - Playback starts from JS, never from the `autoplay` attribute, so visitors
 *   who prefer reduced motion never see it move: they get a still frame.
 * - The film fades in from the dark ground once frames are ready, so there is
 *   no flash of an empty box or a mismatched poster.
 * - Pauses when off-screen; a visible pause control satisfies WCAG 2.2.2.
 * - On scroll, the film drifts and dims slightly under the next section.
 */
export function HeroFilm({
  desktop,
  mobile,
  label,
}: {
  desktop: HeroVideoSource | null;
  mobile: HeroVideoSource | null;
  label: string;
}) {
  // Read after mount: the server can't know the preference, and rendering the
  // same markup on both sides avoids a hydration mismatch.
  const [reduce, setReduce] = useState<boolean | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const { scrollYProgress } = useScroll({ target: box, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const dim = useTransform(scrollYProgress, [0, 1], [0, 0.55]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const v = film.current;
    if (!v || reduce === null) return;
    if (reduce) {
      // Show one composed frame instead of motion.
      v.pause();
      const seek = () => {
        if (Number.isFinite(v.duration)) v.currentTime = v.duration * STILL_AT;
      };
      if (v.readyState >= 1) seek();
      else v.addEventListener("loadedmetadata", seek, { once: true });
      return () => v.removeEventListener("loadedmetadata", seek);
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || paused) v.pause();
      else void v.play().catch(() => {});
    });
    io.observe(v);
    return () => io.disconnect();
  }, [reduce, paused]);

  function toggle() {
    const v = film.current;
    if (!v) return;
    if (v.paused) {
      setPaused(false);
      void v.play().catch(() => {});
    } else {
      setPaused(true);
      v.pause();
    }
  }

  const sources = [
    mobile && desktop ? { ...mobile, media: "(max-width: 1023px)" } : null,
    desktop ?? mobile,
  ].filter((s): s is HeroVideoSource & { media?: string } => !!s);

  return (
    <>
      <div ref={box} className="absolute inset-0 overflow-hidden bg-night">
        <motion.div className="absolute inset-0 will-change-transform" style={reduce ? undefined : { y }}>
          <video
            ref={film}
            className="hero-film-video absolute inset-0 h-full w-full object-cover object-[50%_72%]"
            data-ready={ready || undefined}
            muted
            loop
            playsInline
            preload={reduce ? "auto" : "metadata"}
            aria-label={label}
            onLoadedData={() => setReady(true)}
            onSeeked={() => setReady(true)}
          >
            {sources.map((s) => (
              <source key={s.src} src={s.src} type={s.type} media={s.media} />
            ))}
          </video>
        </motion.div>
        {!reduce && <motion.div className="pointer-events-none absolute inset-0 bg-night" style={{ opacity: dim }} />}
      </div>
      {!reduce && (
        <button
          type="button"
          onClick={toggle}
          className="on-night group absolute bottom-5 right-4 z-10 inline-flex min-h-11 items-center gap-3 text-[0.68rem] font-medium uppercase tracking-[0.24em] text-ivory/80 transition-colors hover:text-ivory md:right-8 lg:bottom-7 xl:right-12 2xl:right-16"
          aria-label={paused ? "Play video" : "Pause video"}
        >
          <span className="max-sm:hidden">{paused ? "Play film" : "Pause film"}</span>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ivory/35 transition-colors group-hover:border-ivory">
            {paused ? <Play size={13} weight="fill" aria-hidden /> : <Pause size={13} weight="fill" aria-hidden />}
          </span>
        </button>
      )}
    </>
  );
}
