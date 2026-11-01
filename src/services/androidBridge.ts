import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type {
  AlwaysActiveStage,
  AlwaysActiveStatus,
  BackgroundTurnRecord,
  BatteryInfo,
  ChatMessage,
  ContactItem,
  LanguageCode,
  MemoryItem,
} from "../types/piya";

export const DEFAULT_CLOUD_BACKEND_URL =
  "https://ais-pre-asnqfhdww664ezfv2ux5g7-331832155642.asia-southeast1.run.app";

export interface NativeAlwaysActiveEvent {
  eventType: "state" | "turn";
  enabled?: boolean;
  running?: boolean;
  stage?: AlwaysActiveStage;
  online?: boolean;
  statusMessage?: string;
  partialTranscript?: string;
  turnJson?: string;
}

export interface PiyaDeviceControlPlugin {
  openApp(options: { packageName?: string; appName: string; fallbackUrl?: string }): Promise<{
    launched: boolean;
    message: string;
  }>;
  openYoutubeSearch(options: { query: string; musicOnly?: boolean }): Promise<{
    launched: boolean;
  }>;
  placeCall(options: { phoneNumber: string }): Promise<{
    launched: boolean;
  }>;
  isDeviceAdminActive(): Promise<{ active: boolean }>;
  requestDeviceAdmin(): Promise<{ requested: boolean }>;
  lockPhone(): Promise<{ locked: boolean; message: string }>;
  openSettingsPanel(options: {
    section: "wifi" | "bluetooth" | "phone_settings" | "device_admin" | "flashlight";
  }): Promise<{ launched: boolean }>;
  setAlarm(options: { hour: number; minute: number; label: string }): Promise<{
    scheduled: boolean;
  }>;
  toggleFlashlight(options: { enabled: boolean }): Promise<{
    enabled: boolean;
    supported: boolean;
  }>;

