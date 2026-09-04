"use client";

import React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
      animate={
        inView
          ? { opacity: 1, y: 0 }
          : shouldReduceMotion
            ? { opacity: 1 }
            : { opacity: 0, y: 16 }
      }
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.4, ease: "easeOut", delay }
      }
    >
      {children}
    </motion.div>
  );
}
