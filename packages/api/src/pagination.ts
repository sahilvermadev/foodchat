export type TimestampCursor = {
  id?: string;
  timestamp: Date;
};

export function encodeTimestampCursor(timestamp: Date, id: string): string {
  return `${timestamp.toISOString()}|${id}`;
}

export function parseTimestampCursor(value?: string): TimestampCursor | undefined {
  if (!value) return undefined;
  const separator = value.lastIndexOf('|');
  const timestampValue = separator >= 0 ? value.slice(0, separator) : value;
  const timestamp = new Date(timestampValue);
  if (Number.isNaN(timestamp.getTime())) return undefined;
  const id = separator >= 0 ? value.slice(separator + 1).trim() : undefined;
  return { timestamp, ...(id ? { id } : {}) };
}
