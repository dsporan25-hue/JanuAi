/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BellRing,
  Brain,
  Mic,
  Play,
  Settings,
  Sparkles,
  User,
  Wrench,
  X,
} from "lucide-react";
import type {
  AlarmItem,
  AppSettings,
  AssistantVisualState,
  BatteryInfo,
  ChatMessage,
  ContactItem,
  GroundingSource,
  LanguageCode,
  MemoryItem,
  NoteItem,
  PendingAction,
  ThemeId,
  UserProfile,
} from "./types/piya";
import {
  applyThemeCssVariables,
  DEFAULT_CONTACTS,
  parseVoiceConfirmationIntent,
  PIYA_THEMES,
  UI_COPY,
} from "./constants/themesAndCopy";
import {
  buildTelHref,
  buildYouTubeSearchUrl,
  checkDeviceAdminStatus,
  executeDeviceLock,
  executeSystemSettingsOpen,
  isNativeAndroidRuntime,
  matchContactsFromDirectory,
  PiyaNativePlugin,
  playAlarmChime,
  readLiveBatteryStatus,
  resolveAppLaunchTarget,
  setHardwareFlashlight,
} from "./services/androidBridge";
import {
  fetchApiJson,
  PiyaVoiceEngine,
  queryMicrophonePermission,
  requestExplicitMicrophoneAccess,
} from "./services/voiceEngine";
import type { LipSyncFrame, MicPermissionState } from "./services/voiceEngine";
import { OFFICIAL_PIYA_CHARACTER_IMAGE, PiyaCharacter3D } from "./components/PiyaCharacter3D";
import { AssistantFullScreen } from "./components/AssistantFullScreen";
import { PhoneActionsPanel } from "./components/PhoneActionsPanel";
import { MemoryVaultPanel } from "./components/MemoryVaultPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ProfileModal } from "./components/ProfileModal";

type ActiveTab = "home" | "actions" | "memory";

const STORAGE_KEYS = {
  settings: "piya_ai_settings_v2",
  profile: "piya_ai_profile_v1",
  contacts: "piya_ai_contacts_v1",
  memories: "piya_ai_memories_v1",
  notes: "piya_ai_notes_v1",
  alarms: "piya_ai_alarms_v1",
  history: "piya_ai_history_v2",
};

const DEFAULT_SETTINGS: AppSettings = {
  language: "bn",
  voiceName: "Kore",
  speechSpeed: 1.05,
  theme: "classic-cyan",
  characterMode: "3d-rig",
  memoryEnabled: true,
  autoConfirmMemory: false,
  preferNeuralTts: false, // Super Fast Instant Voice Mode by default
};

const DEFAULT_PROFILE: UserProfile = {
  displayName: "Poran",
  email: "",
  signedIn: true,
};

function loadStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [fullScreenAssistant, setFullScreenAssistant] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const loaded = loadStoredJson<AppSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    const validFemaleVoices = ["Kore", "Zephyr", "PiyaSweet", "PiyaCalm"];
    if (!validFemaleVoices.includes(loaded.voiceName)) {
      loaded.voiceName = "Kore";
    }
    return loaded;
  });
  const [profile, setProfile] = useState<UserProfile>(() =>
    loadStoredJson<UserProfile>(STORAGE_KEYS.profile, DEFAULT_PROFILE)
  );
  const [contacts, setContacts] = useState<ContactItem[]>(() =>
    loadStoredJson<ContactItem[]>(STORAGE_KEYS.contacts, DEFAULT_CONTACTS)
  );
  const [memories, setMemories] = useState<MemoryItem[]>(() =>
    loadStoredJson<MemoryItem[]>(STORAGE_KEYS.memories, [])
  );
  const [notes, setNotes] = useState<NoteItem[]>(() =>
    loadStoredJson<NoteItem[]>(STORAGE_KEYS.notes, [])
  );
  const [alarms, setAlarms] = useState<AlarmItem[]>(() =>
    loadStoredJson<AlarmItem[]>(STORAGE_KEYS.alarms, [])
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadStoredJson<ChatMessage[]>(STORAGE_KEYS.history, []).filter((m) => !m.isError)
  );

  const [visualState, setVisualState] = useState<AssistantVisualState>("idle");
  const [micPermission, setMicPermission] = useState<MicPermissionState>("prompt");
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const [lipSync, setLipSync] = useState<LipSyncFrame>({
    mouthOpen: 0,
    mouthSpread: 0.35,
    energy: 0,
  });
  const [micLevel, setMicLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [actionStatusToast, setActionStatusToast] = useState<string | null>(null);
  const [ringingAlarm, setRingingAlarm] = useState<AlarmItem | null>(null);

  const [battery, setBattery] = useState<BatteryInfo>({
    supported: false,
    level: null,
    charging: null,
  });
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [deviceAdminActive, setDeviceAdminActive] = useState(false);

  const voiceEngineRef = useRef<PiyaVoiceEngine | null>(null);
  if (!voiceEngineRef.current) {
    voiceEngineRef.current = new PiyaVoiceEngine();
  }
  const finishingMicRef = useRef(false);

  useEffect(() => {
    applyThemeCssVariables(settings.theme);
    document.documentElement.lang = settings.language;
    window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.contacts, JSON.stringify(contacts));
  }, [contacts]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.memories, JSON.stringify(memories));
  }, [memories]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.alarms, JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEYS.history,
      JSON.stringify(messages.filter((m) => !m.isError).slice(-40))
    );
  }, [messages]);

  const refreshDeviceTelemetry = useCallback(async () => {
    const bat = await readLiveBatteryStatus();
    setBattery(bat);
    const admin = await checkDeviceAdminStatus();
    setDeviceAdminActive(admin);
  }, []);

  useEffect(() => {
    queryMicrophonePermission().then(setMicPermission);
    refreshDeviceTelemetry();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setErrorBanner(
        settings.language === "bn"
          ? "ইন্টারনেট সংযোগ বিচ্ছিন্ন হয়েছে।"
          : "इंटरनेट कनेक्शन टूट गया है।"
      );
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        voiceEngineRef.current?.cancelListening();
        setVisualState((s) => (s === "listening" ? "idle" : s));
        setMicLevel(0);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      voiceEngineRef.current?.cancelListening();
      voiceEngineRef.current?.stopSpeaking();
    };
  }, [refreshDeviceTelemetry, settings.language]);

  // Active In-App Alarm Scheduler
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      const curH = now.getHours();
      const curM = now.getMinutes();
      const curS = now.getSeconds();
      if (curS > 2) return;

      setAlarms((prev) =>
        prev.map((al) => {
          if (al.enabled && !al.triggeredToday && al.hour === curH && al.minute === curM) {
            playAlarmChime();
            setRingingAlarm(al);
            return { ...al, triggeredToday: true };
          }
          return al;
        })
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const speakAssistantReply = useCallback(
    async (text: string, lang: LanguageCode, preloadedAudioBase64?: string) => {
      if (!voiceEngineRef.current) return;
      setVisualState("speaking");
      await voiceEngineRef.current.speakResponse({
        text,
        language: lang,
        voiceName: settings.voiceName,
        speechSpeed: settings.speechSpeed,
        preferNeuralTts: settings.preferNeuralTts,
        preloadedAudioBase64,
        onStart: () => setVisualState("speaking"),
        onLipSyncFrame: (frame) => setLipSync(frame),
        onEnd: () => {
          setLipSync({ mouthOpen: 0, mouthSpread: 0.35, energy: 0 });
          setVisualState("idle");
        },
        onError: () => {
          setVisualState("idle");
        },
      });
    },
    [settings.preferNeuralTts, settings.speechSpeed, settings.voiceName]
  );

  const appendMessage = useCallback(
    (
      role: "user" | "assistant",
      text: string,
      language: LanguageCode,
      extra?: { sources?: GroundingSource[]; actionBadge?: string; isError?: boolean }
    ) => {
      const entry: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role,
        text,
        language,
        timestamp: new Date().toISOString(),
        sources: extra?.sources,
        actionBadge: extra?.actionBadge,
        isError: extra?.isError,
      };
      setMessages((prev) => [...prev, entry]);
    },
    []
  );

  // =========================================================================
  // PHONE ACTION CONFIRMATION & EXECUTION HANDLERS
  // =========================================================================
  const prepareCallAction = useCallback(
    (
      contactName?: string,
      lastFourDigits?: string,
      activeLang: LanguageCode = settings.language
    ): { pending: PendingAction | null; spokenOverride?: string } => {
      const matches = matchContactsFromDirectory(contacts, contactName, lastFourDigits);

      if (matches.length === 0) {
        const notFoundMsg =
          activeLang === "bn"
            ? `দুঃখিত, "${contactName || lastFourDigits || ""}" নামে কোনো সেভ করা কন্টাক্ট পাওয়া যায়নি।`
            : `क्षमा करें, "${contactName || lastFourDigits || ""}" नाम का कोई सेव किया गया कॉन्टैक्ट नहीं मिला।`;
        return { pending: null, spokenOverride: notFoundMsg };
      }

      if (matches.length === 1) {
        const target = matches[0];
        const explain =
          activeLang === "bn"
            ? `আমি ${target.name}-এর নম্বর (${target.phone}) পেয়েছি। আপনি কি কল করতে চান?`
            : `मुझे ${target.name} का कॉन्टैक्ट (${target.phone}) मिल गया है। क्या मैं कॉल लगाऊँ?`;
        return {
          pending: {
            id: `pa_${Date.now()}`,
            type: "call_confirm",
            title: activeLang === "bn" ? `কল নিশ্চিতকরণ: ${target.name}` : `कॉल पुष्टि: ${target.name}`,
            explanation: explain,
            selectedContact: target,
            intentHref: isNativeAndroidRuntime() ? undefined : buildTelHref(target.phone),
          },
          spokenOverride: explain,
        };
      }

      const namesSummary = matches
        .map((m) => `${m.name} (${m.phone.replace(/\D/g, "").slice(-4)})`)
        .join(", ");
      const disambiguateMsg =
        activeLang === "bn"
          ? `একাধিক কন্টাক্ট পাওয়া গেছে: ${namesSummary}। অনুগ্রহ করে নাম অথবা শেষ চারটি ডিজিট বলুন।`
          : `एक से अधिक कॉन्टैक्ट मिले हैं: ${namesSummary}। कृपया नाम या आखिरी चार अंक बताएँ।`;

      return {
        pending: {
          id: `pa_${Date.now()}`,
          type: "call_disambiguate",
          title:
            activeLang === "bn"
              ? `${matches.length}টি কন্টাক্ট পাওয়া গেছে`
              : `${matches.length} कॉन्टैक्ट मिले`,
          explanation: disambiguateMsg,
          matchedContacts: matches,
        },
        spokenOverride: disambiguateMsg,
      };
    },
    [contacts, settings.language]
  );

  const handleSelectDisambiguatedContact = useCallback(
    async (contact: ContactItem) => {
      const lang = settings.language;
      const explain =
        lang === "bn"
          ? `${contact.name} (${contact.phone}) নির্বাচন করা হয়েছে। এখন কি কল করব?`
          : `${contact.name} (${contact.phone}) चुना गया है। क्या अब कॉल करूँ?`;

      setPendingAction({
        id: `pa_${Date.now()}`,
        type: "call_confirm",
        title: lang === "bn" ? `কল নিশ্চিতকরণ: ${contact.name}` : `कॉल पुष्टि: ${contact.name}`,
        explanation: explain,
        selectedContact: contact,
        intentHref: isNativeAndroidRuntime() ? undefined : buildTelHref(contact.phone),
      });
      appendMessage("assistant", explain, lang, { actionBadge: "Confirm Call" });
      await speakAssistantReply(explain, lang);
    },
    [appendMessage, settings.language, speakAssistantReply]
  );

  const handleConfirmPendingAction = useCallback(async () => {
    if (!pendingAction) return;
    const act = pendingAction;
    setPendingAction(null);
    const lang = settings.language;

    if (act.type === "call_confirm" && act.selectedContact) {
      if (isNativeAndroidRuntime()) {
        try {
          await PiyaNativePlugin.placeCall({ phoneNumber: act.selectedContact.phone });
        } catch (err) {
          setErrorBanner(err instanceof Error ? err.message : "কল শুরু করা যায়নি।");
          return;
        }
      }
      const msg =
        lang === "bn"
          ? `${act.selectedContact.name}-কে এখন কল করা হচ্ছে।`
          : `अब ${act.selectedContact.name} को कॉल लगाया जा रहा है।`;
      appendMessage("assistant", msg, lang, { actionBadge: "Calling" });
      await speakAssistantReply(msg, lang);
      return;
    }

    if (act.type === "youtube_search" && act.youtubeQuery) {
      if (isNativeAndroidRuntime()) {
        await PiyaNativePlugin.openYoutubeSearch({
          query: act.youtubeQuery,
          musicOnly: act.youtubePlatform === "youtube_music",
        }).catch(() => {});
      }
      const msg =
        lang === "bn"
          ? `ইউটিউবে "${act.youtubeQuery}" খোলা হচ্ছে।`
          : `YouTube पर "${act.youtubeQuery}" खोला जा रहा है।`;
      appendMessage("assistant", msg, lang, { actionBadge: "YouTube" });
      await speakAssistantReply(msg, lang);
      return;
    }

    if (act.type === "open_app" && act.appName) {
      if (isNativeAndroidRuntime()) {
        const target = resolveAppLaunchTarget(act.appName);
        await PiyaNativePlugin.openApp({
          packageName: target.packageName,
          appName: act.appName,
          fallbackUrl: target.href,
        }).catch(() => {});
      }
      const msg =
        lang === "bn"
          ? `${act.appName} খোলা হচ্ছে।`
          : `${act.appName} खोला जा रहा है।`;
      appendMessage("assistant", msg, lang, { actionBadge: "Open App" });
      await speakAssistantReply(msg, lang);
      return;
    }

    if (act.type === "lock_phone") {
      const lockRes = await executeDeviceLock();
      setActionStatusToast(lockRes.message);
      const msg = lockRes.locked
        ? lang === "bn"
          ? "ফোন লক করা হয়েছে।"
          : "फ़ोन लॉक कर दिया गया है।"
        : lang === "bn"
        ? "ফোন লক করতে হলে Android APK-তে Device Administrator অনুমতি সক্রিয় করুন।"
        : "फ़ोन लॉक करने के लिए Android APK में Device Administrator अनुमति सक्रिय करें।";
      appendMessage("assistant", msg, lang, {
        actionBadge: lockRes.locked ? "Locked" : "Device Admin",
      });
      await speakAssistantReply(msg, lang);
      return;
    }

    if (act.type === "open_settings" && act.settingSection) {
      const res = await executeSystemSettingsOpen(act.settingSection);
      setActionStatusToast(res.message);
      appendMessage("assistant", res.message, lang, { actionBadge: "Settings" });
      return;
    }

    if (act.type === "set_alarm" && act.alarmData) {
      const { hour, minute, label } = act.alarmData;
      const newAlarm: AlarmItem = {
        id: `alm_${Date.now()}`,
        hour,
        minute,
        label,
        enabled: true,
      };
      setAlarms((prev) => [newAlarm, ...prev]);
      if (isNativeAndroidRuntime()) {
        await PiyaNativePlugin.setAlarm({ hour, minute, label }).catch(() => {});
      }
      const formattedTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const msg =
        lang === "bn"
          ? `${formattedTime} সময়ের জন্য অ্যালার্ম সেট করা হয়েছে।`
          : `${formattedTime} बजे के लिए अलार्म सेट कर दिया गया है।`;
      appendMessage("assistant", msg, lang, { actionBadge: "Alarm Set" });
      await speakAssistantReply(msg, lang);
      return;
    }

    if (act.type === "save_memory" && act.memoryData) {
      const item: MemoryItem = {
        id: `mem_${Date.now()}`,
        category: act.memoryData.category,
        fact: act.memoryData.fact,
        createdAt: new Date().toISOString(),
      };
      setMemories((prev) => [item, ...prev]);
      const msg =
        lang === "bn"
          ? "আপনার তথ্যটি মেমোরিতে সংরক্ষণ করা হয়েছে।"
          : "आपकी जानकारी मेमोरी में सहेज ली गई है।";
      appendMessage("assistant", msg, lang, { actionBadge: "Memory Saved" });
      await speakAssistantReply(msg, lang);
    }
  }, [appendMessage, pendingAction, settings.language, speakAssistantReply]);

  const handleCancelPendingAction = useCallback(async () => {
    setPendingAction(null);
    const lang = settings.language;
    const msg =
      lang === "bn"
        ? "ঠিক আছে, কাজটি বাতিল করা হয়েছে।"
        : "ठीक है, यह कार्य रद्द कर दिया गया है।";
    appendMessage("assistant", msg, lang, { actionBadge: "Cancelled" });
    await speakAssistantReply(msg, lang);
  }, [appendMessage, settings.language, speakAssistantReply]);

  /**
   * Checks if user text resolves an active confirmation/disambiguation dialog.
   * Returns true if handled locally without needing an action override.
   */
  const tryHandlePendingConfirmation = useCallback(
    async (spokenOrTyped: string, turnLang: LanguageCode): Promise<boolean> => {
      if (!pendingAction) return false;
      const trimmed = spokenOrTyped.trim();
      const parsed = parseVoiceConfirmationIntent(trimmed);

      if (pendingAction.type === "call_disambiguate" && pendingAction.matchedContacts) {
        if (parsed.fourDigits) {
          const matchedBy4 = pendingAction.matchedContacts.find((c) =>
            c.phone.replace(/\D/g, "").endsWith(parsed.fourDigits!)
          );
          if (matchedBy4) {
            appendMessage("user", trimmed, turnLang);
            await handleSelectDisambiguatedContact(matchedBy4);
            return true;
          }
        }
        const matchedByName = pendingAction.matchedContacts.find((c) =>
          c.name.toLowerCase().includes(trimmed.toLowerCase())
        );
        if (matchedByName) {
          appendMessage("user", trimmed, turnLang);
          await handleSelectDisambiguatedContact(matchedByName);
          return true;
        }
        if (parsed.decision === "cancel") {
          appendMessage("user", trimmed, turnLang);
          await handleCancelPendingAction();
          return true;
        }
        return false;
      }

      if (parsed.decision === "confirm") {
        appendMessage("user", trimmed, turnLang);
        if (pendingAction.intentHref && !isNativeAndroidRuntime()) {
          if (pendingAction.intentHref.startsWith("tel:")) {
            window.location.href = pendingAction.intentHref;
          }
        }
        await handleConfirmPendingAction();
        return true;
      }

      if (parsed.decision === "cancel") {
        appendMessage("user", trimmed, turnLang);
        await handleCancelPendingAction();
        return true;
      }

      return false;
    },
    [
      appendMessage,
      handleCancelPendingAction,
      handleConfirmPendingAction,
      handleSelectDisambiguatedContact,
      pendingAction,
    ]
  );

  /**
   * Applies Gemini toolActions + speaks PIYA AI's reply immediately.
   */
  const applyAssistantResponse = useCallback(
    async (
      userTranscript: string,
      rawReply: string,
      replyLang: LanguageCode,
      toolActions: Array<{ id: string; name: string; args: Record<string, unknown> }> | undefined,
      freshBattery: BatteryInfo,
      inlineAudioBase64?: string
    ) => {
      if (replyLang !== settings.language) {
        updateSettings({ language: replyLang });
      }

      let finalSpokenReply = rawReply;
      let actionBadge: string | undefined;

      if (toolActions && toolActions.length > 0) {
        for (const tool of toolActions) {
          const args = tool.args || {};

          if (tool.name === "proposePhoneCall") {
            const callPrep = prepareCallAction(
              typeof args.contactName === "string" ? args.contactName : undefined,
              typeof args.lastFourDigits === "string" ? args.lastFourDigits : undefined,
              replyLang
            );
            setPendingAction(callPrep.pending);
            if (callPrep.spokenOverride) {
              finalSpokenReply = callPrep.spokenOverride;
            }
            actionBadge = "Phone Call";
          } else if (tool.name === "searchYouTube") {
            const q = String(args.query || "").trim() || userTranscript;
            const platform =
              args.targetApp === "youtube_music" ? "youtube_music" : "youtube";
            const url = buildYouTubeSearchUrl(q, platform);
            setPendingAction({
              id: `pa_${Date.now()}`,
              type: "youtube_search",
              title: platform === "youtube_music" ? `YouTube Music: ${q}` : `YouTube: ${q}`,
              explanation:
                replyLang === "bn"
                  ? `"${q}" ইউটিউবে খুলতে হ্যাঁ চাপুন।`
                  : `"${q}" को YouTube पर खोलने के लिए हाँ दबाएँ।`,
              youtubeQuery: q,
              youtubePlatform: platform,
              intentHref: isNativeAndroidRuntime() ? undefined : url,
            });
            actionBadge = "YouTube";
          } else if (tool.name === "openApplication") {
            const appName = String(args.appName || "App");
            const target = resolveAppLaunchTarget(appName);
            setPendingAction({
              id: `pa_${Date.now()}`,
              type: "open_app",
              title: `${target.label}`,
              explanation:
                replyLang === "bn"
                  ? `${target.label} অ্যাপটি খুলতে চান?`
                  : `क्या आप ${target.label} ऐप खोलना चाहते हैं?`,
              appName: target.label,
              intentHref: isNativeAndroidRuntime() || !target.href ? undefined : target.href,
            });
            actionBadge = target.label;
          } else if (tool.name === "lockPhoneScreen") {
            setPendingAction({
              id: `pa_${Date.now()}`,
              type: "lock_phone",
              title: replyLang === "bn" ? "ফোন স্ক্রিন লক" : "फ़ोन स्क्रीन लॉक",
              explanation:
                replyLang === "bn"
                  ? "জানু এআই ফোন লক করবে। আপনি কি নিশ্চিত?"
                  : "जानू एआई फ़ोन लॉक करेगी। क्या आप पुष्टि करते हैं?",
            });
            actionBadge = "Lock Screen";
          } else if (tool.name === "openSystemSettings") {
            const rawSec = String(args.settingType || "phone_settings");
            const sec: "wifi" | "bluetooth" | "phone_settings" | "device_admin" =
              rawSec === "wifi" || rawSec === "bluetooth" || rawSec === "device_admin"
                ? rawSec
                : "phone_settings";
            const sysPreview = await executeSystemSettingsOpen(sec);
            setPendingAction({
              id: `pa_${Date.now()}`,
              type: "open_settings",
              title: sec.replace("_", " ").toUpperCase(),
              explanation: sysPreview.message,
              settingSection: sec,
              intentHref: sysPreview.intentHref,
            });
            actionBadge = "Settings";
          } else if (tool.name === "controlFlashlight") {
            const mode = String(args.mode || "toggle");
            const nextEnable = mode === "on" ? true : mode === "off" ? false : !flashlightOn;
            const torchRes = await setHardwareFlashlight(nextEnable);
            setFlashlightOn(torchRes.enabled);
            if (!torchRes.success) {
              finalSpokenReply =
                replyLang === "bn"
                  ? "এই ব্রাউজারে ফ্ল্যাশলাইট কন্ট্রোল নেই। Android APK-তে এটি সরাসরি কাজ করে।"
                  : "इस ब्राउज़र में फ़्लैशलाइट कंट्रोल उपलब्ध नहीं है। Android APK में यह सीधे काम करता है।";
            }
            actionBadge = "Flashlight";
          } else if (tool.name === "checkBatteryStatus") {
            if (!freshBattery.supported || freshBattery.level === null) {
              finalSpokenReply =
                replyLang === "bn"
                  ? "আপনার বর্তমান ব্রাউজার ব্যাটারির তথ্য দিচ্ছে না। Android অ্যাপে এটি কাজ করে।"
                  : "आपका ब्राउज़र बैटरी की जानकारी नहीं दे रहा है। Android ऐप में यह काम करता है।";
            }
            actionBadge = "Battery";
          } else if (tool.name === "setDeviceAlarm") {
            const hour = Math.max(0, Math.min(23, Number(args.hour ?? 7)));
            const minute = Math.max(0, Math.min(59, Number(args.minute ?? 0)));
            const label = String(args.label || "Janu AI Alarm");
            const tStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
            setPendingAction({
              id: `pa_${Date.now()}`,
              type: "set_alarm",
              title: `${tStr}`,
              explanation:
                replyLang === "bn"
                  ? `${tStr} সময়ে "${label}" অ্যালার্ম সেট করতে চান?`
                  : `क्या आप ${tStr} बजे के लिए "${label}" अलार्म सेट करना चाहते हैं?`,
              alarmData: { hour, minute, label },
            });
            actionBadge = `Alarm ${tStr}`;
          } else if (tool.name === "createPersonalNote") {
            const title = String(args.title || "Note");
            const content = String(args.content || userTranscript);
            const newNote: NoteItem = {
              id: `nt_${Date.now()}`,
              title,
              content,
              createdAt: new Date().toISOString(),
            };
            setNotes((prev) => [newNote, ...prev]);
            actionBadge = "Note Saved";
          } else if (tool.name === "proposeMemorySave" && settings.memoryEnabled) {
            const category = String(args.category || "Preference");
            const fact = String(args.fact || "");
            if (fact) {
              if (settings.autoConfirmMemory) {
                setMemories((prev) => [
                  {
                    id: `mem_${Date.now()}`,
                    category,
                    fact,
                    createdAt: new Date().toISOString(),
                  },
                  ...prev,
                ]);
                actionBadge = "Memory Saved";
              } else {
                setPendingAction({
                  id: `pa_${Date.now()}`,
                  type: "save_memory",
                  title: replyLang === "bn" ? "মেমোরিতে সংরক্ষণ" : "मेमोरी में सहेजें",
                  explanation:
                    replyLang === "bn"
                      ? `জানু কি এটি মনে রাখবে: "${fact}"?`
                      : `क्या जानू यह याद रखे: "${fact}"?`,
                  memoryData: { category, fact },
                });
                actionBadge = "Save Memory";
              }
            }
          }
        }
      }

      const canUseInlineAudio = Boolean(inlineAudioBase64 && finalSpokenReply === rawReply);
      appendMessage("assistant", finalSpokenReply, replyLang, { actionBadge });
      await speakAssistantReply(
        finalSpokenReply,
        replyLang,
        canUseInlineAudio ? inlineAudioBase64 : undefined
      );
    },
    [
      appendMessage,
      flashlightOn,
      prepareCallAction,
      settings.autoConfirmMemory,
      settings.language,
      settings.memoryEnabled,
      speakAssistantReply,
      updateSettings,
    ]
  );

  // =========================================================================
  // FAST TEXT CONVERSATION PROCESSOR
  // =========================================================================
  const processUserUtterance = useCallback(
    async (rawText: string, detectedLangHint?: LanguageCode) => {
      const trimmed = rawText.trim();
      if (!trimmed) return;

      voiceEngineRef.current?.unlockAudioOnGesture();

      if (!isOnline) {
        setErrorBanner(UI_COPY[settings.language].offlineMode);
        return;
      }

      setErrorBanner(null);
      const turnLang = detectedLangHint || settings.language;

      const handledPending = await tryHandlePendingConfirmation(trimmed, turnLang);
      if (handledPending) return;

      appendMessage("user", trimmed, turnLang);
      setVisualState("thinking");

      try {
        const freshBattery = await readLiveBatteryStatus();
        setBattery(freshBattery);

        const { ok, status, data } = await fetchApiJson<{
          reply?: string;
          language?: LanguageCode;
          toolActions?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
          audioBase64?: string;
          error?: string;
        }>("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            preferredLanguage: settings.language,
            inlineFemaleTts: !settings.preferNeuralTts,
            history: messages.slice(-8).map((m) => ({
              role: m.role,
              text: m.text,
            })),
            memories: settings.memoryEnabled ? memories : [],
            contacts,
            deviceState: {
              batteryLevel: freshBattery.level,
              isCharging: freshBattery.charging,
              isNativeAndroid: isNativeAndroidRuntime(),
              isDeviceAdminActive: deviceAdminActive,
              flashlightOn,
            },
          }),
        });

        if (!ok || !data.reply) {
          throw new Error(data.error || `সার্ভার ত্রুটি (${status})`);
        }

        const replyLang: LanguageCode = data.language === "hi" ? "hi" : "bn";
        await applyAssistantResponse(
          trimmed,
          data.reply,
          replyLang,
          data.toolActions,
          freshBattery,
          data.audioBase64
        );
      } catch (err) {
        setVisualState("idle");
        const errMsg =
          err instanceof Error ? err.message : "উত্তর তৈরিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।";
        setErrorBanner(errMsg);
      }
    },
    [
      appendMessage,
      applyAssistantResponse,
      contacts,
      deviceAdminActive,
      flashlightOn,
      isOnline,
      memories,
      messages,
      settings.language,
      settings.memoryEnabled,
      settings.preferNeuralTts,
      tryHandlePendingConfirmation,
    ]
  );

  // =========================================================================
  // SINGLE-PASS MICROPHONE CAPTURE -> VOICE TURN (~1.3s END-TO-END)
  // =========================================================================
  const finishActiveMicCapture = useCallback(async () => {
    if (!voiceEngineRef.current || finishingMicRef.current) return;
    finishingMicRef.current = true;
    setVisualState("thinking");
    setMicLevel(0);

    try {
      const payload = await voiceEngineRef.current.finishListeningRawAudio();
      setInterimTranscript("");

      if (!payload) {
        setVisualState("idle");
        setErrorBanner(
          settings.language === "bn"
            ? "কোনো কথা শোনা যায়নি। মাইক বাটনে ট্যাপ করে স্পষ্টভাবে বলুন।"
            : "कोई आवाज़ नहीं मिली। माइक दबाकर स्पष्ट रूप से बोलें।"
        );
        return;
      }

      // If browser captured text only without audio bytes
      if (!payload.audioBase64 && payload.webFallbackTranscript) {
        await processUserUtterance(payload.webFallbackTranscript, settings.language);
        return;
      }

      const freshBattery = await readLiveBatteryStatus();
      setBattery(freshBattery);

      const { ok, status, data } = await fetchApiJson<{
        heardSpeech?: boolean;
        transcript?: string;
        reply?: string;
        language?: LanguageCode;
        toolActions?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
        audioBase64?: string;
        error?: string;
      }>("/api/assistant/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: payload.audioBase64,
          mimeType: payload.mimeType,
          preferredLanguage: settings.language,
          inlineFemaleTts: !settings.preferNeuralTts,
          history: messages.slice(-8).map((m) => ({
            role: m.role,
            text: m.text,
          })),
          memories: settings.memoryEnabled ? memories : [],
          contacts,
          deviceState: {
            batteryLevel: freshBattery.level,
            isCharging: freshBattery.charging,
            isNativeAndroid: isNativeAndroidRuntime(),
            isDeviceAdminActive: deviceAdminActive,
            flashlightOn,
          },
        }),
      });

      if (!ok) {
        if (payload.webFallbackTranscript) {
          await processUserUtterance(payload.webFallbackTranscript, settings.language);
          return;
        }
        throw new Error(data.error || `ভয়েস সার্ভিস ত্রুটি (${status})`);
      }

      const transcript = (data.transcript || payload.webFallbackTranscript || "").trim();
      if (data.heardSpeech === false || !transcript) {
        setVisualState("idle");
        setErrorBanner(
          settings.language === "bn"
            ? "স্পষ্ট কথা শোনা যায়নি। অনুগ্রহ করে আবার মাইক ট্যাপ করে বলুন।"
            : "स्पष्ट आवाज़ सुनाई नहीं दी। कृपया माइक टैप करके फिर से बोलें।"
        );
        return;
      }

      const replyLang: LanguageCode = data.language === "hi" ? "hi" : "bn";

      // First check if user spoke "হ্যাঁ" / "না" / 4-digits for an active PendingAction
      const handledPending = await tryHandlePendingConfirmation(transcript, replyLang);
      if (handledPending) {
        return;
      }

      appendMessage("user", transcript, replyLang);
      await applyAssistantResponse(
        transcript,
        data.reply || "",
        replyLang,
        data.toolActions,
        freshBattery,
        data.audioBase64
      );
    } catch (err) {
      setVisualState("idle");
      setInterimTranscript("");
      setErrorBanner(
        err instanceof Error ? err.message : "ভয়েস চিনতে সমস্যা হয়েছে। আবার চেষ্টা করুন।"
      );
    } finally {
      finishingMicRef.current = false;
    }
  }, [
    appendMessage,
    applyAssistantResponse,
    contacts,
    deviceAdminActive,
    flashlightOn,
    memories,
    messages,
    processUserUtterance,
    settings.language,
    settings.memoryEnabled,
    settings.preferNeuralTts,
    tryHandlePendingConfirmation,
  ]);

  const handleToggleMic = useCallback(async () => {
    if (!voiceEngineRef.current) return;

    voiceEngineRef.current.unlockAudioOnGesture();

    if (visualState === "listening") {
      await finishActiveMicCapture();
      return;
    }

    setErrorBanner(null);

    try {
      setInterimTranscript("");
      setVisualState("listening");
      await voiceEngineRef.current.startListeningSession({
        language: settings.language,
        onInterimTranscript: (txt) => setInterimTranscript(txt),
        onInputLevel: (lvl) => setMicLevel(lvl),
        onAutoSilenceStop: () => {
          finishActiveMicCapture();
        },
      });
      setMicPermission("granted");
    } catch (err) {
      setVisualState("idle");
      const msg = err instanceof Error ? err.message : "মাইক্রোফোন চালু করা যায়নি।";
      if (/অনুমতি|অনুমোদন|allow|permission|अनुमति/i.test(msg)) {
        setMicPermission("denied");
      }
      setErrorBanner(msg);
    }
  }, [finishActiveMicCapture, settings.language, visualState]);

  const handleCancelMic = useCallback(() => {
    voiceEngineRef.current?.cancelListening();
    setInterimTranscript("");
    setMicLevel(0);
    setVisualState("idle");
  }, []);

  const handleStopSpeaking = useCallback(() => {
    voiceEngineRef.current?.stopSpeaking();
    setLipSync({ mouthOpen: 0, mouthSpread: 0.35, energy: 0 });
    setVisualState("idle");
  }, []);

  const handleResetAllData = useCallback(() => {
    Object.values(STORAGE_KEYS).forEach((k) => window.localStorage.removeItem(k));
    setMemories([]);
    setMessages([]);
    setNotes([]);
    setAlarms([]);
    setContacts(DEFAULT_CONTACTS);
    setSettings(DEFAULT_SETTINGS);
    setActionStatusToast(
      settings.language === "bn" ? "সব সংরক্ষিত ডেটা মুছে ফেলা হয়েছে।" : "सारा डेटा हटा दिया गया है।"
    );
  }, [settings.language]);

  const copy = UI_COPY[settings.language];

  const voiceStatusText = !isOnline
    ? copy.offlineMode
    : micPermission === "denied"
    ? copy.micDenied
    : visualState === "listening"
    ? copy.voiceListening
    : visualState === "thinking"
    ? copy.voiceThinking
    : visualState === "speaking"
    ? copy.voiceSpeaking
    : copy.voiceReady;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--piya-bg)] text-slate-100">
      {/* Active Ringing Alarm Banner */}
      {ringingAlarm && (
        <div className="sticky top-0 z-50 bg-amber-500 text-slate-950 px-4 py-3 flex items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <BellRing className="w-5 h-5" />
            <span>
              {String(ringingAlarm.hour).padStart(2, "0")}:
              {String(ringingAlarm.minute).padStart(2, "0")} — {ringingAlarm.label}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setRingingAlarm(null)}
            className="min-h-[38px] px-4 rounded-lg bg-slate-950 text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            বন্ধ করুন
          </button>
        </div>
      )}

      {/* Clean Top Bar (Brand — 3 Navigation Tabs — Start CTA) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-8 h-16 border-b border-[var(--piya-border)] bg-[#060b18]/95">
        <button
          type="button"
          onClick={() => setActiveTab("home")}
          className="flex items-center gap-2.5 shrink-0 text-left"
        >
          <img
            src={OFFICIAL_PIYA_CHARACTER_IMAGE}
            alt="Janu AI"
            className="w-9 h-9 rounded-xl object-cover object-[50%_16%] border border-[var(--piya-border)]"
          />
          <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap">
            Janu AI
          </span>
        </button>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          {(
            [
              { id: "home" as ActiveTab, label: copy.tabHome },
              { id: "actions" as ActiveTab, label: copy.tabActions },
              { id: "memory" as ActiveTab, label: copy.tabMemory },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === item.id
                  ? "text-white border-[var(--piya-accent)]"
                  : "text-slate-400 hover:text-white border-transparent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-800 bg-[#0b1326] text-slate-200 hover:text-white transition-colors"
            aria-label="Profile"
          >
            <User className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-800 bg-[#0b1326] text-slate-200 hover:text-white transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
          </button>
          <button
            type="button"
            onClick={() => {
              voiceEngineRef.current?.unlockAudioOnGesture();
              setFullScreenAssistant(true);
            }}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--piya-accent)] text-[var(--piya-on-accent)] text-xs font-semibold hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
          >
            {copy.startAssistant}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 py-5 pb-24 md:pb-10">
        {activeTab === "home" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Official PIYA AI Main Character Stage (Shown First on Mobile for Immediate Presence) */}
            <div className="lg:col-span-6 lg:order-2 rounded-3xl border border-[var(--piya-border)] bg-[#02050d] h-[440px] sm:h-[540px] lg:h-[600px] flex flex-col overflow-hidden relative">
              <div className="flex-1 min-h-0">
                <PiyaCharacter3D
                  visualState={visualState}
                  themeId={settings.theme}
                  lipSync={lipSync}
                  micLevel={micLevel}
                  compactPreview
                />
              </div>
            </div>

            {/* Clean Main Controls Card */}
            <div className="lg:col-span-6 lg:order-1 flex flex-col justify-between space-y-6 rounded-3xl border border-[var(--piya-border)] bg-[var(--piya-surface)] p-5 sm:p-8">
              <div className="space-y-5">
                {/* Voice Status Indicator */}
                <div className="text-xs font-semibold" style={{ color: "var(--piya-accent-bright)" }}>
                  {voiceStatusText}
                </div>

                {/* Title & Subtitle */}
                <div className="space-y-2.5">
                  <h1
                    className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white leading-snug"
                    style={{ textWrap: "balance" }}
                  >
                    {copy.heroTitle}
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    {copy.subtitle}
                  </p>
                </div>

                {/* Language Switch & 5 Theme Swatches */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-[#060c1a] border border-slate-800">
                    <button
                      type="button"
                      onClick={() => updateSettings({ language: "bn" })}
                      className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        settings.language === "bn"
                          ? "bg-[var(--piya-accent)] text-[var(--piya-on-accent)]"
                          : "text-slate-300 hover:text-white"
                      }`}
                    >
                      বাংলা
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ language: "hi" })}
                      className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        settings.language === "hi"
                          ? "bg-[var(--piya-accent)] text-[var(--piya-on-accent)]"
                          : "text-slate-300 hover:text-white"
                      }`}
                    >
                      हिन्दी
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {(Object.keys(PIYA_THEMES) as ThemeId[]).map((tId) => {
                      const t = PIYA_THEMES[tId];
                      const active = settings.theme === tId;
                      return (
                        <button
                          key={tId}
                          type="button"
                          onClick={() => updateSettings({ theme: tId })}
                          className={`min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center border transition-transform ${
                            active
                              ? "border-white scale-105 bg-white/10"
                              : "border-slate-800 bg-[#060c1a] hover:border-slate-600"
                          }`}
                          title={t.name}
                          aria-label={t.name}
                        >
                          <span
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: t.accent }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Primary Start Assistant & Instant Speak Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      voiceEngineRef.current?.unlockAudioOnGesture();
                      setFullScreenAssistant(true);
                    }}
                    className="min-h-[52px] px-6 py-3 rounded-2xl bg-[var(--piya-accent)] text-[var(--piya-on-accent)] font-semibold text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98] whitespace-nowrap shrink-0"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{copy.startAssistant}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      voiceEngineRef.current?.unlockAudioOnGesture();
                      setFullScreenAssistant(true);
                      window.setTimeout(() => {
                        handleToggleMic();
                      }, 80);
                    }}
                    className="min-h-[52px] px-5 py-3 rounded-2xl border border-[var(--piya-border)] bg-[#060c1a] text-slate-100 hover:text-white font-semibold text-sm flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Mic className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
                    <span>{copy.tapToSpeak}</span>
                  </button>
                </div>
              </div>

              {/* Quick 1-Tap Commands */}
              <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {copy.samplePrompts.map((promptText) => (
                    <button
                      key={promptText}
                      type="button"
                      onClick={() => {
                        voiceEngineRef.current?.unlockAudioOnGesture();
                        setFullScreenAssistant(true);
                        processUserUtterance(promptText, settings.language);
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-800 bg-[#060c1a] hover:border-[var(--piya-accent)] text-xs text-slate-200 hover:text-white text-left transition-colors"
                    >
                      {promptText}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "actions" && (
          <PhoneActionsPanel
            language={settings.language}
            contacts={contacts}
            notes={notes}
            alarms={alarms}
            battery={battery}
            flashlightOn={flashlightOn}
            statusToast={actionStatusToast}
            onAddContact={(c) =>
              setContacts((prev) => [
                ...prev,
                { ...c, id: `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 5)}` },
              ])
            }
            onImportContacts={(imported) => setContacts((prev) => [...imported, ...prev])}
            onDeleteContact={(id) => setContacts((prev) => prev.filter((c) => c.id !== id))}
            onRequestCallByQuery={(q) => {
              voiceEngineRef.current?.unlockAudioOnGesture();
              const callPrep = prepareCallAction(q, undefined, settings.language);
              setPendingAction(callPrep.pending);
              setFullScreenAssistant(true);
              if (callPrep.spokenOverride) {
                appendMessage("assistant", callPrep.spokenOverride, settings.language, {
                  actionBadge: "Phone Call",
                });
                speakAssistantReply(callPrep.spokenOverride, settings.language);
              }
            }}
            onAddNote={(title, content) => {
              setNotes((prev) => [
                {
                  id: `nt_${Date.now()}`,
                  title,
                  content,
                  createdAt: new Date().toISOString(),
                },
                ...prev,
              ]);
              setActionStatusToast(`নোট সংরক্ষিত: "${title}"`);
            }}
            onDeleteNote={(id) => setNotes((prev) => prev.filter((n) => n.id !== id))}
            onAddAlarm={(hour, minute, label) => {
              const tStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
              setPendingAction({
                id: `pa_${Date.now()}`,
                type: "set_alarm",
                title: `${tStr}`,
                explanation:
                  settings.language === "bn"
                    ? `${tStr} সময়ে "${label}" অ্যালার্ম সেট করতে চান?`
                    : `क्या आप ${tStr} बजे के लिए "${label}" अलार्म सेट करना चाहते हैं?`,
                alarmData: { hour, minute, label },
              });
              setFullScreenAssistant(true);
            }}
            onToggleAlarm={(id) =>
              setAlarms((prev) =>
                prev.map((a) =>
                  a.id === id ? { ...a, enabled: !a.enabled, triggeredToday: false } : a
                )
              )
            }
            onDeleteAlarm={(id) => setAlarms((prev) => prev.filter((a) => a.id !== id))}
            onRefreshBattery={async () => {
              const bat = await readLiveBatteryStatus();
              setBattery(bat);
              setActionStatusToast(
                bat.supported && bat.level !== null
                  ? `ব্যাটারি: ${bat.level}%`
                  : "বর্তমান ব্রাউজারে ব্যাটারি রিডিং নেই; Android APK-তে উপলব্ধ।"
              );
            }}
            onToggleFlashlight={async () => {
              const res = await setHardwareFlashlight(!flashlightOn);
              setFlashlightOn(res.enabled);
              setActionStatusToast(res.message);
            }}
            onOpenSettingsSection={async (sec) => {
              const res = await executeSystemSettingsOpen(sec);
              setActionStatusToast(res.message);
              if (res.intentHref) {
                setPendingAction({
                  id: `pa_${Date.now()}`,
                  type: "open_settings",
                  title: sec.replace("_", " ").toUpperCase(),
                  explanation: res.message,
                  settingSection: sec,
                  intentHref: res.intentHref,
                });
                setFullScreenAssistant(true);
              }
            }}
            onRequestPhoneLock={() => {
              setPendingAction({
                id: `pa_${Date.now()}`,
                type: "lock_phone",
                title: settings.language === "bn" ? "ফোন স্ক্রিন লক" : "फ़ोन स्क्रीन लॉक",
                explanation:
                  settings.language === "bn"
                    ? "জানু এআই ফোন লক করবে। নিশ্চিত করতে চান?"
                    : "जानू एआई फ़ोन लॉक करेगी। क्या आप पुष्टि करते हैं?",
              });
              setFullScreenAssistant(true);
            }}
            onReportStatus={(msg) => setActionStatusToast(msg)}
          />
        )}

        {activeTab === "memory" && (
          <MemoryVaultPanel
            memories={memories}
            messages={messages}
            memoryEnabled={settings.memoryEnabled}
            autoConfirmMemory={settings.autoConfirmMemory}
            onToggleMemoryEnabled={(enabled) => updateSettings({ memoryEnabled: enabled })}
            onToggleAutoConfirmMemory={(auto) => updateSettings({ autoConfirmMemory: auto })}
            onAddMemory={(category, fact) =>
              setMemories((prev) => [
                {
                  id: `mem_${Date.now()}`,
                  category,
                  fact,
                  createdAt: new Date().toISOString(),
                },
                ...prev,
              ])
            }
            onDeleteMemory={(id) => setMemories((prev) => prev.filter((m) => m.id !== id))}
            onClearAllMemories={() => setMemories([])}
            onClearHistory={() => setMessages([])}
          />
        )}
      </main>

      {/* Clean 3-Tab Mobile Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 border-t border-[var(--piya-border)] bg-[#060b18]/95 grid grid-cols-3 items-center">
        {(
          [
            { id: "home" as ActiveTab, label: copy.tabHome, Icon: Sparkles },
            { id: "actions" as ActiveTab, label: copy.tabActions, Icon: Wrench },
            { id: "memory" as ActiveTab, label: copy.tabMemory, Icon: Brain },
          ] as const
        ).map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
                active ? "text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon
                className="w-5 h-5"
                style={active ? { color: "var(--piya-accent-bright)" } : undefined}
              />
              <span className="text-[11px] font-medium mt-1 whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Full-Screen Assistant Character Interface */}
      {fullScreenAssistant && (
        <AssistantFullScreen
          language={settings.language}
          themeId={settings.theme}
          visualState={visualState}
          micPermission={micPermission}
          isOnline={isOnline}
          lipSync={lipSync}
          micLevel={micLevel}
          interimTranscript={interimTranscript}
          messages={messages}
          pendingAction={pendingAction}
          errorBanner={errorBanner}
          onDismissError={() => setErrorBanner(null)}
          onBackToHome={() => {
            voiceEngineRef.current?.cancelListening();
            setVisualState((s) => (s === "listening" ? "idle" : s));
            setFullScreenAssistant(false);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onChangeLanguage={(lang) => updateSettings({ language: lang })}
          onToggleMic={handleToggleMic}
          onCancelMic={handleCancelMic}
          onStopSpeaking={handleStopSpeaking}
          onSendTextCommand={(txt) => processUserUtterance(txt)}
          onConfirmPendingAction={handleConfirmPendingAction}
          onCancelPendingAction={handleCancelPendingAction}
          onSelectDisambiguatedContact={handleSelectDisambiguatedContact}
          onClearConversation={() => setMessages([])}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        micPermission={micPermission}
        memoriesCount={memories.length}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={updateSettings}
        onRequestMicPermission={async () => {
          const res = await requestExplicitMicrophoneAccess();
          setMicPermission(res.state);
          if (res.error) setErrorBanner(res.error);
        }}
        onTestVoiceSample={() => {
          voiceEngineRef.current?.unlockAudioOnGesture();
          const sample =
            settings.language === "bn"
              ? "নমস্কার, আমি জানু এআই। আমি দ্রুত আপনার কথা শুনতে ও সাহায্য করতে প্রস্তুত।"
              : "नमस्ते, मैं जानू एआई हूँ। मैं तुरंत आपकी मदद करने के लिए तैयार हूँ।";
          speakAssistantReply(sample, settings.language);
        }}
        onClearMemories={() => setMemories([])}
        onResetAllData={handleResetAllData}
      />

      {/* Profile Modal */}
      <ProfileModal
        open={profileOpen}
        profile={profile}
        onClose={() => setProfileOpen(false)}
        onSaveProfile={(next) => setProfile(next)}
        onLogoutSession={() =>
          setProfile({
            displayName: "Guest",
            email: "",
            signedIn: false,
          })
        }
        onDeleteAllUserData={handleResetAllData}
      />

      {/* Dismissible Status Toast */}
      {actionStatusToast && activeTab !== "actions" && (
        <div className="fixed bottom-20 md:bottom-6 right-6 z-40 max-w-sm rounded-xl border border-[var(--piya-border)] bg-[#0b1428] px-4 py-3 shadow-xl flex items-start gap-3 text-xs text-slate-200">
          <span className="flex-1">{actionStatusToast}</span>
          <button
            type="button"
            onClick={() => setActionStatusToast(null)}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
