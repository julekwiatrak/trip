import type { EventType, TransportMode } from "./types";

type IconProps = { type: EventType; transport?: TransportMode };

export function EventIcon({ type, transport }: IconProps) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "travel") {
    if (transport === "flight") {
      return <svg {...common}><path d="m3 14 7-2 7-8 2 1-4 8 5 2-1 2-6-1-3 5-2-1 1-5-5-1-2 2Z"/></svg>;
    }
    if (transport === "bus") {
      return <svg {...common}><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M8 19v2m8-2v2M7 8h10M8 14h.01M16 14h.01"/></svg>;
    }
    if (transport === "taxi") {
      return <svg {...common}><path d="M5 11 7 6h10l2 5M4 11h16v7H4v-7Zm3 7v2m10-2v2M7 14h.01M17 14h.01M10 6V4h4v2"/></svg>;
    }
    return <svg {...common}><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M8 21l2-3m6 3-2-3M8 8h8M8 13h.01M16 13h.01"/></svg>;
  }
  if (type === "hotel-stay") {
    return <svg {...common}><path d="M3 19v-9m18 9v-6a3 3 0 0 0-3-3H9v9M3 15h18M6 10V7h3a3 3 0 0 1 3 3"/></svg>;
  }
  if (type === "food-drink") {
    return <svg {...common}><path d="M7 3h10l-1 7a4 4 0 0 1-8 0L7 3Zm5 11v7m-4 0h8M8 8h8"/></svg>;
  }
  return <svg {...common}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>;
}
