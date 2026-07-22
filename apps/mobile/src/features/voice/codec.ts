interface RealtimeContentPart {
  text?: string;
  transcript?: string;
}

interface RealtimeOutputItem {
  content?: RealtimeContentPart[];
}

export interface RealtimeResponse {
  id?: string;
  output?: RealtimeOutputItem[];
  status?: string;
}

export function float32ToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(index * 2, Math.round(pcm), true);
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function audioLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let squareSum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    squareSum += sample * sample;
  }
  return Math.min(1, Math.sqrt(squareSum / samples.length) * 5);
}

export function extractResponseTranscript(response?: RealtimeResponse): string {
  if (!response?.output) return '';
  const parts: string[] = [];
  for (const item of response.output) {
    for (const part of item.content ?? []) {
      const text = part.transcript ?? part.text;
      if (text?.trim()) parts.push(text.trim());
    }
  }
  return parts.join(' ').trim();
}

export function isSilentResponse(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (!clean) return false;
  return (
    clean === '<silent/>' ||
    clean === '<silent>' ||
    clean === 'silent' ||
    clean.startsWith('<') ||
    clean.startsWith('thought') ||
    clean.includes('remain silent') ||
    clean.includes('not related to the cooking process')
  );
}
