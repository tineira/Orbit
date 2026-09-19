import type { VoiceSource } from "./voice.ts";

/**
 * Kitten neural mouths. Same ONNX weights on every browser/OS — not Web Speech,
 * not SAM, not the system language pack.
 *
 * Mapped to NEW ORBIT (BLACKISH, 2012): human inner monologue, cold computer,
 * a different person on radio. Filters in audio.ts still sit on top.
 */
export type SpeakVoice = {
  voice: "Hugo" | "Bruno" | "Leo" | "Kiki";
  speed: number;
};

export type SpeakPcm = {
  pcm: Float32Array;
  sampleRate: number;
};

export const SPEAK_VOICES: Record<Exclude<VoiceSource, "static">, SpeakVoice> = {
  // Leonard-in-Memento: deep, close, searching. Not a confident narrator.
  thought: { voice: "Hugo", speed: 0.8 },
  ship: { voice: "Bruno", speed: 0.84 },
  radio: { voice: "Leo", speed: 1.02 },
  alien: { voice: "Kiki", speed: 0.8 },
};

const MAX_CHARS = 180;
/** Must match kitten-tts-js MODELS keys. int8 is not in that list. */
const MODEL_ID = "KittenML/kitten-tts-nano-0.8";

type KittenEngine = {
  generate: (
    text: string,
    opts?: { voice?: string; speed?: number; clean?: boolean },
  ) => Promise<{ data: Float32Array; sampling_rate: number }>;
};

let engine: Promise<KittenEngine> | null = null;
let lastError: string | null = null;

export function lastSpeakError(): string | null {
  return lastError;
}

export function speakPlainText(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^A-Za-z0-9 .,!?'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

function loadEngine(): Promise<KittenEngine> {
  if (!engine) {
    engine = (async () => {
      const ort = await import("onnxruntime-web");
      // Kitten would set wasmPaths to its own /src folder (404). Pin the
      // matching onnxruntime-web dist. Force one thread: Kitten reads
      // hardwareConcurrency and that needs cross-origin isolation.
      ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      const { KittenTTS } = await import("kitten-tts-js");
      try {
        Object.defineProperty(navigator, "hardwareConcurrency", {
          configurable: true,
          get: () => 1,
        });
      } catch {
        /* ignore */
      }
      return KittenTTS.from_pretrained(MODEL_ID);
    })();
  }
  return engine;
}

export async function renderSpeak(source: VoiceSource, text: string): Promise<SpeakPcm | null> {
  if (source === "static") return null;
  const plain = speakPlainText(text);
  if (!plain) return null;
  const spec = SPEAK_VOICES[source];
  lastError = null;
  try {
    const tts = await loadEngine();
    const audio = await tts.generate(plain, { voice: spec.voice, speed: spec.speed, clean: true });
    if (!audio?.data || audio.data.length < 32) {
      lastError = "empty speech buffer";
      return null;
    }
    return { pcm: audio.data, sampleRate: audio.sampling_rate || 24000 };
  } catch (err) {
    engine = null;
    lastError = err instanceof Error ? err.message : String(err);
    console.warn("[voice] Kitten TTS failed:", lastError);
    return null;
  }
}
