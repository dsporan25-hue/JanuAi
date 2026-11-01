package com.poran.piyaai;

import android.Manifest;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.AlarmClock;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "PiyaDeviceControl",
    permissions = {
        @Permission(strings = { Manifest.permission.CALL_PHONE }, alias = "callPhone"),
        @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts"),
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class PiyaDeviceControlPlugin extends Plugin {

    @Override
    public void load() {
        super.load();
        JanuAlwaysActiveService.setEventListener(
            new JanuAlwaysActiveService.ServiceEventListener() {
                @Override
                public void onStateChanged(
                    String stage,
                    boolean online,
                    String statusMessage,
                    String partialText
                ) {
                    JSObject payload = new JSObject();
                    payload.put("eventType", "state");
                    payload.put(
                        "enabled",
                        JanuAlwaysActivePrefs.isAlwaysActiveEnabled(getContext())
                    );
                    payload.put("running", JanuAlwaysActiveService.isServiceRunning());
                    payload.put("stage", stage);
                    payload.put("online", online);
                    payload.put("statusMessage", statusMessage);
                    payload.put("partialTranscript", partialText);
                    notifyListeners("alwaysActiveEvent", payload);
                }

                @Override
                public void onTurnCompleted(JSONObject turnRecord) {
                    JSObject payload = new JSObject();
                    payload.put("eventType", "turn");
                    payload.put("turnJson", turnRecord.toString());
                    notifyListeners("alwaysActiveEvent", payload);
                }
            }
        );
    }

    @Override
    protected void handleOnDestroy() {
        JanuAlwaysActiveService.setEventListener(null);
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getAlwaysActiveStatus(PluginCall call) {
        call.resolve(buildCurrentAlwaysActiveStatus());
    }

    @PluginMethod
    public void setAlwaysActiveEnabled(PluginCall call) {
        Boolean enabledObj = call.getBoolean("enabled", false);
        boolean enable = enabledObj != null && enabledObj;

        String language = call.getString("language", "bn");
        String wakeWord = call.getString("wakeWord", "Janu");
        Float speedObj = call.getFloat("speechSpeed", 1.05f);
        float speechSpeed = speedObj != null ? speedObj : 1.05f;
        String voiceName = call.getString("voiceName", "Kore");
        String backendUrl = call.getString("backendUrl", "");
        String contactsJson = call.getString("contactsJson", null);
        String memoriesJson = call.getString("memoriesJson", null);
        String historyJson = call.getString("historyJson", null);

        JanuAlwaysActivePrefs.syncContext(
            getContext(),
            language,
            wakeWord,
            speechSpeed,
            voiceName,
            backendUrl,
            contactsJson,
            memoriesJson,
            historyJson
        );
        JanuAlwaysActivePrefs.setAlwaysActiveEnabled(getContext(), enable);

        if (!enable) {
            Intent stopIntent = new Intent(getContext(), JanuAlwaysActiveService.class);
            stopIntent.setAction(JanuAlwaysActiveService.ACTION_USER_STOP);
            try {
                getContext().startService(stopIntent);
            } catch (Exception ignored) {
                getContext().stopService(new Intent(getContext(), JanuAlwaysActiveService.class));
            }
            call.resolve(buildCurrentAlwaysActiveStatus());
            return;
        }

        // Request Android 13+ notification permission if not yet granted so persistent notification shows
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("notifications", call, "notifAndStartCallback");
            return;
        }

        checkMicAndStartForegroundService(call);
    }

    @PermissionCallback
    private void notifAndStartCallback(PluginCall call) {
        checkMicAndStartForegroundService(call);
    }

    private void checkMicAndStartForegroundService(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("microphone", call, "micForAlwaysActiveCallback");
            return;
        }
        startForegroundAssistantNow();
        call.resolve(buildCurrentAlwaysActiveStatus());
    }

    @PermissionCallback
    private void micForAlwaysActiveCallback(PluginCall call) {
        boolean hasMic =
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        if (hasMic) {
            startForegroundAssistantNow();
        }
        call.resolve(buildCurrentAlwaysActiveStatus());
    }

    private void startForegroundAssistantNow() {
        try {
            Intent startIntent = new Intent(getContext(), JanuAlwaysActiveService.class);
            startIntent.setAction(JanuAlwaysActiveService.ACTION_START_OR_SYNC);
            ContextCompat.startForegroundService(getContext(), startIntent);
        } catch (Exception ignored) {
        }
    }

    @PluginMethod
    public void syncAssistantContext(PluginCall call) {
        String language = call.getString("language", null);
        String wakeWord = call.getString("wakeWord", null);
        Float speedObj = call.getFloat("speechSpeed", 1.05f);
        float speechSpeed = speedObj != null ? speedObj : 1.05f;
        String voiceName = call.getString("voiceName", null);
        String backendUrl = call.getString("backendUrl", null);
        String contactsJson = call.getString("contactsJson", null);
        String memoriesJson = call.getString("memoriesJson", null);
        String historyJson = call.getString("historyJson", null);

        JanuAlwaysActivePrefs.syncContext(
            getContext(),
            language,
            wakeWord,
            speechSpeed,
            voiceName,
            backendUrl,
            contactsJson,
            memoriesJson,
            historyJson
        );
        JSObject ret = new JSObject();
        ret.put("synced", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void drainBackgroundTurns(PluginCall call) {
        String turnsJson = JanuAlwaysActivePrefs.drainBackgroundTurnsJson(getContext());
        JSObject ret = new JSObject();
        ret.put("turnsJson", turnsJson);
        call.resolve(ret);
    }

    @PluginMethod
    public void yieldServiceMic(PluginCall call) {
        Boolean pauseObj = call.getBoolean("pause", false);
        boolean pause = pauseObj != null && pauseObj;
        if (JanuAlwaysActivePrefs.isAlwaysActiveEnabled(getContext())
            && JanuAlwaysActiveService.isServiceRunning()) {
            try {
                Intent intent = new Intent(getContext(), JanuAlwaysActiveService.class);
                intent.setAction(
                    pause
                        ? JanuAlwaysActiveService.ACTION_YIELD_MIC
                        : JanuAlwaysActiveService.ACTION_RESUME_MIC
                );
                getContext().startService(intent);
            } catch (Exception ignored) {
            }
        }
        JSObject ret = new JSObject();
        ret.put("paused", pause);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        boolean alreadyIgnored = isIgnoringBatteryOptimizations();
        if (!alreadyIgnored && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(fallback);
                } catch (Exception ignored) {
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("batteryOptimizationIgnored", isIgnoringBatteryOptimizations());
        call.resolve(ret);
    }

    @PluginMethod
    public void openAppPermissionSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception ignored) {
        }
        JSObject ret = new JSObject();
        ret.put("launched", true);
        call.resolve(ret);
    }

    private boolean isIgnoringBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private JSObject buildCurrentAlwaysActiveStatus() {
        Context ctx = getContext();
        boolean enabled = JanuAlwaysActivePrefs.isAlwaysActiveEnabled(ctx);
        boolean running = JanuAlwaysActiveService.isServiceRunning();
        boolean hasMic =
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        boolean hasNotif =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;

        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        ret.put("running", running);
        ret.put("stage", enabled ? JanuAlwaysActiveService.getCurrentStage() : "off");
        ret.put("wakeWord", JanuAlwaysActivePrefs.getWakeWord(ctx));
        ret.put("batteryOptimizationIgnored", isIgnoringBatteryOptimizations());
        ret.put("notificationPermissionGranted", hasNotif);
        ret.put("micPermissionGranted", hasMic);
        ret.put("statusMessage", JanuAlwaysActiveService.getLastStatusMessage());
        return ret;
    }

    // =========================================================================
    // EXISTING DEVICE CONTROL METHODS (100% PRESERVED)
    // =========================================================================
    @PluginMethod
    public void openApp(PluginCall call) {
        String packageName = call.getString("packageName");
        String fallbackUrl = call.getString("fallbackUrl");
        PackageManager pm = getContext().getPackageManager();

        if (packageName != null && !packageName.trim().isEmpty()) {
            Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(launchIntent);
                JSObject ret = new JSObject();
                ret.put("launched", true);
                ret.put("message", "Launched " + packageName);
                call.resolve(ret);
                return;
            }
        }

        if (fallbackUrl != null && !fallbackUrl.trim().isEmpty()) {
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl));
            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(browserIntent);
            JSObject ret = new JSObject();
            ret.put("launched", true);
            ret.put("message", "Opened fallback URL");
            call.resolve(ret);
            return;
        }

        JSObject ret = new JSObject();
        ret.put("launched", false);
        ret.put("message", "Target application is not installed.");
        call.resolve(ret);
    }

    @PluginMethod
    public void openYoutubeSearch(PluginCall call) {
        String query = call.getString("query", "");
        Boolean musicOnlyObj = call.getBoolean("musicOnly", false);
        boolean musicOnly = musicOnlyObj != null && musicOnlyObj;

        String url = musicOnly
            ? "https://music.youtube.com/search?q=" + Uri.encode(query)
            : "https://www.youtube.com/results?search_query=" + Uri.encode(query);

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);

        JSObject ret = new JSObject();
        ret.put("launched", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void placeCall(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber");
        if (phoneNumber == null || phoneNumber.trim().isEmpty()) {
            call.reject("Phone number is required.");
            return;
        }

        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE)
            == PackageManager.PERMISSION_GRANTED) {
            Intent callIntent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + phoneNumber));
            callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(callIntent);
            JSObject ret = new JSObject();
            ret.put("launched", true);
            call.resolve(ret);
        } else {
            Intent dialIntent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phoneNumber));
            dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(dialIntent);
            requestPermissionForAlias("callPhone", call, "callPermCallback");
        }
    }

    @PermissionCallback
    private void callPermCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("launched", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void isDeviceAdminActive(PluginCall call) {
        DevicePolicyManager dpm =
            (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
        ComponentName adminComponent = new ComponentName(getContext(), PiyaDeviceAdminReceiver.class);
        JSObject ret = new JSObject();
        ret.put("active", dpm != null && dpm.isAdminActive(adminComponent));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestDeviceAdmin(PluginCall call) {
        ComponentName adminComponent = new ComponentName(getContext(), PiyaDeviceAdminReceiver.class);
        Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
        intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
        intent.putExtra(
            DevicePolicyManager.EXTRA_ADD_EXPLANATION,
            getContext().getString(R.string.device_admin_description)
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);

        JSObject ret = new JSObject();
        ret.put("requested", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void lockPhone(PluginCall call) {
        DevicePolicyManager dpm =
            (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
        ComponentName adminComponent = new ComponentName(getContext(), PiyaDeviceAdminReceiver.class);
        JSObject ret = new JSObject();
        if (dpm == null || !dpm.isAdminActive(adminComponent)) {
            ret.put("locked", false);
            ret.put("message", "Device Administrator permission is not active yet.");
            call.resolve(ret);
            return;
        }
        dpm.lockNow();
        ret.put("locked", true);
        ret.put("message", "Phone locked.");
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettingsPanel(PluginCall call) {
        String section = call.getString("section", "phone_settings");
        String action = Settings.ACTION_SETTINGS;
        if ("wifi".equals(section)) {
            action = Settings.ACTION_WIFI_SETTINGS;
        } else if ("bluetooth".equals(section)) {
            action = Settings.ACTION_BLUETOOTH_SETTINGS;
        } else if ("device_admin".equals(section)) {
            action = Settings.ACTION_SECURITY_SETTINGS;
        }

        Intent intent = new Intent(action);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);

        JSObject ret = new JSObject();
        ret.put("launched", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setAlarm(PluginCall call) {
        Integer hourObj = call.getInt("hour", 7);
        Integer minObj = call.getInt("minute", 0);
        int hour = hourObj != null ? hourObj : 7;
        int minute = minObj != null ? minObj : 0;
        String label = call.getString("label", "Janu AI Alarm");

        Intent intent = new Intent(AlarmClock.ACTION_SET_ALARM);
        intent.putExtra(AlarmClock.EXTRA_HOUR, hour);
        intent.putExtra(AlarmClock.EXTRA_MINUTES, minute);
        intent.putExtra(AlarmClock.EXTRA_MESSAGE, label);
        intent.putExtra(AlarmClock.EXTRA_SKIP_UI, false);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);

        JSObject ret = new JSObject();
        ret.put("scheduled", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void toggleFlashlight(PluginCall call) {
        Boolean enabledObj = call.getBoolean("enabled", false);
        boolean enabled = enabledObj != null && enabledObj;
        CameraManager cameraManager =
            (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
        JSObject ret = new JSObject();

        try {
            String rearCameraId = null;
            if (cameraManager != null) {
                for (String id : cameraManager.getCameraIdList()) {
                    CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                    Boolean hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    if (hasFlash != null && hasFlash) {
                        rearCameraId = id;
                        break;
                    }
                }
            }
            if (rearCameraId == null) {
                ret.put("enabled", false);
                ret.put("supported", false);
                call.resolve(ret);
                return;
            }
            cameraManager.setTorchMode(rearCameraId, enabled);
            ret.put("enabled", enabled);
            ret.put("supported", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Flashlight control error: " + e.getLocalizedMessage());
        }
    }
}
