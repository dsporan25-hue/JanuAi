package com.poran.piyaai;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Persistent storage for Janu AI Always Active Voice Assistant state,
 * synced configuration, and background conversation history queue.
 */
public final class JanuAlwaysActivePrefs {
    private static final String PREF_FILE = "janu_always_active_prefs";

    private static final String KEY_ENABLED = "always_active_enabled";
    private static final String KEY_LANGUAGE = "preferred_language";
    private static final String KEY_WAKE_WORD = "wake_word";
    private static final String KEY_SPEECH_SPEED = "speech_speed";
    private static final String KEY_VOICE_NAME = "voice_name";
    private static final String KEY_BACKEND_URL = "backend_url";
    private static final String KEY_CONTACTS_JSON = "contacts_json";
    private static final String KEY_MEMORIES_JSON = "memories_json";
    private static final String KEY_HISTORY_JSON = "history_json";
    private static final String KEY_BG_TURNS_QUEUE = "bg_turns_queue_json";

    public static final String DEFAULT_BACKEND_URL =
        "https://ais-pre-asnqfhdww664ezfv2ux5g7-331832155642.asia-southeast1.run.app";

    private JanuAlwaysActivePrefs() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE);
    }

    public static boolean isAlwaysActiveEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    public static void setAlwaysActiveEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    public static String getPreferredLanguage(Context context) {
        return prefs(context).getString(KEY_LANGUAGE, "bn");
    }

    public static String getWakeWord(Context context) {
        String raw = prefs(context).getString(KEY_WAKE_WORD, "Janu");
        return (raw == null || raw.trim().isEmpty()) ? "Janu" : raw.trim();
    }

    public static float getSpeechSpeed(Context context) {
        return prefs(context).getFloat(KEY_SPEECH_SPEED, 1.05f);
    }

    public static String getVoiceName(Context context) {
        return prefs(context).getString(KEY_VOICE_NAME, "Kore");
    }

    public static String getBackendUrl(Context context) {
        String raw = prefs(context).getString(KEY_BACKEND_URL, DEFAULT_BACKEND_URL);
        if (raw == null || raw.trim().isEmpty() || raw.contains("localhost")) {
            return DEFAULT_BACKEND_URL;
        }
        return raw.replaceAll("/+$", "");
    }

    public static String getContactsJson(Context context) {
        return prefs(context).getString(KEY_CONTACTS_JSON, "[]");
    }

    public static String getMemoriesJson(Context context) {
        return prefs(context).getString(KEY_MEMORIES_JSON, "[]");
    }

    public static String getHistoryJson(Context context) {
        return prefs(context).getString(KEY_HISTORY_JSON, "[]");
    }

    public static void syncContext(
        Context context,
        String language,
        String wakeWord,
        float speechSpeed,
        String voiceName,
        String backendUrl,
        String contactsJson,
        String memoriesJson,
        String historyJson
    ) {
        SharedPreferences.Editor ed = prefs(context).edit();
        if (language != null && !language.isEmpty()) {
            ed.putString(KEY_LANGUAGE, language);
        }
        if (wakeWord != null && !wakeWord.trim().isEmpty()) {
            ed.putString(KEY_WAKE_WORD, wakeWord.trim());
        }
        if (speechSpeed >= 0.7f && speechSpeed <= 1.6f) {
            ed.putFloat(KEY_SPEECH_SPEED, speechSpeed);
        }
        if (voiceName != null && !voiceName.isEmpty()) {
            ed.putString(KEY_VOICE_NAME, voiceName);
        }
        if (backendUrl != null && !backendUrl.trim().isEmpty() && !backendUrl.contains("localhost")) {
            ed.putString(KEY_BACKEND_URL, backendUrl.trim().replaceAll("/+$", ""));
        }
        if (contactsJson != null) {
            ed.putString(KEY_CONTACTS_JSON, contactsJson);
        }
        if (memoriesJson != null) {
            ed.putString(KEY_MEMORIES_JSON, memoriesJson);
        }
        if (historyJson != null) {
            ed.putString(KEY_HISTORY_JSON, historyJson);
        }
        ed.apply();
    }

    /**
     * Appends a background voice turn both to the rolling AI conversation history
     * AND to the pending WebView sync queue so Text Chat and Background Voice share one history.
     */
    public static synchronized void appendBackgroundTurn(
        Context context,
        JSONObject turnRecord
    ) {
        try {
            SharedPreferences sp = prefs(context);

            // 1. Update pending UI drain queue (capped at 50 items)
            JSONArray queue = new JSONArray(sp.getString(KEY_BG_TURNS_QUEUE, "[]"));
            queue.put(turnRecord);
            if (queue.length() > 50) {
                JSONArray trimmed = new JSONArray();
                for (int i = queue.length() - 50; i < queue.length(); i++) {
                    trimmed.put(queue.get(i));
                }
                queue = trimmed;
            }

            // 2. Also append to rolling 10-turn history for subsequent background AI calls
            JSONArray hist = new JSONArray(sp.getString(KEY_HISTORY_JSON, "[]"));
            JSONObject uMsg = new JSONObject();
            uMsg.put("role", "user");
            uMsg.put("text", turnRecord.optString("userText", ""));
            hist.put(uMsg);

            JSONObject aMsg = new JSONObject();
            aMsg.put("role", "assistant");
            aMsg.put("text", turnRecord.optString("assistantText", ""));
            hist.put(aMsg);

            JSONArray recentHist = new JSONArray();
            int startIdx = Math.max(0, hist.length() - 10);
            for (int i = startIdx; i < hist.length(); i++) {
                recentHist.put(hist.get(i));
            }

            sp.edit()
                .putString(KEY_BG_TURNS_QUEUE, queue.toString())
                .putString(KEY_HISTORY_JSON, recentHist.toString())
                .apply();
        } catch (Exception ignored) {
        }
    }

    public static synchronized String drainBackgroundTurnsJson(Context context) {
        SharedPreferences sp = prefs(context);
        String raw = sp.getString(KEY_BG_TURNS_QUEUE, "[]");
        sp.edit().putString(KEY_BG_TURNS_QUEUE, "[]").apply();
        return raw;
    }
}
