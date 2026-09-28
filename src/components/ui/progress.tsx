import { cn } from "@/lib/utils";

export function Progress({ value = 0, className }: { value?: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="relative h-full overflow-hidden bg-[linear-gradient(90deg,var(--brand-blue)_0%,oklch(0.6_0.14_235)_55%,oklch(0.68_0.13_205)_100%)] transition-all after:absolute after:inset-0 after:bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,.38)_45%,transparent_70%)]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