  // Always Active Foreground Voice Service Bridge
  getAlwaysActiveStatus(): Promise<{
    enabled: boolean;
    running: boolean;
    stage: string;
    wakeWord: string;
    batteryOptimizationIgnored: boolean;
    notificationPermissionGranted: boolean;
    micPermissionGranted: boolean;
    statusMessage: string;
  }>;
  setAlwaysActiveEnabled(options: {
    enabled: boolean;
    language: LanguageCode;
    wakeWord: string;
    speechSpeed: number;
    voiceName: string;
    backendUrl: string;
    contactsJson?: string;
    memoriesJson?: string;
    historyJson?: string;
  }): Promise<{
    enabled: boolean;
    running: boolean;
    stage: string;
    wakeWord: string;
    batteryOptimizationIgnored: boolean;
    notificationPermissionGranted: boolean;
    micPermissionGranted: boolean;
    statusMessage: string;
  }>;
  syncAssistantContext(options: {
    language: LanguageCode;
    wakeWord: string;
    speechSpeed: number;
    voiceName: string;
    backendUrl: string;
    contactsJson: string;
    memoriesJson: string;
    historyJson: string;
  }): Promise<{ synced: boolean }>;
  drainBackgroundTurns(): Promise<{ turnsJson: string }>;
  yieldServiceMic(options: { pause: boolean }): Promise<{ paused: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<{ batteryOptimizationIgnored: boolean }>;
  openAppPermissionSettings(): Promise<{ launched: boolean }>;
  addListener(
    eventName: "alwaysActiveEvent",
    listenerFunc: (event: NativeAlwaysActiveEvent) => void
  ): Promise<PluginListenerHandle>;
}

export const PiyaNativePlugin = registerPlugin<PiyaDeviceControlPlugin>("PiyaDeviceControl");

export function isNativeAndroidRuntime(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function getActiveBackendBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (envUrl) return envUrl;
  if (isNativeAndroidRuntime()) {
    return DEFAULT_CLOUD_BACKEND_URL;
  }
  if (typeof window !== "undefined" && window.location.origin.startsWith("http")) {
    if (!window.location.origin.includes("localhost") || window.location.port === "3000") {
      return "";
    }
  }
  return "";
}

export function getFullBackendOriginForNative(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (envUrl) return envUrl;
  if (
    typeof window !== "undefined" &&
    window.location.origin.startsWith("https://") &&
    !window.location.origin.includes("localhost")
  ) {
    return window.location.origin;
  }
  return DEFAULT_CLOUD_BACKEND_URL;
}

export async function readNativeAlwaysActiveStatus(isOnline: boolean): Promise<AlwaysActiveStatus | null> {
  if (!isNativeAndroidRuntime()) return null;
  try {
    const res = await PiyaNativePlugin.getAlwaysActiveStatus();
    return {
      enabled: Boolean(res.enabled),
      running: Boolean(res.running),
      stage: (res.stage as AlwaysActiveStage) || (res.enabled ? "wake_standby" : "off"),
      mode: isOnline ? "online" : "offline",
      wakeWord: res.wakeWord || "Janu",
      batteryOptimizationIgnored: Boolean(res.batteryOptimizationIgnored),
      notificationPermissionGranted: Boolean(res.notificationPermissionGranted),
      micPermissionGranted: Boolean(res.micPermissionGranted),
      statusMessage: res.statusMessage || "",
    };
  } catch {
    return null;
  }
}

export async function setNativeAlwaysActiveService(params: {
  enabled: boolean;
  language: LanguageCode;
  wakeWord: string;
  speechSpeed: number;
  voiceName: string;
  contacts: ContactItem[];
  memories: MemoryItem[];
  messages: ChatMessage[];
  isOnline: boolean;
}): Promise<AlwaysActiveStatus | null> {
  if (!isNativeAndroidRuntime()) return null;
  try {
    const res = await PiyaNativePlugin.setAlwaysActiveEnabled({
      enabled: params.enabled,
      language: params.language,
      wakeWord: params.wakeWord || "Janu",
      speechSpeed: params.speechSpeed,
      voiceName: params.voiceName,
      backendUrl: getFullBackendOriginForNative(),
      contactsJson: JSON.stringify(params.contacts.slice(0, 40)),
      memoriesJson: JSON.stringify(params.memories.slice(0, 25)),
      historyJson: JSON.stringify(
        params.messages
          .filter((m) => !m.isError)
          .slice(-8)
          .map((m) => ({ role: m.role, text: m.text }))
      ),
    });
    return {
      enabled: Boolean(res.enabled),
      running: Boolean(res.running),
      stage: (res.stage as AlwaysActiveStage) || (res.enabled ? "wake_standby" : "off"),
      mode: params.isOnline ? "online" : "offline",
      wakeWord: res.wakeWord || params.wakeWord || "Janu",
      batteryOptimizationIgnored: Boolean(res.batteryOptimizationIgnored),
      notificationPermissionGranted: Boolean(res.notificationPermissionGranted),
      micPermissionGranted: Boolean(res.micPermissionGranted),
      statusMessage: res.statusMessage || "",
    };
  } catch {
    return null;
  }
}

export async function syncNativeAssistantContext(params: {
  language: LanguageCode;
  wakeWord: string;
  speechSpeed: number;
  voiceName: string;
  contacts: ContactItem[];
  memories: MemoryItem[];
  messages: ChatMessage[];
}): Promise<void> {
  if (!isNativeAndroidRuntime()) return;
  try {
    await PiyaNativePlugin.syncAssistantContext({
      language: params.language,
      wakeWord: params.wakeWord || "Janu",
      speechSpeed: params.speechSpeed,
      voiceName: params.voiceName,
      backendUrl: getFullBackendOriginForNative(),
      contactsJson: JSON.stringify(params.contacts.slice(0, 40)),
      memoriesJson: JSON.stringify(params.memories.slice(0, 25)),
      historyJson: JSON.stringify(
        params.messages
          .filter((m) => !m.isError)
          .slice(-8)
          .map((m) => ({ role: m.role, text: m.text }))
      ),
    });
  } catch {
    // Ignore sync errors on non-native environments
  }
}

export async function drainNativeBackgroundTurns(): Promise<BackgroundTurnRecord[]> {
  if (!isNativeAndroidRuntime()) return [];
  try {
    const res = await PiyaNativePlugin.drainBackgroundTurns();
    if (!res.turnsJson) return [];
    const parsed = JSON.parse(res.turnsJson) as BackgroundTurnRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const KNOWN_ANDROID_APPS: Record<
  string,
  { packageName: string; webUrl: string; scheme?: string; label: string }
> = {
  youtube: {
    packageName: "com.google.android.youtube",
    webUrl: "https://m.youtube.com",
    scheme: "vnd.youtube://",
    label: "YouTube",
  },
  "youtube music": {
    packageName: "com.google.android.apps.youtube.music",
    webUrl: "https://music.youtube.com",
    label: "YouTube Music",
  },
  whatsapp: {
    packageName: "com.whatsapp",
    webUrl: "https://web.whatsapp.com",
    scheme: "whatsapp://send",
    label: "WhatsApp",
  },
  spotify: {
    packageName: "com.spotify.music",
    webUrl: "https://open.spotify.com",
    scheme: "spotify://",
    label: "Spotify",
  },
  chrome: {
    packageName: "com.android.chrome",
    webUrl: "https://www.google.com",
    label: "Google Chrome",
  },
  maps: {
    packageName: "com.google.android.apps.maps",
    webUrl: "https://maps.google.com",
    label: "Google Maps",
  },
  "google maps": {
    packageName: "com.google.android.apps.maps",
    webUrl: "https://maps.google.com",
    label: "Google Maps",
  },
  gmail: {
    packageName: "com.google.android.gm",
    webUrl: "https://mail.google.com",
    scheme: "mailto:",
    label: "Gmail",
  },
  instagram: {
    packageName: "com.instagram.android",
    webUrl: "https://www.instagram.com",
    label: "Instagram",
  },
  facebook: {
    packageName: "com.facebook.katana",
    webUrl: "https://m.facebook.com",
    label: "Facebook",
  },
  camera: {
    packageName: "com.android.camera2",
    webUrl: "",
    label: "Camera",
  },
  messages: {
    packageName: "com.google.android.apps.messaging",
    webUrl: "",
    scheme: "sms:",
    label: "Messages",
  },
};

export function resolveAppLaunchTarget(appName: string): {
  label: string;
  packageName?: string;
  href: string;
  requiresNativeOnly: boolean;
} {
  const key = appName.trim().toLowerCase();
  const matched =
    KNOWN_ANDROID_APPS[key] ||
    Object.entries(KNOWN_ANDROID_APPS).find(([k]) => key.includes(k))?.[1];

  if (matched) {
    if (isAndroidBrowser() && matched.packageName) {
      const fallbackParam = matched.webUrl
        ? `S.browser_fallback_url=${encodeURIComponent(matched.webUrl)};`
        : "";
      return {
        label: matched.label,
        packageName: matched.packageName,
        href: `intent://#Intent;package=${matched.packageName};${fallbackParam}end`,
        requiresNativeOnly: !matched.webUrl && !matched.scheme,
      };
    }
    return {
      label: matched.label,
      packageName: matched.packageName,
      href: matched.webUrl || matched.scheme || "",
      requiresNativeOnly: !matched.webUrl && !matched.scheme,
    };
  }

  return {
    label: appName.trim(),
    href: `https://www.google.com/search?q=${encodeURIComponent(appName.trim())}`,
    requiresNativeOnly: true,
  };
}

export function buildYouTubeSearchUrl(
  query: string,
  platform: "youtube" | "youtube_music" = "youtube"
): string {
  const encoded = encodeURIComponent(query.trim());
  if (platform === "youtube_music") {
    return `https://music.youtube.com/search?q=${encoded}`;
  }
  return `https://www.youtube.com/results?search_query=${encoded}`;
}

export function buildTelHref(phone: string): string {
  const sanitized = phone.replace(/[^\d+]/g, "");
  return `tel:${sanitized}`;
}

export function matchContactsFromDirectory(
  contacts: ContactItem[],
  queryName?: string,
  lastFourDigits?: string
): ContactItem[] {
  if (lastFourDigits && lastFourDigits.trim()) {
    const cleanDigits = lastFourDigits
      .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
      .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
      .replace(/\D/g, "")
      .slice(-4);

    if (cleanDigits.length === 4) {
      const byDigits = contacts.filter((c) => c.phone.replace(/\D/g, "").endsWith(cleanDigits));
      if (byDigits.length > 0) return byDigits;
    }
  }

  if (!queryName || !queryName.trim()) {
    return [];
  }

  const q = queryName.trim().toLowerCase();
  return contacts.filter((c) => {
    const full = c.name.toLowerCase();
    const parts = full.split(/\s+/);
    return full.includes(q) || q.includes(full) || parts.some((p) => p === q || p.startsWith(q));
  });
}

export async function readLiveBatteryStatus(): Promise<BatteryInfo> {
  try {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
      }>;
    };
    if (typeof nav.getBattery !== "function") {
      return { supported: false, level: null, charging: null };
    }
    const bat = await nav.getBattery();
    return {
      supported: true,
      level: Math.round(bat.level * 100),
      charging: Boolean(bat.charging),
    };
  } catch {
    return { supported: false, level: null, charging: null };
  }
}

let activeTorchStream: MediaStream | null = null;

export async function setHardwareFlashlight(enable: boolean): Promise<{
  success: boolean;
  enabled: boolean;
  message: string;
}> {
  if (isNativeAndroidRuntime()) {
    try {
      const res = await PiyaNativePlugin.toggleFlashlight({ enabled: enable });
      return {
        success: res.supported,
        enabled: res.enabled,
        message: res.supported
          ? enable
            ? "Android hardware flashlight turned ON."
            : "Android hardware flashlight turned OFF."
          : "This Android device does not report a camera flash unit.",
      };
    } catch (err) {
      return {
        success: false,
        enabled: false,
        message: err instanceof Error ? err.message : "Failed to toggle native Android flashlight.",
      };
    }
  }

  if (!enable) {
    if (activeTorchStream) {
      activeTorchStream.getTracks().forEach((t) => t.stop());
      activeTorchStream = null;
    }
    return {
      success: true,
      enabled: false,
      message: "Flashlight turned off.",
    };
  }

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        success: false,
        enabled: false,
        message:
          "Camera torch API is unavailable in this browser. Install the Janu AI Android APK for direct CameraManager torch control.",
      };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
    const track = stream.getVideoTracks()[0];
    const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as Record<
      string,
      unknown
    >;

