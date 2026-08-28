import {
  Barcode,
  Boxes,
  Container,
  Cpu,
  FileStack,
  HardHat,
  PackageOpen,
  Plug,
  SprayCan,
  Warehouse,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * No stock photography here — a made-up product photo would be the one clearly
 * fake thing on an otherwise real screen. Instead: a stable category glyph,
 * which is also what a real catalogue shows for a SKU with no image yet.
 */
const CATEGORY_ICON: Record<string, typeof Boxes> = {
  "Barcode & Labelling": Barcode,
  "Material Handling": Warehouse,
  "Safety & PPE": HardHat,
  "Packaging & Shipping": PackageOpen,
  "Storage & Shelving": Container,
  "Computing & Peripherals": Cpu,
  "Power & Electrical": Plug,
  "Facility & Janitorial": SprayCan,
  "Consumables & Paper": FileStack,
};

const TONES = [
  "bg-chart-1/10 text-chart-1",
  "bg-chart-2/10 text-chart-2",
  "bg-chart-3/10 text-chart-3",
  "bg-chart-4/10 text-chart-4",
  "bg-chart-5/10 text-chart-5",
  "bg-chart-6/10 text-chart-6",
];

function toneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

export function ProductThumb({
  category,
  sku,
  size = "sm",
  className,
}: {
  category: string;
  sku: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category] ?? Boxes;
  const box = size === "lg" ? "size-20 rounded-lg" : size === "md" ? "size-10 rounded-md" : "size-7 rounded";
  const glyph = size === "lg" ? "size-8" : size === "md" ? "size-5" : "size-3.5";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center border",
        box,
        toneFor(sku),
        className,
      )}
      aria-hidden
    >
      <Icon className={glyph} strokeWidth={1.75} />
    </span>
  );
}
