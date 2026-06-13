function clean(value: string): string {
  return value.trim();
}

function join(parts: string[]): string {
  return parts.map(clean).filter(Boolean).join(' ');
}

export function composeBrowserTranscript(
  finalTranscript: string,
  interimTranscript: string,
): string {
  return join([finalTranscript, interimTranscript]);
}

export type TranscriptionSession = {
  display: (recognizedText: string) => string;
  complete: (recognizedText: string) => string;
};

export function createTranscriptionSession(initialText: string): TranscriptionSession {
  const baseline = clean(initialText);
  const compose = (recognizedText: string) => join([baseline, recognizedText]);

  return {
    display: compose,
    complete: compose,
  };
}
