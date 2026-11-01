import React, { useState } from "react";
import {
  AlarmClock,
  BatteryCharging,
  Bluetooth,
  ExternalLink,
  FileText,
  Flashlight,
  Lock,
  Music,
  Phone,
  Plus,
  Search,
  Settings,
  Smartphone,
  Trash2,
  UserPlus,
  Wifi,
  Youtube,
} from "lucide-react";
import type { AlarmItem, BatteryInfo, ContactItem, LanguageCode, NoteItem } from "../types/piya";
import {
  buildYouTubeSearchUrl,
  isNativeAndroidRuntime,
  pickNativeAndroidContacts,
  resolveAppLaunchTarget,
} from "../services/androidBridge";

interface PhoneActionsPanelProps {
  language: LanguageCode;
  contacts: ContactItem[];
  notes: NoteItem[];
  alarms: AlarmItem[];
  battery: BatteryInfo;
  flashlightOn: boolean;
  statusToast: string | null;
  onAddContact: (contact: Omit<ContactItem, "id">) => void;
  onImportContacts: (imported: ContactItem[]) => void;
  onDeleteContact: (id: string) => void;
  onRequestCallByQuery: (name: string) => void;
  onAddNote: (title: string, content: string) => void;
  onDeleteNote: (id: string) => void;
  onAddAlarm: (hour: number, minute: number, label: string) => void;
  onToggleAlarm: (id: string) => void;
  onDeleteAlarm: (id: string) => void;
  onRefreshBattery: () => void;
  onToggleFlashlight: () => void;
  onOpenSettingsSection: (section: "wifi" | "bluetooth" | "phone_settings" | "device_admin") => void;
  onRequestPhoneLock: () => void;
  onReportStatus: (msg: string) => void;
}

const SUPPORTED_APPS = [
  "YouTube",
  "YouTube Music",
  "WhatsApp",
  "Spotify",
  "Chrome",
  "Google Maps",
  "Gmail",
  "Instagram",
];