    if (!capabilities.torch) {
      stream.getTracks().forEach((t) => t.stop());
      return {
        success: false,
        enabled: false,
        message:
          "Hardware torch is not supported on this device/browser camera. On Android APK, Janu AI uses CameraManager.setTorchMode.",
      };
    }

    await track.applyConstraints({
      advanced: [{ torch: true } as MediaTrackConstraintSet],
    });
    activeTorchStream = stream;
    return {
      success: true,
      enabled: true,
      message: "Hardware flashlight enabled.",
    };
  } catch (err) {
    return {
      success: false,
      enabled: false,
      message:
        err instanceof Error
          ? `Flashlight permission or hardware unavailable: ${err.message}`
          : "Unable to access rear camera torch.",
    };
  }
}

export async function checkDeviceAdminStatus(): Promise<boolean> {
  if (!isNativeAndroidRuntime()) return false;
  try {
    const res = await PiyaNativePlugin.isDeviceAdminActive();
    return Boolean(res.active);
  } catch {
    return false;
  }
}

export async function executeDeviceLock(): Promise<{
  locked: boolean;
  requiresAdminActivation: boolean;
  message: string;
}> {
  if (!isNativeAndroidRuntime()) {
    return {
      locked: false,
      requiresAdminActivation: true,
      message:
        "DevicePolicyManager.lockNow() requires the installed Janu AI Android APK with Device Administrator permission enabled.",
    };
  }

  try {
    const admin = await PiyaNativePlugin.isDeviceAdminActive();
    if (!admin.active) {
      await PiyaNativePlugin.requestDeviceAdmin();
      return {
        locked: false,
        requiresAdminActivation: true,
        message:
          "Device Administrator activation screen opened. Please approve Janu AI as Device Admin first, then ask to lock again.",
      };
    }
    const res = await PiyaNativePlugin.lockPhone();
    return {
      locked: res.locked,
      requiresAdminActivation: false,
      message: res.message,
    };
  } catch (err) {
    return {
      locked: false,
      requiresAdminActivation: false,
      message: err instanceof Error ? err.message : "Android DevicePolicyManager lock failed.",
    };
  }
}

