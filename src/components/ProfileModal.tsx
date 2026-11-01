import React, { useState } from "react";
import { LogOut, Trash2, User, X } from "lucide-react";
import type { UserProfile } from "../types/piya";
import { OFFICIAL_PIYA_CHARACTER_IMAGE } from "./PiyaCharacter3D";

interface ProfileModalProps {
  open: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSaveProfile: (next: UserProfile) => void;
  onLogoutSession: () => void;
  onDeleteAllUserData: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  open,
  profile,
  onClose,
  onSaveProfile,
  onLogoutSession,
  onDeleteAllUserData,
}) => {
  const [nameInput, setNameInput] = useState(profile.displayName);
  const [emailInput, setEmailInput] = useState(profile.email);
  const [confirmWipe, setConfirmWipe] = useState(false);

  if (!open) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      displayName: nameInput.trim() || "Guest User",
      email: emailInput.trim(),
      signedIn: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-3xl border border-[var(--piya-border)] bg-[#080f20] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-display text-lg font-bold text-white">Profile & Identity</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white"
            aria-label="Close Profile"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Assistant Identity Card */}
          <div className="rounded-2xl border border-slate-800 bg-[#050a16] p-4 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[var(--piya-border)] bg-[#02050d] shrink-0">
              <img
                src={OFFICIAL_PIYA_CHARACTER_IMAGE}
                alt="Janu AI Official Character"
                className="w-full h-full object-cover object-[50%_16%]"
              />
            </div>
            <div>
              <div className="font-display text-base font-bold text-white">Janu AI</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Personal AI Voice Assistant · Developer: <span className="text-slate-200">Poran</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Android Capacitor + Online Gemini Brain
              </div>
            </div>
          </div>

          {/* User Profile Form */}
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Your Name</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Enter your name (e.g., Poran)"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#050a16] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Optional Account Email
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="name@example.com"
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#050a16] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[46px] rounded-xl bg-[var(--piya-accent)] text-[var(--piya-on-accent)] text-xs font-semibold flex items-center justify-center gap-2"
            >
              <User className="w-4 h-4" />
              <span>{profile.signedIn ? "Save Profile" : "Sign In Locally"}</span>
            </button>
          </form>

          {/* Session Logout & Full Data Deletion */}
          <div className="pt-4 border-t border-slate-800 space-y-2.5">
            {profile.signedIn && (
              <button
                type="button"
                onClick={() => {
                  onLogoutSession();
                  onClose();
                }}
                className="w-full min-h-[44px] rounded-xl border border-slate-700 text-xs font-medium text-slate-200 hover:text-white flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout Session</span>
              </button>
            )}

            {!confirmWipe ? (
              <button
                type="button"
                onClick={() => setConfirmWipe(true)}
                className="w-full min-h-[44px] rounded-xl border border-rose-500/30 bg-rose-950/30 text-xs font-medium text-rose-300 hover:text-white flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete All Personal Data & History</span>
              </button>
            ) : (
              <div className="rounded-xl border border-rose-500/50 bg-rose-950/60 p-3 space-y-2">
                <p className="text-xs text-rose-200">
                  Permanently erase saved memories, conversation history, notes, alarms, and custom
                  contacts?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteAllUserData();
                      setConfirmWipe(false);
                      onClose();
                    }}
                    className="flex-1 min-h-[38px] rounded-lg bg-rose-600 text-white text-xs font-semibold"
                  >
                    Yes, Erase Everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmWipe(false)}
                    className="min-h-[38px] px-3 rounded-lg border border-slate-600 text-xs text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
