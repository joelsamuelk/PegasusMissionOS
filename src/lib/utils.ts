import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Count words in a string the way funders typically do (whitespace split). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Deterministic id helper for the mock store (no Math.random for stability). */
let idCounter = 1000;
export function nextId(prefix = "id"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