export async function executeSystemSettingsOpen(
  section: "wifi" | "bluetooth" | "phone_settings" | "device_admin"
): Promise<{
  launchedNative: boolean;
  intentHref?: string;
  message: string;
}> {
  if (isNativeAndroidRuntime()) {
    try {
      const res = await PiyaNativePlugin.openSettingsPanel({ section });
      return {
        launchedNative: res.launched,
        message: `Opened Android ${section.replace("_", " ")} panel.`,
      };
    } catch (err) {
      return {
        launchedNative: false,
        message: err instanceof Error ? err.message : "Failed to open Android settings.",
      };
    }
  }

  const intentActions: Record<string, string> = {
    wifi: "android.settings.WIFI_SETTINGS",
    bluetooth: "android.settings.BLUETOOTH_SETTINGS",
    phone_settings: "android.settings.SETTINGS",
    device_admin: "android.settings.SECURITY_SETTINGS",
  };
  const action = intentActions[section] || "android.settings.SETTINGS";

  if (isAndroidBrowser()) {
    return {
      launchedNative: false,
      intentHref: `intent:#Intent;action=${action};end`,
      message: `Android settings intent prepared (${action}). Tap Launch Settings if your browser requires manual confirmation.`,
    };
  }

  return {
    launchedNative: false,
    message: `Opening Android ${section.replace("_", " ")} (${action}) requires an Android device or the compiled Janu AI APK.`,
  };
}

