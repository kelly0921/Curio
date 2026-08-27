export interface TakeawayParts {
  detail: string;
  heading: string | null;
}

export function takeawayParts(value: string): TakeawayParts {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.{2,120}?)\s+—\s+(.+)$/u);
  if (!match) return { detail: trimmed, heading: null };
  return { heading: match[1].trim(), detail: match[2].trim() };
}
