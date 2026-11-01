export type LanguageCode = "bn" | "hi" | "en";

export type ThemeId =
  | "classic-cyan"
  | "mark-gold"
  | "stealth-violet"
  | "veronica-emerald"
  | "solar-amber";

export type AssistantVisualState = "idle" | "listening" | "thinking" | "speaking";

export type VoiceOption = "Kore" | "Zephyr" | "PiyaSweet" | "PiyaCalm";

export type CharacterRenderMode = "3d-rig" | "studio-render";

export type AlwaysActiveStage =
  | "off"
  | "wake_standby"
  | "capturing_command"
  | "processing"
  | "speaking"
  | "paused_permission"
  | "recovering";

export interface AlwaysActiveStatus {
  enabled: boolean;
  running: boolean;
  stage: AlwaysActiveStage;
  mode: "online" | "offline";
  wakeWord: string;
  batteryOptimizationIgnored: boolean;
  notificationPermissionGranted: boolean;
  micPermissionGranted: boolean;
  statusMessage: string;
  lastTranscript?: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  bnName: string;
  hiName: string;
  description: string;
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  accent: string;
  accentBright: string;
  accentSoft: string;
  accentGlow: string;
  onAccent: string;
  threeAccentHex: number;
  threeSecondaryHex: number;
}

export interface ContactItem {
  id: string;
  name: string;
  phone: string;
  label: string;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface AlarmItem {
  id: string;
  hour: number;
  minute: number;
  label: string;
  enabled: boolean;
  triggeredToday?: boolean;
}

export interface MemoryItem {
  id: string;
  category: string;
  fact: string;
  createdAt: string;
}

export interface GroundingSource {
  uri: string;
  title?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  language: LanguageCode;
  timestamp: string;
  sources?: GroundingSource[];
  actionBadge?: string;
  isError?: boolean;
}

export type PendingActionType =
  | "call_confirm"
  | "call_disambiguate"
  | "youtube_search"
  | "open_app"
  | "lock_phone"
  | "open_settings"
  | "set_alarm"
  | "save_memory";

export interface PendingAction {
  id: string;
  type: PendingActionType;
  title: string;
  explanation: string;
  matchedContacts?: ContactItem[];
  selectedContact?: ContactItem;
  youtubeQuery?: string;
  youtubePlatform?: "youtube" | "youtube_music";
  appName?: string;
  settingSection?: "wifi" | "bluetooth" | "phone_settings" | "device_admin";
  alarmData?: { hour: number; minute: number; label: string };
  memoryData?: { category: string; fact: string };
  intentHref?: string;
}

export interface UserProfile {
  displayName: string;
  email: string;
  signedIn: boolean;
}

export interface AppSettings {
  language: LanguageCode;
  voiceName: VoiceOption;
  speechSpeed: number;
  theme: ThemeId;
  characterMode: CharacterRenderMode;
  memoryEnabled: boolean;
  autoConfirmMemory: boolean;
  preferNeuralTts: boolean;
  alwaysActiveVoice: boolean;
  wakeWord: string;
}

export interface SystemConnectionStatus {
  online: boolean;
  aiConfigured: boolean;
  aiVerified: boolean;
  checking: boolean;
  message: string;
  errorCode?: string;
}

export interface BatteryInfo {
  supported: boolean;
  level: number | null;
  charging: boolean | null;
}

export interface BackgroundTurnRecord {
  id: string;
  userText: string;
  assistantText: string;
  language: LanguageCode;
  timestamp: string;
  actionBadge?: string;
  noteTitle?: string;
  noteContent?: string;
  alarmHour?: number;
  alarmMinute?: number;
  alarmLabel?: string;
}
