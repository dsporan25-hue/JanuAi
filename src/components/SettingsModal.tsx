import React from "react";
import {
  BatteryCharging,
  Check,
  Mic,
  Power,
  Radio,
  Shield,
  Trash2,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import type {
  AlwaysActiveStatus,
  AppSettings,
  LanguageCode,
  ThemeId,
  VoiceOption,
} from "../types/piya";
import type { MicPermissionState } from "../services/voiceEngine";
import { PIYA_THEMES, VOICE_OPTIONS } from "../constants/themesAndCopy";
import { isNativeAndroidRuntime } from "../services/androidBridge";

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  alwaysActiveStatus: AlwaysActiveStatus;
  micPermission: MicPermissionState;
  memoriesCount: number;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onToggleAlwaysActive: (enabled: boolean) => void;
  onRequestBatteryExemption: () => void;
  onOpenSystemAppPermissions: () => void;
  onRequestMicPermission: () => void;
  onTestVoiceSample: () => void;
  onClearMemories: () => void;
  onResetAllData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  alwaysActiveStatus,
  micPermission,
  memoriesCount,
  onClose,
  onUpdateSettings,
  onToggleAlwaysActive,
  onRequestBatteryExemption,
  onOpenSystemAppPermissions,
  onRequestMicPermission,
  onTestVoiceSample,
  onClearMemories,
  onResetAllData,
}) => {
  if (!open) return null;

  const lang = settings.language;
  const isBn = lang === "bn";
  const isHi = lang === "hi";
  const isNative = isNativeAndroidRuntime();

  const liveStageSummary = !settings.alwaysActiveVoice
    ? isBn
      ? "বন্ধ আছে · মাইক্রোফোন সম্পূর্ণ অফ"
      : isHi
      ? "बंद है · माइक्रोफ़ोन पूरी तरह बंद"
      : "OFF · Microphone completely stopped"
    : alwaysActiveStatus.stage === "paused_permission" || micPermission === "denied"
    ? isBn
      ? "মাইক্রোফোন অনুমতি প্রয়োজন — নিচে Allow করুন"
      : isHi
      ? "माइक्रोफ़ोन अनुमति आवश्यक है"
      : "Microphone permission required"
    : alwaysActiveStatus.mode === "offline"
    ? isBn
      ? `সক্রিয় (অফলাইন লোকাল মোড) · 'Hey ${settings.wakeWord || "Janu"}' বলুন`
      : isHi
      ? `सक्रिय (ऑफ़लाइन लोकल मोड) · 'Hey ${settings.wakeWord || "Janu"}' बोलें`
      : `Active (Offline Local Mode) · Say 'Hey ${settings.wakeWord || "Janu"}'`
    : isBn
    ? `সর্বদা সক্রিয় (অনলাইন এআই) · 'Hey ${settings.wakeWord || "Janu"}' বা 'জানু' বলুন`
    : isHi
    ? `हमेशा सक्रिय (ऑनलाइन एआई) · 'Hey ${settings.wakeWord || "Janu"}' या 'जानू' बोलें`
    : `Always Active (Online AI) · Say 'Hey ${settings.wakeWord || "Janu"}'`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-3xl border border-[var(--piya-border)] bg-[#080f20] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              {isBn ? "জানু এআই সেটিংস" : isHi ? "जानू एआई सेटिंग्स" : "Janu AI Settings"}
            </h2>
            <p className="text-xs text-slate-400">
              {isBn
                ? "Always Active · ভাষা · মেয়ের কণ্ঠস্বর · থিম · প্রাইভেসি"
                : isHi
                ? "Always Active · भाषा · महिला आवाज़ · थीम · प्राइवेसी"
                : "Always Active · Language · Female Voice · Themes · Privacy"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/5"
            aria-label="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* 1. Permanent Always Active Voice Assistant Switch (JARVIS Mode) */}
          <section className="rounded-2xl border border-[var(--piya-border)] bg-[#050b18] p-4 space-y-3.5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Radio
                    className="w-4 h-4 shrink-0"
                    style={{ color: "var(--piya-accent-bright)" }}
                  />
                  <h3 className="text-sm font-bold text-white">
                    Always Active Voice Assistant
                  </h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isBn
                    ? "ON রাখলে বারবার মাইক বাটন চাপতে হবে না — 'Hey Janu' বা 'জানু' বললেই জানু শুনবে এবং উত্তর শেষে আবার Wake Word শোনার অবস্থায় ফিরে যাবে।"
                    : isHi
                    ? "ON रखने पर बार-बार माइक बटन दबाने की ज़रूरत नहीं — 'Hey Janu' या 'जानू' बोलते ही जानू सुनेगी और जवाब के बाद फिर तैयार रहेगी।"
                    : "Hands-free JARVIS mode — say 'Hey Janu' anytime without pressing the mic button. Stays saved across app & phone restarts until you turn it OFF."}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.alwaysActiveVoice}
                onClick={() => onToggleAlwaysActive(!settings.alwaysActiveVoice)}
                className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${
                  settings.alwaysActiveVoice
                    ? "bg-[var(--piya-accent)] border-[var(--piya-accent-bright)]"
                    : "bg-slate-800 border-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                    settings.alwaysActiveVoice ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#081126] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-200">{liveStageSummary}</span>
              <span className="text-[11px] text-slate-400">
                {settings.alwaysActiveVoice ? "ON" : "OFF"}
              </span>
            </div>

            {/* Custom Wake Word Field */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">
                  {isBn
                    ? "Wake Word (ডিফল্ট: Janu / জানু / जानू)"
                    : isHi
                    ? "Wake Word (डिफ़ॉल्ट: Janu / जानू / জানু)"
                    : "Wake Word (Default: Janu / Hey Janu)"}
                </label>
                <input
                  type="text"
                  value={settings.wakeWord}
                  onChange={(e) => onUpdateSettings({ wakeWord: e.target.value })}
                  placeholder="Janu"
                  maxLength={24}
                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#040812] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
                />
              </div>

              {isNative && settings.alwaysActiveVoice && !alwaysActiveStatus.batteryOptimizationIgnored && (
                <button
                  type="button"
                  onClick={onRequestBatteryExemption}
                  className="min-h-[40px] px-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <BatteryCharging className="w-4 h-4 shrink-0" />
                  <span>
                    {isBn
                      ? "ব্যাটারি অপটিমাইজেশন বন্ধ করুন"
                      : isHi
                      ? "बैटरी ऑप्टिमाइज़ेशन बंद करें"
                      : "Allow Unrestricted Battery"}
                  </span>
                </button>
              )}
            </div>

            {isNative && (micPermission === "denied" || alwaysActiveStatus.stage === "paused_permission") && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs text-rose-300">
                  {isBn
                    ? "অ্যান্ড্রয়েড সেটিংসে মাইক্রোফোন অনুমতি বন্ধ করা হয়েছে।"
                    : "Microphone permission is revoked in Android settings."}
                </span>
                <button
                  type="button"
                  onClick={onOpenSystemAppPermissions}
                  className="min-h-[38px] px-3 rounded-lg bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isBn ? "অ্যাপ পারমিশন খুলুন" : "Open App Permissions"}</span>
                </button>
              </div>
            )}
          </section>

          {/* 2. Language Selection (Bengali, Hindi, English) */}
          <section className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <h3 className="text-sm font-semibold text-white">
              {isBn ? "২. ভাষা নির্বাচন" : isHi ? "2. भाषा चुनें" : "2. Language Selection"}
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { code: "bn" as LanguageCode, title: "বাংলা", sub: "প্রধান ভাষা" },
                  { code: "hi" as LanguageCode, title: "हिन्दी", sub: "द्वितीय भाषा" },
                  { code: "en" as LanguageCode, title: "English", sub: "Supported" },
                ] as const
              ).map((item) => {
                const active = settings.language === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => onUpdateSettings({ language: item.code })}
                    className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors flex items-center justify-between gap-2 ${
                      active
                        ? "border-[var(--piya-accent)] bg-[var(--piya-accent-soft)] text-white"
                        : "border-slate-800 bg-[#050a16] text-slate-300 hover:text-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{item.title}</div>
                      <div className="text-[11px] text-slate-400 truncate">{item.sub}</div>
                    </div>
                    {active && (
                      <Check
                        className="w-4 h-4 shrink-0"
                        style={{ color: "var(--piya-accent-bright)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. Female-Only Voice Selection & Speed */}
          <section className="space-y-3 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {isBn
                    ? "৩. মেয়ের কণ্ঠস্বর ও গতি"
                    : isHi
                    ? "3. महिला आवाज़ और गति"
                    : "3. Female Voice & Speed"}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isBn
                    ? "সবগুলো কণ্ঠ ১০০% মেয়েদের মিষ্টি কণ্ঠস্বর"
                    : isHi
                    ? "सभी विकल्प १००% मधुर महिला आवाज़ें हैं"
                    : "All presets are 100% natural female voices"}
                </p>
              </div>
              <button
                type="button"
                onClick={onTestVoiceSample}
                className="min-h-[38px] px-3 rounded-lg border border-[var(--piya-border)] bg-[#050a16] text-xs font-medium text-slate-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{isBn ? "কণ্ঠ শুনুন" : isHi ? "आवाज़ सुनें" : "Test Voice"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {VOICE_OPTIONS.map((v) => {
                const active = settings.voiceName === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onUpdateSettings({ voiceName: v.id as VoiceOption })}
                    className={`min-h-[54px] px-3.5 py-2.5 rounded-xl border text-left transition-colors flex items-center justify-between gap-2 ${
                      active
                        ? "border-[var(--piya-accent)] bg-[var(--piya-accent-soft)]"
                        : "border-slate-800 bg-[#050a16] hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {isBn ? v.bnLabel : isHi ? v.hiLabel : v.enLabel}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {isBn ? v.bnDesc : isHi ? v.hiDesc : v.enDesc}
                      </div>
                    </div>
                    {active && (
                      <Check
                        className="w-4 h-4 shrink-0"
                        style={{ color: "var(--piya-accent-bright)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Super Fast Female Audio vs Studio Female Audio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onUpdateSettings({ preferNeuralTts: false })}
                className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors flex items-start justify-between gap-2 ${
                  !settings.preferNeuralTts
                    ? "border-[var(--piya-accent)] bg-[var(--piya-accent-soft)]"
                    : "border-slate-800 bg-[#050a16] hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" style={{ color: "var(--piya-accent-bright)" }} />
                    <span>
                      {isBn
                        ? "সুপার ফাস্ট ফিমেল ভয়েস"
                        : isHi
                        ? "सुपर फ़ास्ट महिला आवाज़"
                        : "Super Fast Female Voice"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {isBn
                      ? "তাৎক্ষণিক মেয়ের কণ্ঠে উত্তর দেবে"
                      : isHi
                      ? "तुरंत महिला आवाज़ में जवाब देगी"
                      : "Instant low-latency female response"}
                  </div>
                </div>
                {!settings.preferNeuralTts && (
                  <Check
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: "var(--piya-accent-bright)" }}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => onUpdateSettings({ preferNeuralTts: true })}
                className={`min-h-[54px] p-3 rounded-xl border text-left transition-colors flex items-start justify-between gap-2 ${
                  settings.preferNeuralTts
                    ? "border-[var(--piya-accent)] bg-[var(--piya-accent-soft)]"
                    : "border-slate-800 bg-[#050a16] hover:border-slate-700"
                }`}
              >
                <div>
                  <div className="text-xs font-semibold text-white">
                    {isBn
                      ? "স্টুডিও ফিমেল ভয়েস"
                      : isHi
                      ? "स्टूडियो महिला आवाज़"
                      : "Studio Female Voice"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {isBn
                      ? "স্টুডিও মেয়ের কণ্ঠস্বর"
                      : isHi
                      ? "स्टूडियो महिला आवाज़"
                      : "Expressive neural female timbre"}
                  </div>
                </div>
                {settings.preferNeuralTts && (
                  <Check
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: "var(--piya-accent-bright)" }}
                  />
                )}
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#050a16] p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">
                  {isBn ? "কথা বলার গতি" : isHi ? "बोलने की गति" : "Speech Speed"}
                </span>
                <span className="font-mono-tabular text-white font-semibold">
                  {settings.speechSpeed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.8}
                max={1.4}
                step={0.05}
                value={settings.speechSpeed}
                onChange={(e) => onUpdateSettings({ speechSpeed: Number(e.target.value) })}
                className="w-full accent-[var(--piya-accent)]"
              />
            </div>
          </section>

          {/* 4. Five Signature Themes */}
          <section className="space-y-2.5 pt-4 border-t border-slate-800/80">
            <h3 className="text-sm font-semibold text-white">
              {isBn ? "৪. থিম নির্বাচন" : isHi ? "4. थीम चुनें" : "4. Theme Selection"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.keys(PIYA_THEMES) as ThemeId[]).map((id) => {
                const t = PIYA_THEMES[id];
                const selected = settings.theme === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: id })}
                    className={`min-h-[52px] p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${
                      selected
                        ? "border-white/50 bg-[#0e1830]"
                        : "border-slate-800 bg-[#050a16] hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-5 h-5 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: t.accent }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">
                          {isBn ? t.bnName : isHi ? t.hiName : t.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">{t.name}</div>
                      </div>
                    </div>
                    {selected && <Check className="w-4 h-4 text-white shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 5. Microphone & Privacy Controls */}
          <section className="space-y-3 pt-4 border-t border-slate-800/80">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
              <span>
                {isBn
                  ? "৫. মাইক্রোফোন ও প্রাইভেসি সুরক্ষা"
                  : isHi
                  ? "5. माइक्रोफ़ोन और प्राइवेसी सुरक्षा"
                  : "5. Microphone & Privacy Safety"}
              </span>
            </h3>

            <p className="text-xs text-slate-400 leading-relaxed">
              {isBn
                ? "Always Active সুইচ OFF করলে মাইক্রোফোন লিসেনিং সাথে সাথে সম্পূর্ণ বন্ধ হয়। গোপনে কোনো অডিও রেকর্ড বা সার্ভারে পাঠানো হয় না।"
                : isHi
                ? "Always Active स्विच OFF करने पर माइक्रोफ़ोन तुरंत पूरी तरह बंद हो जाता है। कोई भी गुप्त रिकॉर्डिंग नहीं होती।"
                : "Turning OFF Always Active stops microphone access immediately. No hidden recording ever occurs."}
            </p>

            {micPermission !== "granted" && (
              <div className="rounded-xl border border-slate-800 bg-[#050a16] p-3.5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-300">
                  {isBn
                    ? "ভয়েস কথা বলার জন্য মাইক্রোফোন অনুমতি দিন"
                    : isHi
                    ? "आवाज़ में बात करने के लिए माइक्रोफ़ोन अनुमति दें"
                    : "Grant microphone permission for voice interaction"}
                </span>
                <button
                  type="button"
                  onClick={onRequestMicPermission}
                  className="min-h-[38px] px-3.5 rounded-lg bg-[var(--piya-accent)] text-[var(--piya-on-accent)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>
                    {isBn
                      ? "মাইক্রোফোন অনুমতি দিন"
                      : isHi
                      ? "माइक्रोफ़ोन अनुमति दें"
                      : "Allow Microphone"}
                  </span>
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onClearMemories}
                className="min-h-[40px] px-3.5 rounded-xl border border-slate-700 text-xs font-medium text-slate-200 hover:text-white whitespace-nowrap shrink-0"
              >
                {isBn
                  ? `সংরক্ষিত মেমোরি মুছুন (${memoriesCount})`
                  : isHi
                  ? `सेव की गई मेमोरी हटाएँ (${memoriesCount})`
                  : `Clear Saved Memories (${memoriesCount})`}
              </button>
              <button
                type="button"
                onClick={onResetAllData}
                className="min-h-[40px] px-3.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs font-semibold text-rose-200 hover:bg-rose-900/50 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {isBn ? "সব ডেটা মুছে ফেলুন" : isHi ? "सारा डेटा हटाएँ" : "Reset All Data"}
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