export const PhoneActionsPanel: React.FC<PhoneActionsPanelProps> = ({
  contacts,
  notes,
  alarms,
  battery,
  flashlightOn,
  statusToast,
  onAddContact,
  onImportContacts,
  onDeleteContact,
  onRequestCallByQuery,
  onAddNote,
  onDeleteNote,
  onAddAlarm,
  onToggleAlarm,
  onDeleteAlarm,
  onRefreshBattery,
  onToggleFlashlight,
  onOpenSettingsSection,
  onRequestPhoneLock,
  onReportStatus,
}) => {
  const [ytQuery, setYtQuery] = useState("Arijit Singh Bengali & Hindi Songs");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactLabel, setNewContactLabel] = useState("Personal");

  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");

  const [alarmTime, setAlarmTime] = useState("07:30");
  const [alarmLabel, setAlarmLabel] = useState("Morning Wakeup");

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    onAddContact({
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
      label: newContactLabel.trim() || "Saved",
    });
    setNewContactName("");
    setNewContactPhone("");
  };

  const handleDeviceContactImport = async () => {
    const res = await pickNativeAndroidContacts();
    if (!res.supported || res.error) {
      onReportStatus(res.error || "Contact picker unavailable.");
      return;
    }
    if (res.contacts.length > 0) {
      onImportContacts(res.contacts);
      onReportStatus(`Imported ${res.contacts.length} contact(s) from device.`);
    }
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() && !noteBody.trim()) return;
    onAddNote(noteTitle.trim() || "Quick Note", noteBody.trim());
    setNoteTitle("");
    setNoteBody("");
  };

  const handleCreateAlarm = (e: React.FormEvent) => {
    e.preventDefault();
    const [hStr, mStr] = alarmTime.split(":");
    const hour = Number(hStr);
    const minute = Number(mStr);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return;
    onAddAlarm(hour, minute, alarmLabel.trim() || "Janu AI Alarm");
  };

  const nativeMode = isNativeAndroidRuntime();

  return (
    <div className="space-y-8">
      {/* Feedback Banner */}
      {statusToast && (
        <div className="rounded-xl border border-[var(--piya-border)] bg-[var(--piya-surface-elevated)] px-4 py-3 text-xs text-slate-200">
          {statusToast}
        </div>
      )}

      {/* Row 1: Hardware & Android System Controls + YouTube Search */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hardware & Settings Card */}
        <section className="rounded-2xl border border-[var(--piya-border)] bg-[var(--piya-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Device & System Controls
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {nativeMode
                  ? "Connected to Capacitor Android Native Bridge"
                  : "Web & Android Intent Mode · Install APK for full OS settings & lock"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={onRefreshBattery}
              className="min-h-[64px] p-3 rounded-xl border border-slate-800 bg-[#070d1b] hover:border-[var(--piya-accent)] text-left transition-colors"
            >
              <div className="flex items-center justify-between text-slate-300">
                <BatteryCharging className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
                <span className="font-mono-tabular text-xs font-semibold text-white">
                  {battery.level !== null ? `${battery.level}%` : "Read"}
                </span>
              </div>
              <div className="text-xs font-medium text-slate-200 mt-2 whitespace-nowrap truncate">
                Battery Status
              </div>
            </button>

            <button
              type="button"
              onClick={onToggleFlashlight}
              className={`min-h-[64px] p-3 rounded-xl border text-left transition-colors ${
                flashlightOn
                  ? "border-[var(--piya-accent)] bg-[var(--piya-accent-soft)]"
                  : "border-slate-800 bg-[#070d1b] hover:border-[var(--piya-accent)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <Flashlight className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
                <span className="text-[11px] text-slate-300">{flashlightOn ? "ON" : "OFF"}</span>
              </div>
              <div className="text-xs font-medium text-slate-200 mt-2 whitespace-nowrap truncate">
                Flashlight
              </div>
            </button>

            <button
              type="button"
              onClick={() => onOpenSettingsSection("wifi")}
              className="min-h-[64px] p-3 rounded-xl border border-slate-800 bg-[#070d1b] hover:border-[var(--piya-accent)] text-left transition-colors"
            >
              <Wifi className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
              <div className="text-xs font-medium text-slate-200 mt-2 whitespace-nowrap truncate">
                Wi-Fi Settings
              </div>
            </button>

            <button
              type="button"
              onClick={() => onOpenSettingsSection("bluetooth")}
              className="min-h-[64px] p-3 rounded-xl border border-slate-800 bg-[#070d1b] hover:border-[var(--piya-accent)] text-left transition-colors"
            >
              <Bluetooth className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
              <div className="text-xs font-medium text-slate-200 mt-2 whitespace-nowrap truncate">
                Bluetooth
              </div>
            </button>

            <button
              type="button"
              onClick={() => onOpenSettingsSection("phone_settings")}
              className="min-h-[64px] p-3 rounded-xl border border-slate-800 bg-[#070d1b] hover:border-[var(--piya-accent)] text-left transition-colors"
            >
              <Settings className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
              <div className="text-xs font-medium text-slate-200 mt-2 whitespace-nowrap truncate">
                Phone Settings
              </div>
            </button>

            <button
              type="button"
              onClick={onRequestPhoneLock}
              className="min-h-[64px] p-3 rounded-xl border border-slate-800 bg-[#070d1b] hover:border-[var(--piya-accent)] text-left transition-colors"
            >
              <Lock className="w-4 h-4 text-amber-400" />
              <div className="text-xs font-medium text-slate-200 mt-2 whitespace-nowrap truncate">
                Lock Phone
              </div>
            </button>
          </div>
        </section>

        {/* YouTube, YouTube Music & Installed Apps Launcher */}
        <section className="rounded-2xl border border-[var(--piya-border)] bg-[var(--piya-surface)] p-5 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              YouTube & Installed Apps
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Search songs and videos or launch supported Android intents
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ytQuery}
                onChange={(e) => setYtQuery(e.target.value)}
                placeholder="Search song, artist, or video..."
                className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={buildYouTubeSearchUrl(ytQuery || "music", "youtube")}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-3.5 rounded-xl bg-[var(--piya-accent)] text-[var(--piya-on-accent)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Youtube className="w-4 h-4" />
                <span>Search YouTube</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={buildYouTubeSearchUrl(ytQuery || "music", "youtube_music")}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-3.5 rounded-xl border border-[var(--piya-border)] bg-[#070d1b] text-slate-200 hover:text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Music className="w-4 h-4" />
                <span>YouTube Music</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <div className="text-xs font-medium text-slate-400 mb-2">Open Installed Apps</div>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_APPS.map((appLabel) => {
                const target = resolveAppLaunchTarget(appLabel);
                return (
                  <a
                    key={appLabel}
                    href={target.href}
                    target={target.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-3 rounded-lg border border-slate-800 bg-[#070d1b] hover:border-[var(--piya-accent)] text-xs text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{appLabel}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Row 2: Contacts Directory (with Multi-Name Disambiguation & Last-4-Digit Support) */}
      <section className="rounded-2xl border border-[var(--piya-border)] bg-[var(--piya-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Saved Contacts & Confirmed Calling
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Test calling &ldquo;Poran&rdquo; for direct confirmation or &ldquo;Rahim&rdquo; for multi-contact last-4-digit selection
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRequestCallByQuery("Rahim")}
              className="min-h-[44px] px-3.5 rounded-xl border border-[var(--piya-border)] bg-[#070d1b] text-xs font-medium text-slate-200 hover:text-white whitespace-nowrap shrink-0"
            >
              Test Ambiguous &ldquo;Call Rahim&rdquo;
            </button>
            <button
              type="button"
              onClick={handleDeviceContactImport}
              className="min-h-[44px] px-3.5 rounded-xl bg-[var(--piya-accent-soft)] border border-[var(--piya-border)] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Import Android Contacts</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {contacts.map((c) => {
            const last4 = c.phone.replace(/\D/g, "").slice(-4);
            return (
              <div
                key={c.id}
                className="rounded-xl border border-slate-800 bg-[#070d1b] p-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{c.name}</div>
                  <div className="text-xs text-slate-400 font-mono-tabular mt-0.5">
                    {c.phone} · {c.label} · #{last4}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRequestCallByQuery(c.name)}
                    className="min-h-[40px] min-w-[40px] rounded-lg bg-[var(--piya-accent-soft)] text-white hover:bg-[var(--piya-accent)] hover:text-[var(--piya-on-accent)] flex items-center justify-center transition-colors"
                    aria-label={`Call ${c.name} with confirmation`}
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteContact(c.id)}
                    className="min-h-[40px] min-w-[40px] rounded-lg text-slate-400 hover:text-rose-400 flex items-center justify-center transition-colors"
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={handleCreateContact} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2">
          <input
            type="text"
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
            placeholder="Contact Name"
            className="min-h-[44px] px-3.5 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
          />
          <input
            type="tel"
            value={newContactPhone}
            onChange={(e) => setNewContactPhone(e.target.value)}
            placeholder="Phone (+880 / +91...)"
            className="min-h-[44px] px-3.5 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white font-mono-tabular focus:outline-none focus:border-[var(--piya-accent)]"
          />
          <input
            type="text"
            value={newContactLabel}
            onChange={(e) => setNewContactLabel(e.target.value)}
            placeholder="Label (Family, Work)"
            className="min-h-[44px] px-3.5 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
          />
          <button
            type="submit"
            className="min-h-[44px] px-4 rounded-xl bg-[var(--piya-accent)] text-[var(--piya-on-accent)] text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </form>
      </section>

      {/* Row 3: Alarms & Personal Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alarms */}
        <section className="rounded-2xl border border-[var(--piya-border)] bg-[var(--piya-surface)] p-5 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Alarms</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Triggers Android AlarmClock intent on APK + live in-app audio chime
            </p>
          </div>

          <form onSubmit={handleCreateAlarm} className="flex flex-wrap items-center gap-2.5">
            <input
              type="time"
              value={alarmTime}
              onChange={(e) => setAlarmTime(e.target.value)}
              className="min-h-[44px] px-3 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white font-mono-tabular focus:outline-none focus:border-[var(--piya-accent)]"
            />
            <input
              type="text"
              value={alarmLabel}
              onChange={(e) => setAlarmLabel(e.target.value)}
              placeholder="Alarm Label"
              className="flex-1 min-w-[140px] min-h-[44px] px-3.5 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
            />
            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-xl bg-[var(--piya-accent)] text-[var(--piya-on-accent)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <AlarmClock className="w-4 h-4" />
              <span>Set Alarm</span>
            </button>
          </form>

          <div className="space-y-2">
            {alarms.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">No alarms scheduled.</p>
            ) : (
              alarms.map((al) => (
                <div
                  key={al.id}
                  className="rounded-xl border border-slate-800 bg-[#070d1b] px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-mono-tabular text-base font-semibold text-white">
                      {String(al.hour).padStart(2, "0")}:{String(al.minute).padStart(2, "0")}
                    </div>
                    <div className="text-xs text-slate-400">{al.label}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleAlarm(al.id)}
                      className={`min-h-[38px] px-3 rounded-lg text-xs font-medium ${
                        al.enabled
                          ? "bg-[var(--piya-accent)] text-[var(--piya-on-accent)]"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {al.enabled ? "Active" : "Paused"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAlarm(al.id)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-rose-400"
                      aria-label="Delete Alarm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Notes */}
        <section className="rounded-2xl border border-[var(--piya-border)] bg-[var(--piya-surface)] p-5 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Personal Notes</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Created by voice command or manual entry
            </p>
          </div>

          <form onSubmit={handleCreateNote} className="space-y-2.5">
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title..."
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Write note content in Bengali, Hindi, or English..."
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-xl bg-[var(--piya-accent)] text-[var(--piya-on-accent)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <FileText className="w-4 h-4" />
                <span>Save Note</span>
              </button>
            </div>
          </form>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {notes.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">No saved notes yet.</p>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-slate-800 bg-[#070d1b] p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">{n.title}</div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{n.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(n.id)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-400 shrink-0"
                    aria-label="Delete Note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
