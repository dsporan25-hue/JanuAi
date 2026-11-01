import type { LanguageCode, VoiceOption } from "../types/piya";

export type MicPermissionState = "prompt" | "granted" | "denied" | "unsupported";

export interface LipSyncFrame {
  mouthOpen: number; // 0.0 to 1.0
  mouthSpread: number; // 0.0 to 1.0
  energy: number; // 0.0 to 1.0
}

export interface RecordedVoicePayload {
  audioBase64: string;
  mimeType: string;
  byteSize: number;
  webFallbackTranscript: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export function resolveApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Safe JSON fetch helper that NEVER throws `Unexpected token '<', "<!doctype "... is not valid JSON`.
 */
export async function fetchApiJson<T>(
  endpoint: string,
  init: RequestInit = {},
  timeoutMs = 22000
): Promise<{ ok: boolean; status: number; data: T }> {
  const controller = new AbortController();
  const externalSignal = init.signal;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(resolveApiUrl(endpoint), {
      ...init,
      signal: controller.signal,
    });

    const rawText = await resp.text();
    const trimmed = rawText.trimStart();

    if (trimmed.startsWith("<")) {
      throw new Error(
        resp.status === 504 || resp.status === 502
          ? "সার্ভার থেকে উত্তর আসতে দেরি হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।"
          : "সার্ভারের সাথে সংযোগে সাময়িক সমস্যা হয়েছে। পৃষ্ঠাটি রিফ্রেশ করে আবার চেষ্টা করুন।"
      );
    }

    let parsed: T;
    try {
      parsed = (trimmed ? JSON.parse(trimmed) : {}) as T;
    } catch {
      throw new Error("সার্ভার থেকে অপ্রত্যাশিত রেসপন্স এসেছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
    }

    return { ok: resp.ok, status: resp.status, data: parsed };
  } catch (err) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error("নেটওয়ার্ক ধীর গতির কারণে সময় শেষ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

export async function queryMicrophonePermission(): Promise<MicPermissionState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "unsupported";
  }
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (status.state === "granted" || status.state === "denied" || status.state === "prompt") {
        return status.state;
      }
    }
  } catch {
    // Fallback if Permissions API doesn't support 'microphone' query in WebView
  }
  return "prompt";
}

export async function requestExplicitMicrophoneAccess(): Promise<{
  state: MicPermissionState;
  error?: string;
}> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      state: "unsupported",
      error: "এই ব্রাউজারে মাইক্রোফোন সাপোর্ট নেই।",
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { state: "granted" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Microphone permission denied.";
    const isDenied = /denied|notallowed|permission/i.test(msg);
    return {
      state: isDenied ? "denied" : "prompt",
      error: isDenied
        ? "মাইক্রোফোন অনুমতি দেওয়া হয়নি। ব্রাউজার বা ফোন সেটিংস থেকে Microphone Allow করুন।"
        : msg,
    };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("অডিও ডেটা পড়া যায়নি।"));
    reader.readAsDataURL(blob);
  });
}

