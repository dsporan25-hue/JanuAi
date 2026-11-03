package com.poran.piyaai;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;

/** কমান্ড অনুযায়ী কাজ চালায়: অ্যাপ খোলা, ইউটিউব সার্চ, হোয়াটসঅ্যাপ মেসেজ ইত্যাদি। */
public class JanuActionRunner {
    private static final Handler H = new Handler(Looper.getMainLooper());

    public static String pkgFor(String app) {
        String a = app == null ? "" : app.toLowerCase().trim();
        if (a.contains("youtube") || a.contains("ইউটিউব")) return "com.google.android.youtube";
        if (a.contains("whatsapp") || a.contains("হোয়াটসঅ্যাপ")) return "com.whatsapp";
        if (a.contains("facebook") || a.contains("ফেসবুক")) return "com.facebook.katana";
        if (a.contains("messenger") || a.contains("মেসেঞ্জার")) return "com.facebook.orca";
        if (a.contains("chrome") || a.contains("ক্রোম")) return "com.android.chrome";
        if (a.contains("camera") || a.contains("ক্যামেরা")) return "com.android.camera";
        if (a.contains("gmail") || a.contains("জিমেইল")) return "com.google.android.gm";
        if (a.contains("maps") || a.contains("ম্যাপ")) return "com.google.android.apps.maps";
        if (a.contains("telegram") || a.contains("টেলিগ্রাম")) return "org.telegram.messenger";
        if (a.contains("instagram") || a.contains("ইনস্টাগ্রাম")) return "com.instagram.android";
        return a.contains(".") ? a : "";
    }

    public static String run(Context ctx, JSONObject cmd) {
        String action = cmd.optString("action", "");
        String result;
        try {
            switch (action) {
                case "open_app":
                    result = openApp(ctx, cmd.optString("app"));
                    break;
                case "youtube_search":
                    result = youtubeSearch(ctx, cmd.optString("query"));
                    break;
                case "youtube_play_first":
                    result = clickText("ভিডিও", "video");
                    break;
                case "whatsapp_message":
                    result = whatsappMessage(ctx, cmd.optString("contact"), cmd.optString("message"));
                    break;
                case "click_text":
                    result = clickText(cmd.optString("text"), "");
                    break;
                case "type_text":
                    result = typeText(cmd.optString("text"));
                    break;
                case "back":
                    result = need() != null && need().goBack() ? "পিছনে গেছি" : needMsg();
                    break;
                case "home":
                    result = need() != null && need().goHome() ? "হোমে গেছি" : needMsg();
                    break;
                case "scroll":
                    result = need() != null && need().scrollDown() ? "স্ক্রল করেছি" : needMsg();
                    break;
                default:
                    result = "এই কাজটা আমি বুঝতে পারিনি: " + action;
            }
        } catch (Exception e) {
            result = "সমস্যা হয়েছে: " + e.getMessage();
        }
        JanuCommandMemory.record(ctx, cmd.toString(), result);
        return result;
    }

    private static JanuAccessibilityService need() { return JanuAccessibilityService.get(); }
    private static String needMsg() {
        return "Accessibility চালু নেই। সেটিংস > Accessibility > Janu AI চালু করুন।";
    }

    private static String openApp(Context ctx, String app) {
        String pkg = pkgFor(app);
        if (pkg.isEmpty()) return "অ্যাপটা চিনতে পারিনি: " + app;
        PackageManager pm = ctx.getPackageManager();
        Intent i = pm.getLaunchIntentForPackage(pkg);
        if (i == null) return "অ্যাপটা ফোনে ইনস্টল নেই: " + app;
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        ctx.startActivity(i);
        JanuCommandMemory.setCurrentApp(ctx, pkg);
        return app + " খুলে দিয়েছি।";
    }

    private static String youtubeSearch(Context ctx, String q) {
        if (q == null || q.trim().isEmpty()) return "কী খুঁজব বলুন।";
        JanuCommandMemory.setLastQuery(ctx, q);
        Intent i = new Intent(Intent.ACTION_SEARCH);
        i.setPackage("com.google.android.youtube");
        i.putExtra("query", q);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
        } catch (Exception e) {
            Intent web = new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://www.youtube.com/results?search_query=" + Uri.encode(q)));
            web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(web);
        }
        JanuCommandMemory.setCurrentApp(ctx, "com.google.android.youtube");
        return "ইউটিউবে \"" + q + "\" খুঁজছি।";
    }

    private static String clickText(String a, String b) {
        JanuAccessibilityService s = need();
        if (s == null) return needMsg();
        if (s.clickByText(a) || (!b.isEmpty() && s.clickByText(b))) return "ক্লিক করেছি: " + a;
        return "স্ক্রিনে \"" + a + "\" পাইনি।";
    }

    private static String typeText(String t) {
        JanuAccessibilityService s = need();
        if (s == null) return needMsg();
        return s.typeText(t) ? "লিখে দিয়েছি।" : "লেখার জায়গা পাইনি।";
    }

    /** হোয়াটসঅ্যাপ খুলে নাম সার্চ করে মেসেজ লিখে পাঠায় (ধাপে ধাপে, দেরি দিয়ে)। */
    private static String whatsappMessage(final Context ctx, final String contact, final String message) {
        final JanuAccessibilityService s = need();
        if (s == null) return needMsg();
        if (contact == null || contact.trim().isEmpty()) return "কাকে মেসেজ দেব বলুন।";
        String r = openApp(ctx, "whatsapp");
        if (!r.contains("খুলে")) return r;
        H.postDelayed(() -> { JanuAccessibilityService x = need(); if (x != null) { x.clickByText("Search"); x.clickByText("সার্চ"); } }, 2500);
        H.postDelayed(() -> { JanuAccessibilityService x = need(); if (x != null) x.typeText(contact); }, 3600);
        H.postDelayed(() -> { JanuAccessibilityService x = need(); if (x != null) x.clickByText(contact); }, 5000);
        if (message != null && !message.trim().isEmpty()) {
            H.postDelayed(() -> { JanuAccessibilityService x = need(); if (x != null) x.typeText(message); }, 6600);
            H.postDelayed(() -> { JanuAccessibilityService x = need(); if (x != null) { if (!x.clickByText("Send")) x.clickByText("পাঠান"); } }, 7800);
        }
        return contact + " কে মেসেজ পাঠাচ্ছি।";
    }
}
