import React, { useState } from "react";
import { Brain, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { ChatMessage, MemoryItem } from "../types/piya";

interface MemoryVaultPanelProps {
  memories: MemoryItem[];
  messages: ChatMessage[];
  memoryEnabled: boolean;
  autoConfirmMemory: boolean;
  onToggleMemoryEnabled: (enabled: boolean) => void;
  onToggleAutoConfirmMemory: (auto: boolean) => void;
  onAddMemory: (category: string, fact: string) => void;
  onDeleteMemory: (id: string) => void;
  onClearAllMemories: () => void;
  onClearHistory: () => void;
}

export const MemoryVaultPanel: React.FC<MemoryVaultPanelProps> = ({
  memories,
  messages,
  memoryEnabled,
  autoConfirmMemory,
  onToggleMemoryEnabled,
  onToggleAutoConfirmMemory,
  onAddMemory,
  onDeleteMemory,
  onClearAllMemories,
  onClearHistory,
}) => {
  const [category, setCategory] = useState("Preference");
  const [fact, setFact] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fact.trim()) return;
    onAddMemory(category, fact.trim());
    setFact("");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--piya-border)] bg-[var(--piya-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <Brain className="w-5 h-5" style={{ color: "var(--piya-accent-bright)" }} />
              <span>Approved User Memory Vault</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Janu AI only uses preferences explicitly saved below. She never pretends to remember
              facts that have not been approved and stored here.
            </p>
          </div>

          {memories.length > 0 && (
            <button
              type="button"
              onClick={onClearAllMemories}
              className="min-h-[42px] px-3.5 rounded-xl border border-rose-500/30 bg-rose-950/30 text-xs font-medium text-rose-300 hover:text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete All Memories</span>
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={() => onToggleMemoryEnabled(!memoryEnabled)}
            className="min-h-[54px] px-4 py-3 rounded-xl border border-slate-800 bg-[#070d1b] flex items-center justify-between gap-3 text-left"
          >
            <div>
              <div className="text-xs font-semibold text-white">Memory Context Active</div>
              <div className="text-[11px] text-slate-400">
                Include saved preferences during Gemini conversations
              </div>
            </div>
            <span
              className={`text-xs font-semibold ${
                memoryEnabled ? "text-emerald-400" : "text-slate-500"
              }`}
            >
              {memoryEnabled ? "Enabled" : "Paused"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onToggleAutoConfirmMemory(!autoConfirmMemory)}
            className="min-h-[54px] px-4 py-3 rounded-xl border border-slate-800 bg-[#070d1b] flex items-center justify-between gap-3 text-left"
          >
            <div>
              <div className="text-xs font-semibold text-white">Ask Approval Before Saving</div>
              <div className="text-[11px] text-slate-400">
                Prompt confirmation when Janu AI detects a new preference
              </div>
            </div>
            <span
              className={`text-xs font-semibold ${
                !autoConfirmMemory ? "text-emerald-400" : "text-amber-300"
              }`}
            >
              {!autoConfirmMemory ? "Ask First" : "Auto-Save"}
            </span>
          </button>
        </div>

        {/* Manual Add Form */}
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2.5 pt-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="min-h-[44px] px-3 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
          >
            <option value="Preference">Preference</option>
            <option value="Profile">Profile</option>
            <option value="Music">Music</option>
            <option value="Language">Language</option>
            <option value="Routine">Routine</option>
          </select>
          <input
            type="text"
            value={fact}
            onChange={(e) => setFact(e.target.value)}
            placeholder="Add an approved preference (e.g., My favorite singer is Shreya Ghoshal)..."
            className="flex-1 min-w-[220px] min-h-[44px] px-3.5 rounded-xl bg-[#070d1b] border border-slate-800 text-xs text-white focus:outline-none focus:border-[var(--piya-accent)]"
          />
          <button
            type="submit"
            className="min-h-[44px] px-4 rounded-xl bg-[var(--piya-accent)] text-[var(--piya-on-accent)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Save Preference</span>
          </button>
        </form>

        {/* Saved Items */}
        <div className="space-y-2.5 pt-2">
          {memories.length === 0 ? (
            <div className="rounded-xl border border-slate-800/80 bg-[#070d1b] p-6 text-center text-xs text-slate-400">
              No saved preferences yet. Tell Janu AI &ldquo;মনে রাখো...&rdquo; or &ldquo;याद रखो...&rdquo; or add one above.
            </div>
          ) : (
            memories.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-slate-800 bg-[#070d1b] p-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-400">
                    <span style={{ color: "var(--piya-accent-bright)" }}>{m.category}</span>
                    <span className="mx-1.5">·</span>
                    <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="text-sm text-slate-100 mt-0.5">{m.fact}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteMemory(m.id)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 shrink-0"
                  aria-label="Delete memory"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Conversation History Review */}
      <section className="rounded-2xl border border-[var(--piya-border)] bg-[var(--piya-surface)] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: "var(--piya-accent-bright)" }} />
              <span>Stored Conversation History ({messages.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Stored locally on your device for conversational continuity.
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="min-h-[40px] px-3.5 rounded-xl border border-slate-700 text-xs text-slate-300 hover:text-rose-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">Conversation history is empty.</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-xl border border-slate-800 bg-[#070d1b] px-3.5 py-2.5 text-xs"
              >
                <div className="text-slate-400 mb-1">
                  <span className="font-semibold text-slate-200">
                    {msg.role === "user" ? "User" : "Janu AI"}
                  </span>
                  <span className="mx-1.5">·</span>
                  <span>{msg.language === "bn" ? "বাংলা" : "हिन्दी"}</span>
                </div>
                <p className="text-slate-200 leading-relaxed">{msg.text}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
