import type { EventType } from "./types";

type IconProps = { type: EventType };

export function EventIcon({ type }: IconProps) {
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
    return <svg {...common}><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M8 21l2-3m6 3-2-3M8 8h8M8 13h.01M16 13h.01"/></svg>;
  }
  if (type === "stay") {
    return <svg {...common}><path d="M3 19v-9m18 9v-6a3 3 0 0 0-3-3H9v9M3 15h18M6 10V7h3a3 3 0 0 1 3 3"/></svg>;
  }
  if (type === "food-drink") {
    return <svg {...common}><path d="M7 3h10l-1 7a4 4 0 0 1-8 0L7 3Zm5 11v7m-4 0h8M8 8h8"/></svg>;
  }
  if (type === "arrival") {
    return <svg {...common}><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>;
  }
  if (type === "note") {
    return <svg {...common}><path d="M6 3h9l3 3v15H6V3Z"/><path d="M14 3v4h4M9 12h6m-6 4h6"/></svg>;
  }
  return <svg {...common}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>;
}
