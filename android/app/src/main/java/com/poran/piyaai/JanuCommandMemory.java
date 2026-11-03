package com.poran.piyaai;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** কমান্ড ও কনটেক্সট মনে রাখার সিস্টেম (ফোনে সেভ থাকে, অ্যাপ বন্ধ হলেও হারায় না)। */
public class JanuCommandMemory {
    private static final String PREFS = "janu_command_memory";
    private static final int MAX = 100;

    private static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized void record(Context c, String command, String result) {
        try {
            JSONArray old = new JSONArray(sp(c).getString("history", "[]"));
            JSONArray arr = new JSONArray();
            int start = Math.max(0, old.length() - (MAX - 1));
            for (int i = start; i < old.length(); i++) arr.put(old.get(i));
            JSONObject o = new JSONObject();
            o.put("command", command);
            o.put("result", result);
            o.put("time", System.currentTimeMillis());
            o.put("app", getCurrentApp(c));
            arr.put(o);
            sp(c).edit().putString("history", arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static String getHistoryJson(Context c) {
        return sp(c).getString("history", "[]");
    }

    public static void clear(Context c) {
        sp(c).edit().remove("history").apply();
    }

    /** এখন কোন অ্যাপে আছি (যেমন com.google.android.youtube) */
    public static void setCurrentApp(Context c, String pkg) {
        sp(c).edit().putString("current_app", pkg).apply();
    }

    public static String getCurrentApp(Context c) {
        return sp(c).getString("current_app", "");
    }

    public static void setLastQuery(Context c, String q) {
        sp(c).edit().putString("last_query", q).apply();
    }

    public static String getLastQuery(Context c) {
        return sp(c).getString("last_query", "");
    }
}
