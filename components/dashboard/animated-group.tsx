"use client";

import React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

export function AnimatedGroup({
  children,
  className,
  stagger = 0.05,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduce = useReducedMotion();

  return (
    <div ref={ref} className={className}>
      {React.Children.map(children, (child, i) =>
        React.isValidElement(child) ? (
          <motion.div
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: 12 }}
            animate={
              inView
                ? { opacity: 1, y: 0 }
                : reduce
                  ? { opacity: 1 }
                  : { opacity: 0, y: 12 }
            }
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.35, ease: [0.25, 1, 0.5, 1], delay: i * stagger }
            }
          >
            {child}
          </motion.div>
        ) : (
          child
        ),
      )}
    </div>
  );
}
