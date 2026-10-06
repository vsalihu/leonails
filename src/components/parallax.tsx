"use client";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

/**
 * Restrained vertical parallax for hero photography. Desktop pointer devices
 * only; disabled for reduced motion. Driven by motion values, not React state.
 */
export function Parallax({ children, distance = 48, className = "" }: { children: React.ReactNode; distance?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, distance]);
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <motion.div
        className="absolute inset-[-6%_0] max-lg:!transform-none"
        style={reduce ? undefined : { y }}
      >
        {children}
      </motion.div>
    </div>
  );
}
