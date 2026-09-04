"use client";

import React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export interface RevealTextProps {
  children: string;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  triggerOnView?: boolean;
}

const directionVariants = {
  up: { y: 24, opacity: 0 },
  down: { y: -24, opacity: 0 },
  left: { x: 24, opacity: 0 },
  right: { x: -24, opacity: 0 },
};

function RevealText({
  children,
  direction = "up",
  delay = 0,
  triggerOnView = false,
  className,
}: RevealTextProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const shouldReduceMotion = useReducedMotion();
  const shouldAnimate = (!triggerOnView || inView) && !shouldReduceMotion;

  return (
    <motion.span
      ref={ref}
      className={cn(className)}
      style={{ display: "inline-block" }}
      initial={shouldReduceMotion ? { opacity: 1 } : directionVariants[direction]}
      animate={
        shouldReduceMotion || !shouldAnimate
          ? { opacity: 1 }
          : { x: 0, y: 0, opacity: 1 }
      }
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.25, delay: delay / 1000 }
      }
    >
      {children}
    </motion.span>
  );
}

export { RevealText };
