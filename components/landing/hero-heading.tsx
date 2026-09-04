"use client";

import { RevealText } from "@/components/ui/reveal-text";

export function HeroHeading() {
  return (
    <h1 className="font-heading text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
      <RevealText delay={0} direction="up">
        Stock numbers
      </RevealText>{" "}
      <RevealText delay={150} direction="up" className="text-brand">
        you can defend.
      </RevealText>
    </h1>
  );
}
