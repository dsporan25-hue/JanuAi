package com.poran.piyaai;

import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/** React অ্যাপ থেকে নেটিভ কমান্ড চালানোর ব্রিজ। */
@CapacitorPlugin(name = "JanuAssistant")
public class JanuAssistantPlugin extends Plugin {

    @PluginMethod
    public void execute(PluginCall call) {
        try {
            JSONObject cmd = new JSONObject(call.getData().toString());
            String result = JanuActionRunner.run(getContext(), cmd);
            JSObject ret = new JSObject();
            ret.put("result", result);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void isAccessibilityEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", checkEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void getHistory(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("history", new JSArray(JanuCommandMemory.getHistoryJson(getContext())));
            ret.put("currentApp", JanuCommandMemory.getCurrentApp(getContext()));
            ret.put("lastQuery", JanuCommandMemory.getLastQuery(getContext()));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void clearHistory(PluginCall call) {
        JanuCommandMemory.clear(getContext());
        call.resolve();
    }

    private boolean checkEnabled() {
        String name = getContext().getPackageName() + "/" + JanuAccessibilityService.class.getName();
        String enabled = Settings.Secure.getString(getContext().getContentResolver(),
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        TextUtils.SimpleStringSplitter sp = new TextUtils.SimpleStringSplitter(':');
        sp.setString(enabled);
        while (sp.hasNext()) {
            String s = sp.next();
            if (s.equalsIgnoreCase(name) || s.endsWith("JanuAccessibilityService")) return true;
        }
        return false;
    }
}
