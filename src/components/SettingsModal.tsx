import React from "react";
import {
  Check,
  Mic,
  Shield,
  Trash2,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import type {
  AppSettings,
  LanguageCode,
  ThemeId,
  VoiceOption,
} from "../types/piya";
import type { MicPermissionState } from "../services/voiceEngine";
import { PIYA_THEMES, VOICE_OPTIONS } from "../constants/themesAndCopy";

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  micPermission: MicPermissionState;
  memoriesCount: number;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onRequestMicPermission: () => void;
  onTestVoiceSample: () => void;
  onClearMemories: () => void;
  onResetAllData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  micPermission,
  memoriesCount,
  onClose,
  onUpdateSettings,
  onRequestMicPermission,
  onTestVoiceSample,
  onClearMemories,
  onResetAllData,
}) => {
  if (!open) return null;

  const isBn = settings.language === "bn";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-3xl border border-[var(--piya-border)] bg-[#080f20] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              {isBn ? "জানু এআই সেটিংস" : "जानू एआई सेटिंग्स"}
            </h2>
            <p className="text-xs text-slate-400">
              {isBn ? "ভাষা · ভয়েস স্পিড · থিম · প্রাইভেসি" : "भाषा · वॉयस स्पीड · थीम · प्राइवेसी"}
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
          {/* 1. Language Selection */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-white">
              {isBn ? "১. ভাষা নির্বাচন" : "1. भाषा चुनें"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { code: "bn" as LanguageCode, title: "বাংলা", sub: "প্রধান ভাষা" },
                  { code: "hi" as LanguageCode, title: "हिन्दी", sub: "द्वितीय भाषा" },
                ] as const
              ).map((item) => {
                const active = settings.language === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => onUpdateSettings({ language: item.code })}
                    className={`min-h-[54px] p-3.5 rounded-xl border text-left transition-colors flex items-center justify-between ${
                      active
                        ? "border-[var(--piya-accent)] bg-[var(--piya-accent-soft)] text-white"
                        : "border-slate-800 bg-[#050a16] text-slate-300 hover:text-white"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">{item.title}</div>
                      <div className="text-[11px] text-slate-400">{item.sub}</div>
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

          {/* 2. Female-Only Voice Selection & Speed */}
          <section className="space-y-3 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {isBn ? "২. মেয়ের কণ্ঠস্বর ও গতি" : "2. महिला आवाज़ और गति"}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isBn
                    ? "সবগুলো কণ্ঠ ১০০% মেয়েদের মিষ্টি কণ্ঠস্বর"
                    : "सभी विकल्प १००% मधुर महिला आवाज़ें हैं"}
                </p>
              </div>
              <button
                type="button"
                onClick={onTestVoiceSample}
                className="min-h-[38px] px-3 rounded-lg border border-[var(--piya-border)] bg-[#050a16] text-xs font-medium text-slate-200 hover:text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{isBn ? "কণ্ঠ শুনুন" : "आवाज़ सुनें"}</span>
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
                        {isBn ? v.bnLabel : v.hiLabel}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {isBn ? v.bnDesc : v.hiDesc}
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
                    <span>{isBn ? "সুপার ফাস্ট ফিমেল ভয়েস" : "सुपर फ़ास्ट महिला आवाज़"}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {isBn ? "তাৎক্ষণিক মেয়ের কণ্ঠে উত্তর দেবে" : "तुरंत महिला आवाज़ में जवाब देगी"}
                  </div>
                </div>
                {!settings.preferNeuralTts && (
                  <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--piya-accent-bright)" }} />
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
                    {isBn ? "স্টুডিও ফিমেল ভয়েস" : "स्टूडियो महिला आवाज़"}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {isBn ? "স্টুডিও মেয়ের কণ্ঠস্বর" : "स्टूडियो महिला आवाज़"}
                  </div>
                </div>
                {settings.preferNeuralTts && (
                  <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--piya-accent-bright)" }} />
                )}
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#050a16] p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">
                  {isBn ? "কথা বলার গতি" : "बोलने की गति"}
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

          {/* 3. Five Signature Themes */}
          <section className="space-y-2.5 pt-4 border-t border-slate-800/80">
            <h3 className="text-sm font-semibold text-white">
              {isBn ? "৩. থিম নির্বাচন" : "3. थीम चुनें"}
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
                          {isBn ? t.bnName : t.hiName}
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

          {/* 4. Microphone & Privacy Controls */}
          <section className="space-y-3 pt-4 border-t border-slate-800/80">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
              <span>{isBn ? "৪. মাইক্রোফোন ও প্রাইভেসি" : "4. माइक्रोफ़ोन और प्राइवेसी"}</span>
            </h3>

            {micPermission !== "granted" && (
              <div className="rounded-xl border border-slate-800 bg-[#050a16] p-3.5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-slate-300">
                  {isBn ? "ভয়েস কথা বলার জন্য মাইক্রোফোন চালু করুন" : "आवाज़ में बात करने के लिए माइक्रोफ़ोन चालू करें"}
                </span>
                <button
                  type="button"
                  onClick={onRequestMicPermission}
                  className="min-h-[38px] px-3.5 rounded-lg bg-[var(--piya-accent)] text-[var(--piya-on-accent)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>{isBn ? "মাইক্রোফোন অনুমতি দিন" : "माइक्रोफ़ोन अनुमति दें"}</span>
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
                  : `सेव की गई मेमोरी हटाएँ (${memoriesCount})`}
              </button>
              <button
                type="button"
                onClick={onResetAllData}
                className="min-h-[40px] px-3.5 rounded-xl border border-rose-500/40 bg-rose-950/40 text-xs font-semibold text-rose-200 hover:bg-rose-900/50 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isBn ? "সব ডেটা মুছে ফেলুন" : "सारा डेटा हटाएँ"}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