function isAndroidEnvironment(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export class PiyaVoiceEngine {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recognition: SpeechRecognitionInstance | null = null;
  private interimWebTranscript = "";
  private finalWebTranscript = "";

  private inputAudioCtx: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private inputMonitorFrame = 0;

  private sharedPlaybackCtx: AudioContext | null = null;
  private activeBufferSource: AudioBufferSourceNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private outputAnimFrame = 0;
  private synthFallbackInterval = 0;
  private activeTtsAbort: AbortController | null = null;

  private isRecording = false;
  private speechDetectedAt = 0;
  private lastLoudFrameAt = 0;

  /**
   * Unlocks Web Audio & pre-loads system TTS voices synchronously during a user tap gesture
   * so mobile Android browsers never block voice playback after async API responses.
   */
  public unlockAudioOnGesture(): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!this.sharedPlaybackCtx || this.sharedPlaybackCtx.state === "closed") {
          this.sharedPlaybackCtx = new AudioCtx();
        }
        if (this.sharedPlaybackCtx.state === "suspended") {
          this.sharedPlaybackCtx.resume().catch(() => {});
        }
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.getVoices();
      }
    } catch {
      // Ignore audio context init issues
    }
  }

  public async startListeningSession(options: {
    language: LanguageCode;
    onInterimTranscript?: (text: string) => void;
    onInputLevel?: (level: number) => void;
    onAutoSilenceStop?: () => void;
  }): Promise<void> {
    if (this.isRecording) {
      await this.cancelListening();
    }

    this.stopSpeaking();
    this.unlockAudioOnGesture();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("এই ব্রাউজারে মাইক্রোফোন সাপোর্ট নেই।");
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/denied|notallowed|permission/i.test(msg)) {
        throw new Error(
          options.language === "hi"
            ? "माइक्रोफ़ोन की अनुमति नहीं मिली। कृपया ब्राउज़र में Microphone Allow करें।"
            : "মাইক্রোফোন অনুমতি পাওয়া যায়নি। অনুগ্রহ করে ব্রাউজারে Microphone Allow করুন।"
        );
      }
      throw new Error(
        options.language === "hi"
          ? "माइक्रोफ़ोन चालू नहीं हो सका। कृपया फिर से प्रयास करें।"
          : "মাইক্রোফোন চালু করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।"
      );
    }

    this.mediaStream = stream;
    this.audioChunks = [];
    this.interimWebTranscript = "";
    this.finalWebTranscript = "";
    this.isRecording = true;
    this.speechDetectedAt = 0;
    this.lastLoudFrameAt = performance.now();

    // Time-domain RMS voice activity detector (works accurately across Android & Desktop mics)
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.inputAudioCtx = new AudioCtx();
    if (this.inputAudioCtx.state === "suspended") {
      await this.inputAudioCtx.resume().catch(() => {});
    }

    const source = this.inputAudioCtx.createMediaStreamSource(stream);
    this.inputAnalyser = this.inputAudioCtx.createAnalyser();
    this.inputAnalyser.fftSize = 512;
    source.connect(this.inputAnalyser);

    const timeDomain = new Uint8Array(this.inputAnalyser.fftSize);
    const sessionStartedAt = performance.now();
    let noiseFloor = 0.008;

    const monitorInput = () => {
      if (!this.isRecording || !this.inputAnalyser) return;
      this.inputAnalyser.getByteTimeDomainData(timeDomain);

      let sumSquares = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const sample = (timeDomain[i] - 128) / 128;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / timeDomain.length);
      const visualLevel = Math.min(1, rms * 6.5);
      options.onInputLevel?.(visualLevel);

      const now = performance.now();
      const adaptiveThreshold = Math.max(0.02, Math.min(0.055, noiseFloor * 2.4));

      if (rms > adaptiveThreshold) {
        if (!this.speechDetectedAt) {
          this.speechDetectedAt = now;
        }
        this.lastLoudFrameAt = now;
      } else if (!this.speechDetectedAt) {
        noiseFloor = noiseFloor * 0.94 + rms * 0.06;
      }

      // Fast auto-finish: after >= 300ms of speech followed by 950ms pause, or 14s max cap
      if (
        (this.speechDetectedAt > 0 &&
          now - this.speechDetectedAt > 300 &&
          now - this.lastLoudFrameAt > 950) ||
        now - sessionStartedAt > 14000
      ) {
        options.onAutoSilenceStop?.();
        return;
      }

      this.inputMonitorFrame = requestAnimationFrame(monitorInput);
    };
    this.inputMonitorFrame = requestAnimationFrame(monitorInput);

    // Compact 24kbps speech encoding for fast mobile 4G upload
    const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

    const recorderOptions: MediaRecorderOptions = preferredMime
      ? { mimeType: preferredMime, audioBitsPerSecond: 24000 }
      : { audioBitsPerSecond: 24000 };

    try {
      this.mediaRecorder = new MediaRecorder(stream, recorderOptions);
    } catch {
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.audioChunks.push(ev.data);
      }
    };
    this.mediaRecorder.start(150);

    // IMPORTANT: Never start webkitSpeechRecognition alongside MediaRecorder on Android!
    // On Android OS, SpeechRecognition steals exclusive hardware mic access and mutes MediaRecorder.
    if (!isAndroidEnvironment()) {
      const SpeechRecConstructor =
        (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
          .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
          .webkitSpeechRecognition;

      if (SpeechRecConstructor) {
        try {
          const rec = new SpeechRecConstructor();
          rec.lang = options.language === "hi" ? "hi-IN" : "bn-BD";
          rec.continuous = true;
          rec.interimResults = true;
          rec.onresult = (event: SpeechRecognitionEventLike) => {
            let finalPart = "";
            let interimPart = "";
            for (let i = 0; i < event.results.length; i++) {
              const res = event.results[i];
              if (res.isFinal) {
                finalPart += res[0].transcript + " ";
              } else {
                interimPart += res[0].transcript;
              }
            }
            if (finalPart.trim()) this.finalWebTranscript = finalPart.trim();
            this.interimWebTranscript = (finalPart + interimPart).trim();
            if (this.interimWebTranscript) {
              options.onInterimTranscript?.(this.interimWebTranscript);
            }
          };
          rec.onerror = () => {};
          rec.start();
          this.recognition = rec;
        } catch {
          this.recognition = null;
        }
      }
    }
  }

  public async finishListeningRawAudio(): Promise<RecordedVoicePayload | null> {
    if (!this.isRecording) {
      return null;
    }
    this.isRecording = false;
    cancelAnimationFrame(this.inputMonitorFrame);

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }

    const recordedBlob = await new Promise<Blob | null>((resolve) => {
      const recorder = this.mediaRecorder;
      if (!recorder || recorder.state === "inactive") {
        resolve(this.audioChunks.length > 0 ? new Blob(this.audioChunks) : null);
        return;
      }
      const mimeType = recorder.mimeType || "audio/webm";
      recorder.onstop = () => {
        const blob =
          this.audioChunks.length > 0 ? new Blob(this.audioChunks, { type: mimeType }) : null;
        resolve(blob);
      };
      try {
        recorder.requestData();
      } catch {
        // Ignore
      }
      recorder.stop();
    });

    const webFallbackTranscript = (this.finalWebTranscript || this.interimWebTranscript).trim();
    this.cleanupInputHardware();

    if (!recordedBlob || recordedBlob.size < 120) {
      if (webFallbackTranscript) {
        return {
          audioBase64: "",
          mimeType: "audio/webm",
          byteSize: 0,
          webFallbackTranscript,
        };
      }
      return null;
    }

    const audioBase64 = await blobToBase64(recordedBlob);
    const cleanMime = (recordedBlob.type || "audio/webm").split(";")[0].trim() || "audio/webm";

    return {
      audioBase64,
      mimeType: cleanMime,
      byteSize: recordedBlob.size,
      webFallbackTranscript,
    };
  }

  public async cancelListening(): Promise<void> {
    this.isRecording = false;
    cancelAnimationFrame(this.inputMonitorFrame);
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignore
      }
    }
    this.cleanupInputHardware();
  }

  private cleanupInputHardware(): void {
    this.mediaRecorder = null;
    this.audioChunks = [];
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.inputAudioCtx) {
      this.inputAudioCtx.close().catch(() => {});
      this.inputAudioCtx = null;
      this.inputAnalyser = null;
    }
  }

  public async speakResponse(options: {
    text: string;
    language: LanguageCode;
    voiceName: VoiceOption;
    speechSpeed: number;
    preferNeuralTts: boolean;
    preloadedAudioBase64?: string;
    onStart?: () => void;
    onLipSyncFrame?: (frame: LipSyncFrame) => void;
    onEnd?: () => void;
    onError?: (message: string) => void;
  }): Promise<void> {
    this.stopSpeaking();

    const cleanText = options.text.replace(/[*#_`~]/g, "").trim();
    if (!cleanText) {
      options.onEnd?.();
      return;
    }

    // 1. Play inline pre-synthesized 100% female audio immediately (0ms network wait!)
    if (options.preloadedAudioBase64 && !options.preferNeuralTts) {
      try {
        await this.playBase64AudioViaContext(options.preloadedAudioBase64, options);
        return;
      } catch {
        // Fall through to fresh /api/assistant/tts request
      }
    }

    // 2. Fetch 100% Female Audio from Backend ('fast' ~200ms Female MP3 or 'studio' Gemini Female Kore/Zephyr)
    // Never use Android's default window.speechSynthesis here because Android OS defaults to a male voice!
    const abortCtrl = new AbortController();
    this.activeTtsAbort = abortCtrl;
    try {
      const { ok, status, data } = await fetchApiJson<{
        audioBase64?: string;
        mimeType?: string;
        error?: string;
      }>(
        "/api/assistant/tts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: cleanText,
            voiceName: options.voiceName,
            language: options.language,
            mode: options.preferNeuralTts ? "studio" : "fast",
          }),
          signal: abortCtrl.signal,
        },
        18000
      );

      if (!ok || !data.audioBase64) {
        throw new Error(data.error || `Female TTS unavailable (${status})`);
      }

      await this.playBase64AudioViaContext(data.audioBase64, options);
    } catch (err) {
      if (abortCtrl.signal.aborted) {
        options.onEnd?.();
        return;
      }
      options.onError?.(err instanceof Error ? err.message : "ভয়েস প্লেব্যাকে সমস্যা হয়েছে।");
      options.onEnd?.();
    }
  }

  private async playBase64AudioViaContext(
    audioBase64: string,
    options: {
      voiceName: VoiceOption;
      speechSpeed: number;
      preferNeuralTts: boolean;
      onStart?: () => void;
      onLipSyncFrame?: (frame: LipSyncFrame) => void;
      onEnd?: () => void;
      onError?: (message: string) => void;
    }
  ): Promise<void> {
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!this.sharedPlaybackCtx || this.sharedPlaybackCtx.state === "closed") {
      this.sharedPlaybackCtx = new AudioCtx();
    }
    const ctx = this.sharedPlaybackCtx;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

    const bufferSource = ctx.createBufferSource();
    bufferSource.buffer = decodedBuffer;

    // Subtle feminine voice persona tuning (all 4 remain sweet, clear female voices)
    let rateMultiplier = 1.0;
    let detuneCents = 0;
    if (!options.preferNeuralTts) {
      if (options.voiceName === "Zephyr") {
        detuneCents = 75;
        rateMultiplier = 1.03;
      } else if (options.voiceName === "PiyaSweet") {
        detuneCents = 135;
        rateMultiplier = 1.02;
      } else if (options.voiceName === "PiyaCalm") {
        detuneCents = -30;
        rateMultiplier = 0.96;
      }
    }

    bufferSource.playbackRate.value = Math.min(
      1.5,
      Math.max(0.75, (options.speechSpeed || 1.0) * rateMultiplier)
    );
    if (typeof bufferSource.detune !== "undefined") {
      bufferSource.detune.value = detuneCents;
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;

    bufferSource.connect(analyser);
    analyser.connect(ctx.destination);

    this.activeBufferSource = bufferSource;
    this.outputAnalyser = analyser;

    const bins = new Uint8Array(analyser.frequencyBinCount);
    let playing = true;

    const sampleLipSync = () => {
      if (!playing || !this.outputAnalyser) return;
      this.outputAnalyser.getByteFrequencyData(bins);

      let lowSum = 0;
      let midSum = 0;
      const lowCount = Math.min(20, bins.length);
      const midCount = Math.min(50, bins.length);

      for (let i = 1; i < lowCount; i++) lowSum += bins[i];
      for (let i = lowCount; i < midCount; i++) midSum += bins[i];

      const lowAvg = lowSum / (Math.max(1, lowCount - 1) * 255);
      const midAvg = midSum / (Math.max(1, midCount - lowCount) * 255);

      const mouthOpen = Math.min(1, Math.max(0, (lowAvg - 0.04) * 2.7));
      const mouthSpread = Math.min(1, Math.max(0.2, midAvg * 2.4));
      const energy = Math.min(1, (lowAvg + midAvg) * 1.6);

      options.onLipSyncFrame?.({ mouthOpen, mouthSpread, energy });
      this.outputAnimFrame = requestAnimationFrame(sampleLipSync);
    };

    return new Promise<void>((resolve) => {
      bufferSource.onended = () => {
        playing = false;
        cancelAnimationFrame(this.outputAnimFrame);
        options.onLipSyncFrame?.({ mouthOpen: 0, mouthSpread: 0.35, energy: 0 });
        if (this.activeBufferSource === bufferSource) {
          this.activeBufferSource = null;
        }
        options.onEnd?.();
        resolve();
      };

      options.onStart?.();
      bufferSource.start(0);
      this.outputAnimFrame = requestAnimationFrame(sampleLipSync);
    });
  }

  public stopSpeaking(): void {
    if (this.activeTtsAbort) {
      this.activeTtsAbort.abort();
      this.activeTtsAbort = null;
    }
    cancelAnimationFrame(this.outputAnimFrame);
    window.clearInterval(this.synthFallbackInterval);

    if (this.activeBufferSource) {
      try {
        this.activeBufferSource.stop();
        this.activeBufferSource.disconnect();
      } catch {
        // Ignore
      }
      this.activeBufferSource = null;
    }
    this.outputAnalyser = null;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }
}