export async function pickNativeAndroidContacts(): Promise<{
  supported: boolean;
  contacts: ContactItem[];
  error?: string;
}> {
  const nav = navigator as Navigator & {
    contacts?: {
      select: (
        props: string[],
        opts: { multiple: boolean }
      ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
    };
  };

  if (!nav.contacts || typeof nav.contacts.select !== "function") {
    return {
      supported: false,
      contacts: [],
      error:
        "Native Contact Picker API is only available on Android Chrome or the Janu AI Capacitor APK. You can add contacts directly below.",
    };
  }

  try {
    const raw = await nav.contacts.select(["name", "tel"], { multiple: true });
    const imported: ContactItem[] = [];
    for (const item of raw) {
      const name = item.name?.[0]?.trim() || "Saved Contact";
      const phones = item.tel || [];
      for (const tel of phones) {
        if (tel.trim()) {
          imported.push({
            id: `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name,
            phone: tel.trim(),
            label: "Device Contact",
          });
        }
      }
    }
    return { supported: true, contacts: imported };
  } catch (err) {
    return {
      supported: true,
      contacts: [],
      error: err instanceof Error ? err.message : "Contact selection cancelled.",
    };
  }
}

export function playAlarmChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + idx * 0.18;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  } catch {
    // Ignore audio context restriction if page had no prior gesture
  }
}

export function playWakeActivationCue(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const tones = [660, 880];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.11, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.16);
    });
  } catch {
    // Ignore
  }
}
