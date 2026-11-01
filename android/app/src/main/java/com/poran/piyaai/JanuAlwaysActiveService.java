package com.poran.piyaai;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.AlarmClock;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Real Android Foreground Microphone Service ("JARVIS" Always Active Mode) for Janu AI.
 * Supports App Open, App Minimized, Screen Locked, Online + Offline Local Commands,
 * Female Voice playback, and automatic Wake-Word loop recovery.
 */
public class JanuAlwaysActiveService extends Service {
    public static final String ACTION_START_OR_SYNC = "com.poran.piyaai.ACTION_START_OR_SYNC";
    public static final String ACTION_USER_STOP = "com.poran.piyaai.ACTION_USER_STOP";
    public static final String ACTION_YIELD_MIC = "com.poran.piyaai.ACTION_YIELD_MIC";
    public static final String ACTION_RESUME_MIC = "com.poran.piyaai.ACTION_RESUME_MIC";

    private static final String CHANNEL_ID = "janu_always_active_channel";
    private static final int NOTIFICATION_ID = 4102;

    public interface ServiceEventListener {
        void onStateChanged(String stage, boolean online, String statusMessage, String partialText);
        void onTurnCompleted(JSONObject turnRecord);
    }

    private static volatile boolean serviceRunning = false;
    private static volatile String currentStage = "off";
    private static volatile String lastStatusMessage = "";
    private static volatile ServiceEventListener eventListener = null;

    public static boolean isServiceRunning() {
        return serviceRunning;
    }

    public static String getCurrentStage() {
        return currentStage;
    }

    public static String getLastStatusMessage() {
        return lastStatusMessage;
    }

    public static void setEventListener(ServiceEventListener listener) {
        eventListener = listener;
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService workerPool = Executors.newSingleThreadExecutor();

    private SpeechRecognizer speechRecognizer;
    private TextToSpeech offlineFemaleTts;
    private boolean ttsReady = false;
    private MediaPlayer activeMediaPlayer;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    private boolean isOnline = true;
    private boolean yieldedToManualUi = false;
    private boolean awaitingCommandAfterWake = false;
    private boolean processingTurn = false;
    private boolean speakingReply = false;
    private boolean flashlightOn = false;

    private String lastNormalizedCommand = "";
    private long lastCommandTimestampMs = 0L;
    private int consecutiveRecErrors = 0;

    private final Runnable restartListeningRunnable = this::startRecognizerCycleOnMain;
    private final Runnable commandWindowTimeoutRunnable = () -> {
        if (awaitingCommandAfterWake && !processingTurn && !speakingReply) {
            awaitingCommandAfterWake = false;
            updateStage("wake_standby", getStandbyLabel(), "");
            scheduleRecognizerRestart(180);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        serviceRunning = true;
        isOnline = checkCurrentConnectivity();
        createForegroundChannel();
        initOfflineFemaleTts();
        registerNetworkMonitor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START_OR_SYNC;

        if (ACTION_USER_STOP.equals(action)) {
            JanuAlwaysActivePrefs.setAlwaysActiveEnabled(this, false);
            stopEverythingAndSelf();
            return START_NOT_STICKY;
        }

        if (!JanuAlwaysActivePrefs.isAlwaysActiveEnabled(this)) {
            stopEverythingAndSelf();
            return START_NOT_STICKY;
        }

        boolean hasMicPerm =
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;

        if (!hasMicPerm) {
            updateStage(
                "paused_permission",
                "মাইক্রোফোন অনুমতি প্রয়োজন — সেটিংস থেকে Allow করুন",
                ""
            );
            promoteToForeground(lastStatusMessage);
            stopRecognizerOnly();
            return START_STICKY;
        }

        if (!promoteToForeground(getStandbyLabel())) {
            // Android 14+ blocked microphone FGS start from restricted context
            updateStage(
                "recovering",
                "অ্যাপ খুলে Always Active পুনরায় সক্রিয় করুন",
                ""
            );
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_YIELD_MIC.equals(action)) {
            yieldedToManualUi = true;
            stopRecognizerOnly();
            stopCurrentSpeechPlayback();
            return START_STICKY;
        }

        if (ACTION_RESUME_MIC.equals(action)) {
            yieldedToManualUi = false;
            awaitingCommandAfterWake = false;
            updateStage("wake_standby", getStandbyLabel(), "");
            scheduleRecognizerRestart(220);
            return START_STICKY;
        }

        yieldedToManualUi = false;
        if (!processingTurn && !speakingReply) {
            updateStage("wake_standby", getStandbyLabel(), "");
            scheduleRecognizerRestart(150);
        }

        // START_STICKY ensures Android restarts the service if reclaimed under memory pressure
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        serviceRunning = false;
        currentStage = "off";
        mainHandler.removeCallbacksAndMessages(null);
        stopRecognizerOnly();
        stopCurrentSpeechPlayback();
        unregisterNetworkMonitor();
        if (offlineFemaleTts != null) {
            try {
                offlineFemaleTts.stop();
                offlineFemaleTts.shutdown();
            } catch (Exception ignored) {
            }
            offlineFemaleTts = null;
        }
        workerPool.shutdownNow();
        ServiceEventListener listener = eventListener;
        if (listener != null) {
            listener.onStateChanged("off", isOnline, "Always Active বন্ধ আছে", "");
        }
        super.onDestroy();
    }

    private void stopEverythingAndSelf() {
        serviceRunning = false;
        currentStage = "off";
        mainHandler.removeCallbacksAndMessages(null);
        stopRecognizerOnly();
        stopCurrentSpeechPlayback();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) {
        }
        stopSelf();
    }

    private boolean promoteToForeground(String statusText) {
        Notification notification = buildPersistentNotification(statusText);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void updateNotificationText(String statusText) {
        try {
            NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && serviceRunning) {
                nm.notify(NOTIFICATION_ID, buildPersistentNotification(statusText));
            }
        } catch (Exception ignored) {
        }
    }

    private Notification buildPersistentNotification(String statusText) {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentPendingIntent =
            PendingIntent.getActivity(this, 10, openAppIntent, piFlags);

        Intent stopIntent = new Intent(this, JanuAlwaysActiveService.class);
        stopIntent.setAction(ACTION_USER_STOP);
        PendingIntent stopPendingIntent =
            PendingIntent.getService(this, 11, stopIntent, piFlags);

        String modeTag = isOnline ? "Online AI" : "Offline Local";
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Janu AI · " + modeTag)
            .setContentText(statusText)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(contentPendingIntent)
            .addAction(0, "বন্ধ করুন (Turn OFF)", stopPendingIntent)
            .build();
    }

    private void createForegroundChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Janu AI Always Active Voice",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription(
                "Keeps Janu AI listening for your Wake Word when Always Active Switch is ON."
            );
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
    }

    private String getStandbyLabel() {
        String lang = JanuAlwaysActivePrefs.getPreferredLanguage(this);
        String wake = JanuAlwaysActivePrefs.getWakeWord(this);
        if (!isOnline) {
            if ("hi".equals(lang)) {
                return "ऑफ़लाइन मोड · '" + wake + "' या 'जानू' बोलें";
            } else if ("en".equals(lang)) {
                return "Offline Local Mode · Say 'Hey " + wake + "'";
            }
            return "অফলাইন লোকাল মোড · 'Hey " + wake + "' বা 'জানু' বলুন";
        }
        if ("hi".equals(lang)) {
            return "सक्रिय · 'Hey " + wake + "' या 'जानू' बोलें";
        } else if ("en".equals(lang)) {
            return "Always Active · Say 'Hey " + wake + "'";
        }
        return "সর্বদা সক্রিয় · 'Hey " + wake + "' বা 'জানু' বলুন";
    }

    private void updateStage(String stage, String message, String partialTranscript) {
        currentStage = stage;
        lastStatusMessage = message;
        updateNotificationText(message);
        ServiceEventListener listener = eventListener;
        if (listener != null) {
            mainHandler.post(() -> listener.onStateChanged(stage, isOnline, message, partialTranscript));
        }
    }

    // =========================================================================
    // NETWORK ONLINE / OFFLINE AUTO-SWITCHING (Never disables Always Active!)
    // =========================================================================
    private boolean checkCurrentConnectivity() {
        try {
            ConnectivityManager cm =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network net = cm.getActiveNetwork();
                if (net == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(net);
                return caps != null
                    && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            } else {
                android.net.NetworkInfo info = cm.getActiveNetworkInfo();
                return info != null && info.isConnected();
            }
        } catch (Exception e) {
            return false;
        }
    }

    private void registerNetworkMonitor() {
        try {
            connectivityManager =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager == null) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    isOnline = true;
                    mainHandler.post(() -> {
                        if (serviceRunning && !processingTurn && !speakingReply) {
                            updateStage("wake_standby", getStandbyLabel(), "");
                        }
                    });
                }

                @Override
                public void onLost(Network network) {
                    isOnline = checkCurrentConnectivity();
                    mainHandler.post(() -> {
                        if (serviceRunning && !processingTurn && !speakingReply) {
                            updateStage("wake_standby", getStandbyLabel(), "");
                        }
                    });
                }
            };
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                connectivityManager.registerDefaultNetworkCallback(networkCallback);
            }
        } catch (Exception ignored) {
        }
    }

    private void unregisterNetworkMonitor() {
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
            }
        }
    }

    // =========================================================================
    // CONTINUOUS WAKE-WORD + COMMAND SPEECH RECOGNIZER LOOP
    // =========================================================================
    private void scheduleRecognizerRestart(long delayMs) {
        mainHandler.removeCallbacks(restartListeningRunnable);
        if (!serviceRunning
            || yieldedToManualUi
            || processingTurn
            || speakingReply
            || !JanuAlwaysActivePrefs.isAlwaysActiveEnabled(this)) {
            return;
        }
        mainHandler.postDelayed(restartListeningRunnable, delayMs);
    }

    private void stopRecognizerOnly() {
        mainHandler.removeCallbacks(restartListeningRunnable);
        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception ignored) {
            }
            speechRecognizer = null;
        }
    }

    private void startRecognizerCycleOnMain() {
        if (!serviceRunning
            || yieldedToManualUi
            || processingTurn
            || speakingReply
            || !JanuAlwaysActivePrefs.isAlwaysActiveEnabled(this)) {
            return;
        }

        boolean hasMicPerm =
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        if (!hasMicPerm) {
            updateStage(
                "paused_permission",
                "মাইক্রোফোন অনুমতি বাতিল হয়েছে — পুনরায় অনুমতি দিন",
                ""
            );
            return;
        }

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            updateStage(
                "recovering",
                "ডিভাইসে Google Speech Service উপলব্ধ নেই",
                ""
            );
            return;
        }

        stopRecognizerOnly();

        try {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override
                public void onReadyForSpeech(Bundle params) {
                    consecutiveRecErrors = 0;
                    if (awaitingCommandAfterWake) {
                        updateStage("capturing_command", "জানু আপনার নির্দেশ শুনছে...", "");
                    } else {
                        updateStage("wake_standby", getStandbyLabel(), "");
                    }
                }

                @Override
                public void onBeginningOfSpeech() {}

                @Override
                public void onRmsChanged(float rmsdB) {}

                @Override
                public void onBufferReceived(byte[] buffer) {}

                @Override
                public void onEndOfSpeech() {}

                @Override
                public void onError(int error) {
                    if (!serviceRunning || yieldedToManualUi || processingTurn || speakingReply) {
                        return;
                    }
                    if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                        updateStage(
                            "paused_permission",
                            "মাইক্রোফোন অনুমতি প্রয়োজন — সেটিংস থেকে Allow করুন",
                            ""
                        );
                        return;
                    }

                    // Normal silence / no-match during continuous wake-word listening
                    if (error == SpeechRecognizer.ERROR_NO_MATCH
                        || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                        if (awaitingCommandAfterWake) {
                            awaitingCommandAfterWake = false;
                            mainHandler.removeCallbacks(commandWindowTimeoutRunnable);
                        }
                        scheduleRecognizerRestart(220);
                        return;
                    }

                    consecutiveRecErrors++;
                    long backoffMs = Math.min(4000L, 450L * consecutiveRecErrors);
                    scheduleRecognizerRestart(backoffMs);
                }

                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> matches =
                        results != null
                            ? results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            : null;
                    String topText =
                        (matches != null && !matches.isEmpty() && matches.get(0) != null)
                            ? matches.get(0).trim()
                            : "";

                    handleRecognizedUtterance(topText, true);
                }

                @Override
                public void onPartialResults(Bundle partialResults) {
                    ArrayList<String> partial =
                        partialResults != null
                            ? partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            : null;
                    String text =
                        (partial != null && !partial.isEmpty() && partial.get(0) != null)
                            ? partial.get(0).trim()
                            : "";
                    if (!text.isEmpty() && awaitingCommandAfterWake) {
                        updateStage("capturing_command", "জানু শুনছে...", text);
                    }
                }

                @Override
                public void onEvent(int eventType, Bundle params) {}
            });

            String prefLang = JanuAlwaysActivePrefs.getPreferredLanguage(this);
            String localeTag =
                "hi".equals(prefLang) ? "hi-IN" : "en".equals(prefLang) ? "en-US" : "bn-BD";

            Intent recIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            recIntent.putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            );
            recIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, localeTag);
            recIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            recIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
            if (!isOnline) {
                recIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            }

            speechRecognizer.startListening(recIntent);
        } catch (Exception e) {
            scheduleRecognizerRestart(1200);
        }
    }

    private void handleRecognizedUtterance(String spoken, boolean isFinal) {
        if (spoken == null || spoken.trim().isEmpty()) {
            scheduleRecognizerRestart(200);
            return;
        }

        String trimmed = spoken.trim();

        // Stage B: Already triggered by Wake Word -> entire phrase is user's command
        if (awaitingCommandAfterWake) {
            awaitingCommandAfterWake = false;
            mainHandler.removeCallbacks(commandWindowTimeoutRunnable);

            // Strip accidental repeated wake word if user said it again
            WakeMatch repeated = matchWakeWord(trimmed);
            String finalCommand =
                (repeated.matched && !repeated.inlineCommand.isEmpty())
                    ? repeated.inlineCommand
                    : trimmed;

            if (repeated.matched && repeated.inlineCommand.isEmpty()) {
                // User just repeated "Janu" — stay in command capture window
                awaitingCommandAfterWake = true;
                mainHandler.postDelayed(commandWindowTimeoutRunnable, 9500);
                scheduleRecognizerRestart(180);
                return;
            }

            dispatchUserCommand(finalCommand);
            return;
        }

        // Stage A: Waiting for Wake Word ("Janu", "Hey Janu", "জানু", "जानू", or custom wake word)
        WakeMatch match = matchWakeWord(trimmed);
        if (!match.matched) {
            scheduleRecognizerRestart(180);
            return;
        }

        // Single-breath Wake Word + Command (e.g., "Hey Janu turn on flashlight" / "জানু ব্যাটারি কত")
        if (!match.inlineCommand.isEmpty()) {
            dispatchUserCommand(match.inlineCommand);
            return;
        }

        // Wake Word only ("Hey Janu" / "জানু") -> Speak crisp Female cue & listen for command!
        awaitingCommandAfterWake = true;
        String lang = JanuAlwaysActivePrefs.getPreferredLanguage(this);
        String ack =
            "hi".equals(lang) ? "जी बताइए?" : "en".equals(lang) ? "Yes, listening." : "জি বলুন?";

        speakAckThenCaptureCommand(ack, lang);
    }

    private static final class WakeMatch {
        final boolean matched;
        final String inlineCommand;

        WakeMatch(boolean matched, String inlineCommand) {
            this.matched = matched;
            this.inlineCommand = inlineCommand;
        }
    }

    private WakeMatch matchWakeWord(String transcript) {
        String clean = transcript.trim().replaceAll("\\s+", " ");
        String lower = clean.toLowerCase(Locale.ROOT);
        String customWake = JanuAlwaysActivePrefs.getWakeWord(this).toLowerCase(Locale.ROOT);

        String[] aliases = new String[] {
            "hey " + customWake,
            "hi " + customWake,
            "ok " + customWake,
            customWake,
            "hey janu",
            "hi janu",
            "hello janu",
            "ok janu",
            "okay janu",
            "o janu",
            "janu ai",
            "হেই জানু",
            "হে জানু",
            "হ্যালো জানু",
            "ও জানু",
            "শোনো জানু",
            "জানু এআই",
            "हे जानू",
            "हाय जानू",
            "हेलो जानू",
            "ओ जानू",
            "सुनो जानू",
            "जानू एआई",
            "jaanu",
            "janoo",
            "janu",
            "জানু",
            "जानू"
        };

        for (String alias : aliases) {
            if (alias == null || alias.trim().isEmpty()) continue;
            int idx = lower.indexOf(alias);
            if (idx >= 0) {
                int endIdx = idx + alias.length();
                boolean startOk =
                    idx == 0 || !Character.isLetterOrDigit(lower.charAt(idx - 1));
                boolean endOk =
                    endIdx >= lower.length() || !Character.isLetterOrDigit(lower.charAt(endIdx));

                if (startOk && endOk) {
                    String rem =
                        clean.substring(Math.min(clean.length(), endIdx))
                            .replaceFirst("^[\\s,।.!?:;-]+", "")
                            .trim();
                    return new WakeMatch(true, rem);
                }
            }
        }
        return new WakeMatch(false, "");
    }

    // =========================================================================
    // DEDUPLICATION + ONLINE GEMINI / OFFLINE LOCAL COMMAND EXECUTION
    // =========================================================================
    private void dispatchUserCommand(String rawCommand) {
        String cmd = rawCommand != null ? rawCommand.trim() : "";
        if (cmd.isEmpty()) {
            scheduleRecognizerRestart(200);
            return;
        }

        String normalized =
            cmd.toLowerCase(Locale.ROOT).replaceAll("[।.,!?\\s]+", " ").trim();
        long now = System.currentTimeMillis();

        // Prevent duplicate execution of the exact same voice command within 4.5 seconds
        if (processingTurn
            || (normalized.equals(lastNormalizedCommand) && (now - lastCommandTimestampMs) < 4500L)) {
            scheduleRecognizerRestart(250);
            return;
        }

        lastNormalizedCommand = normalized;
        lastCommandTimestampMs = now;
        processingTurn = true;
        stopRecognizerOnly();

        updateStage("processing", "জানু উত্তর তৈরি করছে...", cmd);

        // Acquire short CPU WakeLock so screen-locked responses finish reliably
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        final PowerManager.WakeLock wakeLock =
            pm != null
                ? pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "JanuAI:CommandTurnLock")
                : null;
        if (wakeLock != null) {
            try {
                wakeLock.acquire(22000L);
            } catch (Exception ignored) {
            }
        }

        workerPool.execute(() -> {
            try {
                boolean currentlyOnline = checkCurrentConnectivity();
                isOnline = currentlyOnline;
                if (currentlyOnline) {
                    try {
                        executeOnlineTurn(cmd);
                        return;
                    } catch (Exception netErr) {
                        // Seamless fallback to Offline Local Engine if network drops mid-request!
                    }
                }
                executeOfflineLocalTurn(cmd);
            } finally {
                if (wakeLock != null && wakeLock.isHeld()) {
                    try {
                        wakeLock.release();
                    } catch (Exception ignored) {
                    }
                }
            }
        });
    }

    private void executeOnlineTurn(String commandText) throws Exception {
        String backendUrl = JanuAlwaysActivePrefs.getBackendUrl(this);
        String prefLang = JanuAlwaysActivePrefs.getPreferredLanguage(this);

        JSONObject payload = new JSONObject();
        payload.put("message", commandText);
        payload.put("preferredLanguage", prefLang);
        payload.put("inlineFemaleTts", true);
        payload.put("history", new JSONArray(JanuAlwaysActivePrefs.getHistoryJson(this)));
        payload.put("contacts", new JSONArray(JanuAlwaysActivePrefs.getContactsJson(this)));
        payload.put("memories", new JSONArray(JanuAlwaysActivePrefs.getMemoriesJson(this)));

        JSONObject deviceState = new JSONObject();
        int batPct = readBatteryPercentage();
        if (batPct >= 0) {
            deviceState.put("batteryLevel", batPct);
        }
        deviceState.put("isCharging", isBatteryCharging());
        deviceState.put("isNativeAndroid", true);
        deviceState.put("flashlightOn", flashlightOn);
        payload.put("deviceState", deviceState);

        URL url = new URL(backendUrl + "/api/assistant/chat");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(18000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");

        byte[] bodyBytes = payload.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(bodyBytes);
        }

        int code = conn.getResponseCode();
        InputStream stream = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        if (stream == null) {
            throw new Exception("Empty server stream (" + code + ")");
        }

        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader =
            new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
        }
        conn.disconnect();

        if (code < 200 || code >= 300) {
            throw new Exception("HTTP " + code);
        }

        JSONObject resp = new JSONObject(sb.toString());
        String reply = resp.optString("reply", "").trim();
        String lang = resp.optString("language", prefLang);
        String audioB64 = resp.optString("audioBase64", "");
        JSONArray toolActions = resp.optJSONArray("toolActions");

        if (reply.isEmpty()) {
            throw new Exception("Empty AI reply");
        }

        JSONObject turnMeta = executeToolActionsNatively(toolActions, commandText, lang);
        String finalSpoken = turnMeta.optString("overrideReply", reply);
        String actionBadge = turnMeta.optString("actionBadge", "");

        recordAndBroadcastTurn(commandText, finalSpoken, lang, actionBadge, turnMeta);

        final String spokenOut = finalSpoken;
        final String langOut = lang;
        final String inlineAudio = spokenOut.equals(reply) ? audioB64 : "";

        mainHandler.post(() -> speakReplyAndResumeWakeLoop(spokenOut, langOut, inlineAudio));
    }

    private void executeOfflineLocalTurn(String commandText) {
        String prefLang = JanuAlwaysActivePrefs.getPreferredLanguage(this);
        String lang = detectSimpleLang(commandText, prefLang);
        String lower = normalizeDigits(commandText).toLowerCase(Locale.ROOT);

        String reply;
        String actionBadge = "Offline";
        JSONObject extraMeta = new JSONObject();

        try {
            if (lower.contains("flashlight") || lower.contains("torch")
                || lower.contains("ফ্ল্যাশলাইট") || lower.contains("টর্চ") || lower.contains("লাইট")
                || lower.contains("फ़्लैशलाइट") || lower.contains("टॉर्च") || lower.contains("लाइट")) {
                boolean off = lower.contains("off") || lower.contains("বন্ধ") || lower.contains("बंद");
                boolean on = lower.contains("on") || lower.contains("জ্বালাও") || lower.contains("চালু") || lower.contains("जलाओ") || lower.contains("चालू");
                boolean next = off ? false : (on ? true : !flashlightOn);
                boolean ok = setHardwareTorch(next);
                flashlightOn = ok && next;
                actionBadge = "Flashlight";
                reply =
                    "hi".equals(lang)
                        ? (next ? "फ़्लैशलाइट चालू कर दी गई है।" : "फ़्लैशलाइट बंद कर दी गई है।")
                        : "en".equals(lang)
                        ? (next ? "Flashlight turned on." : "Flashlight turned off.")
                        : (next ? "ফ্ল্যাশলাইট চালু করা হয়েছে।" : "ফ্ল্যাশলাইট বন্ধ করা হয়েছে।");
            } else if (lower.contains("battery") || lower.contains("charge")
                || lower.contains("ব্যাটারি") || lower.contains("চার্জ")
                || lower.contains("बैटरी") || lower.contains("चार्ज")) {
                int pct = readBatteryPercentage();
                boolean chg = isBatteryCharging();
                actionBadge = "Battery";
                reply =
                    "hi".equals(lang)
                        ? "फ़ोन की बैटरी अभी " + pct + " प्रतिशत है" + (chg ? " और चार्ज हो रही है।" : "।")
                        : "en".equals(lang)
                        ? "Phone battery is at " + pct + " percent" + (chg ? " and charging." : ".")
                        : "ফোনের ব্যাটারি এখন " + pct + " শতাংশ" + (chg ? " এবং চার্জ হচ্ছে।" : "।");
            } else if (lower.contains("time") || lower.contains("কয়টা বাজে")
                || lower.contains("সময় কত") || lower.contains("সময় কত")
                || lower.contains("समय") || lower.contains("कितने बजे")) {
                String t = new SimpleDateFormat("hh:mm a", Locale.US).format(new Date());
                actionBadge = "Time";
                reply =
                    "hi".equals(lang)
                        ? "अभी समय " + t + " है।"
                        : "en".equals(lang)
                        ? "The current time is " + t + "."
                        : "এখন সময় " + t + "।";
            } else if (lower.contains("lock phone") || lower.contains("lock screen")
                || lower.contains("ফোন লক") || lower.contains("স্ক্রিন লক")
                || lower.contains("फ़ोन लॉक") || lower.contains("स्क्रीन लॉक")) {
                boolean locked = tryLockScreenNow();
                actionBadge = "Lock Screen";
                reply =
                    locked
                        ? ("hi".equals(lang) ? "फ़ोन लॉक कर दिया गया है।" : "en".equals(lang) ? "Phone screen locked." : "ফোন লক করা হয়েছে।")
                        : ("hi".equals(lang) ? "फ़ोन लॉक करने के लिए Device Admin अनुमति चालू करें।" : "en".equals(lang) ? "Please enable Device Admin permission to lock the screen." : "ফোন লক করতে Device Admin অনুমতি সক্রিয় করুন।");
            } else if (lower.contains("youtube") || lower.contains("ইউটিউব") || lower.contains("यूट्यूब")) {
                launchKnownPackage("com.google.android.youtube", "https://m.youtube.com");
                actionBadge = "YouTube";
                reply = "hi".equals(lang) ? "YouTube खोला जा रहा है।" : "en".equals(lang) ? "Opening YouTube." : "ইউটিউব খোলা হচ্ছে।";
            } else if (lower.contains("whatsapp") || lower.contains("হোয়াটসঅ্যাপ") || lower.contains("व्हाट्सऐप")) {
                launchKnownPackage("com.whatsapp", null);
                actionBadge = "WhatsApp";
                reply = "hi".equals(lang) ? "WhatsApp खोला जा रहा है।" : "en".equals(lang) ? "Opening WhatsApp." : "হোয়াটসঅ্যাপ খোলা হচ্ছে।";
            } else if (lower.contains("wifi") || lower.contains("wi-fi") || lower.contains("ওয়াইফাই") || lower.contains("वाईफाई")) {
                openAndroidSettings(Settings.ACTION_WIFI_SETTINGS);
                actionBadge = "Wi-Fi";
                reply = "hi".equals(lang) ? "वाई-फ़ाई सेटिंग्स खोली जा रही हैं।" : "en".equals(lang) ? "Opening Wi-Fi settings." : "ওয়াই-ফাই সেটিংস খোলা হচ্ছে।";
            } else if (lower.contains("bluetooth") || lower.contains("ব্লুটুথ") || lower.contains("ब्लूटूथ")) {
                openAndroidSettings(Settings.ACTION_BLUETOOTH_SETTINGS);
                actionBadge = "Bluetooth";
                reply = "hi".equals(lang) ? "ब्लूटूथ सेटिंग्स खोली जा रही हैं।" : "en".equals(lang) ? "Opening Bluetooth settings." : "ব্লুটুথ সেটিংস খোলা হচ্ছে।";
            } else if (lower.contains("call ") || lower.contains("কল") || lower.contains("ফোন দাও") || lower.contains("कॉल")) {
                String cleanTarget = lower
                    .replaceAll("(call|কে কল করো|কে কল দাও|কল করো|কল দাও|ফোন দাও|को कॉल करो|कॉल करो)", " ")
                    .trim();
                String matchedPhone = findSavedContactPhone(cleanTarget);
                if (matchedPhone != null && !matchedPhone.isEmpty()) {
                    Intent dialIntent = new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + matchedPhone));
                    dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(dialIntent);
                    actionBadge = "Dialer";
                    reply = "hi".equals(lang) ? "डायलर खोला गया है, कृपया कॉल कन्फ़र्म करें।" : "en".equals(lang) ? "Opened phone dialer. Tap call to confirm." : "ডায়ালার খোলা হয়েছে, কলটি নিশ্চিত করুন।";
                } else {
                    reply = "hi".equals(lang) ? "सेव किए गए कॉन्टैक्ट्स में यह नाम नहीं मिला।" : "en".equals(lang) ? "Could not find that name in saved contacts." : "সেভ করা কনট্যাক্টে এই নামটি পাওয়া যায়নি।";
                }
            } else {
                reply =
                    "hi".equals(lang)
                        ? "अभी इंटरनेट बंद है, इसलिए ऑनलाइन एआई उपलब्ध नहीं है। ऑफ़लाइन मोड में मैं फ़्लैशलाइट, बैटरी, समय, लॉक, कॉल और ऐप खोलने के काम कर सकती हूँ।"
                        : "en".equals(lang)
                        ? "Internet is currently offline, so cloud AI is unavailable. In offline mode I can control flashlight, battery, time, screen lock, calls, and apps."
                        : "বর্তমানে ইন্টারনেট বন্ধ থাকায় অনলাইন এআই উপলব্ধ নেই। অফলাইন মোডে আমি ফ্ল্যাশলাইট, ব্যাটারি, সময়, ফোন লক, কল এবং অ্যাপ খোলার কাজ করতে পারি।";
            }
        } catch (Exception e) {
            reply = "অফলাইন নির্দেশটি সম্পন্ন করতে সমস্যা হয়েছে।";
        }

        recordAndBroadcastTurn(commandText, reply, lang, actionBadge, extraMeta);
        final String finalReply = reply;
        final String finalLang = lang;
        mainHandler.post(() -> speakReplyAndResumeWakeLoop(finalReply, finalLang, ""));
    }

    private JSONObject executeToolActionsNatively(
        JSONArray toolActions,
        String userCommand,
        String lang
    ) {
        JSONObject meta = new JSONObject();
        if (toolActions == null || toolActions.length() == 0) return meta;

        try {
            for (int i = 0; i < toolActions.length(); i++) {
                JSONObject tool = toolActions.getJSONObject(i);
                String name = tool.optString("name", "");
                JSONObject args = tool.optJSONObject("args");
                if (args == null) args = new JSONObject();

                if ("controlFlashlight".equals(name)) {
                    String mode = args.optString("mode", "toggle");
                    boolean next =
                        "on".equals(mode) ? true : ("off".equals(mode) ? false : !flashlightOn);
                    if (setHardwareTorch(next)) {
                        flashlightOn = next;
                    }
                    meta.put("actionBadge", "Flashlight");
                } else if ("openApplication".equals(name)) {
                    String appName = args.optString("appName", "").toLowerCase(Locale.ROOT);
                    launchAppBySpokenName(appName);
                    meta.put("actionBadge", "Open App");
                } else if ("searchYouTube".equals(name)) {
                    String query = args.optString("query", userCommand);
                    boolean music = "youtube_music".equals(args.optString("targetApp", ""));
                    String ytUrl = music
                        ? "https://music.youtube.com/search?q=" + Uri.encode(query)
                        : "https://www.youtube.com/results?search_query=" + Uri.encode(query);
                    Intent ytIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(ytUrl));
                    ytIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(ytIntent);
                    meta.put("actionBadge", "YouTube");
                } else if ("openSystemSettings".equals(name)) {
                    String sec = args.optString("settingType", "phone_settings");
                    if ("wifi".equals(sec)) openAndroidSettings(Settings.ACTION_WIFI_SETTINGS);
                    else if ("bluetooth".equals(sec)) openAndroidSettings(Settings.ACTION_BLUETOOTH_SETTINGS);
                    else openAndroidSettings(Settings.ACTION_SETTINGS);
                    meta.put("actionBadge", "Settings");
                } else if ("lockPhoneScreen".equals(name)) {
                    tryLockScreenNow();
                    meta.put("actionBadge", "Lock Screen");
                } else if ("setDeviceAlarm".equals(name)) {
                    int h = args.optInt("hour", 7);
                    int m = args.optInt("minute", 0);
                    String label = args.optString("label", "Janu AI Alarm");
                    Intent alIntent = new Intent(AlarmClock.ACTION_SET_ALARM);
                    alIntent.putExtra(AlarmClock.EXTRA_HOUR, h);
                    alIntent.putExtra(AlarmClock.EXTRA_MINUTES, m);
                    alIntent.putExtra(AlarmClock.EXTRA_MESSAGE, label);
                    alIntent.putExtra(AlarmClock.EXTRA_SKIP_UI, true);
                    alIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(alIntent);
                    meta.put("actionBadge", "Alarm");
                    meta.put("alarmHour", h);
                    meta.put("alarmMinute", m);
                    meta.put("alarmLabel", label);
                } else if ("proposePhoneCall".equals(name)) {
                    String cName = args.optString("contactName", "");
                    String matchedPhone = findSavedContactPhone(cName);
                    if (matchedPhone != null && !matchedPhone.isEmpty()) {
                        Intent dialIntent = new Intent(
                            Intent.ACTION_DIAL,
                            Uri.parse("tel:" + matchedPhone)
                        );
                        dialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(dialIntent);
                        meta.put("actionBadge", "Dialer Ready");
                    }
                } else if ("createPersonalNote".equals(name)) {
                    meta.put("actionBadge", "Note Saved");
                    meta.put("noteTitle", args.optString("title", "Voice Note"));
                    meta.put("noteContent", args.optString("content", userCommand));
                }
            }
        } catch (Exception ignored) {
        }
        return meta;
    }

    private void recordAndBroadcastTurn(
        String userText,
        String assistantText,
        String language,
        String actionBadge,
        JSONObject extraMeta
    ) {
        try {
            JSONObject turn = new JSONObject();
            turn.put("id", "bg_" + System.currentTimeMillis());
            turn.put("userText", userText);
            turn.put("assistantText", assistantText);
            turn.put("language", language);
            turn.put(
                "timestamp",
                new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date())
            );
            if (actionBadge != null && !actionBadge.isEmpty()) {
                turn.put("actionBadge", actionBadge);
            }
            if (extraMeta != null) {
                if (extraMeta.has("noteTitle")) {
                    turn.put("noteTitle", extraMeta.optString("noteTitle"));
                    turn.put("noteContent", extraMeta.optString("noteContent"));
                }
                if (extraMeta.has("alarmHour")) {
                    turn.put("alarmHour", extraMeta.optInt("alarmHour"));
                    turn.put("alarmMinute", extraMeta.optInt("alarmMinute"));
                    turn.put("alarmLabel", extraMeta.optString("alarmLabel"));
                }
            }

            ServiceEventListener listener = eventListener;
            if (listener != null) {
                // UI is attached — deliver live and also update rolling history
                JanuAlwaysActivePrefs.appendBackgroundTurn(this, turn);
                mainHandler.post(() -> listener.onTurnCompleted(turn));
            } else {
                // App minimized / closed — persist in queue so UI drains on next open
                JanuAlwaysActivePrefs.appendBackgroundTurn(this, turn);
            }
        } catch (Exception ignored) {
        }
    }

    // =========================================================================
    // 100% FEMALE VOICE PLAYBACK -> AUTOMATIC RETURN TO WAKE-WORD STANDBY
    // =========================================================================
    private void initOfflineFemaleTts() {
        try {
            offlineFemaleTts = new TextToSpeech(getApplicationContext(), status -> {
                if (status == TextToSpeech.SUCCESS && offlineFemaleTts != null) {
                    ttsReady = true;
                    offlineFemaleTts.setPitch(1.12f);
                    offlineFemaleTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {}

                        @Override
                        public void onDone(String utteranceId) {
                            mainHandler.post(() -> onSpeechFinished(utteranceId));
                        }

                        @Override
                        public void onError(String utteranceId) {
                            mainHandler.post(() -> onSpeechFinished(utteranceId));
                        }
                    });
                }
            });
        } catch (Exception ignored) {
        }
    }

    private void selectFemaleVoiceForLanguage(String langCode) {
        if (!ttsReady || offlineFemaleTts == null) return;
        Locale targetLocale =
            "hi".equals(langCode)
                ? new Locale("hi", "IN")
                : "en".equals(langCode)
                ? new Locale("en", "IN")
                : new Locale("bn", "BD");

        try {
            offlineFemaleTts.setLanguage(targetLocale);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Set<Voice> voices = offlineFemaleTts.getVoices();
                if (voices != null) {
                    String prefix = targetLocale.getLanguage().toLowerCase(Locale.ROOT);
                    Voice bestFemale = null;
                    for (Voice v : voices) {
                        if (v.getLocale() == null) continue;
                        String vLang = v.getLocale().getLanguage().toLowerCase(Locale.ROOT);
                        if (!vLang.startsWith(prefix)) continue;
                        String vName = v.getName().toLowerCase(Locale.ROOT);
                        if (vName.contains("male") && !vName.contains("female")) continue;
                        if (vName.contains("female")
                            || vName.contains("sfg")
                            || vName.contains("ban")
                            || vName.contains("hia")
                            || vName.contains("hic")
                            || vName.contains("ena")
                            || vName.contains("f0")) {
                            bestFemale = v;
                            break;
                        }
                        if (bestFemale == null) {
                            bestFemale = v;
                        }
                    }
                    if (bestFemale != null) {
                        offlineFemaleTts.setVoice(bestFemale);
                    }
                }
            }
            float speed = JanuAlwaysActivePrefs.getSpeechSpeed(this);
            offlineFemaleTts.setSpeechRate(Math.max(0.8f, Math.min(1.35f, speed)));
            offlineFemaleTts.setPitch(1.12f);
        } catch (Exception ignored) {
        }
    }

    private void speakAckThenCaptureCommand(String ackText, String lang) {
        stopRecognizerOnly();
        speakingReply = true;
        updateStage("speaking", ackText, "");

        if (ttsReady && offlineFemaleTts != null) {
            selectFemaleVoiceForLanguage(lang);
            Bundle params = new Bundle();
            offlineFemaleTts.speak(ackText, TextToSpeech.QUEUE_FLUSH, params, "WAKE_ACK");
            // Safety fallback timer in case OEM TTS engine swallows callback
            mainHandler.postDelayed(() -> {
                if (speakingReply && awaitingCommandAfterWake) {
                    onSpeechFinished("WAKE_ACK");
                }
            }, 2400L);
        } else {
            speakingReply = false;
            mainHandler.postDelayed(commandWindowTimeoutRunnable, 9500L);
            scheduleRecognizerRestart(150);
        }
    }

    private void speakReplyAndResumeWakeLoop(
        String replyText,
        String lang,
        String inlineMp3Base64
    ) {
        stopCurrentSpeechPlayback();
        speakingReply = true;
        processingTurn = false;
        updateStage("speaking", "জানু কথা বলছে...", replyText);

        // 1. Prefer 100% Female MP3 from backend when available
        if (inlineMp3Base64 != null && !inlineMp3Base64.isEmpty()) {
            try {
                byte[] mp3Bytes = Base64.decode(inlineMp3Base64, Base64.DEFAULT);
                File tempMp3 = new File(getCacheDir(), "janu_bg_reply.mp3");
                try (FileOutputStream fos = new FileOutputStream(tempMp3)) {
                    fos.write(mp3Bytes);
                }

                MediaPlayer mp = new MediaPlayer();
                mp.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                );
                mp.setDataSource(tempMp3.getAbsolutePath());
                mp.prepare();

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    float speed = JanuAlwaysActivePrefs.getSpeechSpeed(this);
                    PlaybackParams pp = mp.getPlaybackParams();
                    pp.setSpeed(Math.max(0.8f, Math.min(1.4f, speed)));
                    mp.setPlaybackParams(pp);
                }

                mp.setOnCompletionListener(player -> {
                    stopCurrentSpeechPlayback();
                    onSpeechFinished("REPLY_DONE");
                });
                mp.setOnErrorListener((player, what, extra) -> {
                    stopCurrentSpeechPlayback();
                    onSpeechFinished("REPLY_DONE");
                    return true;
                });

                activeMediaPlayer = mp;
                mp.start();
                return;
            } catch (Exception ignored) {
                stopCurrentSpeechPlayback();
            }
        }

        // 2. Offline / Fallback Female Android TTS
        if (ttsReady && offlineFemaleTts != null) {
            selectFemaleVoiceForLanguage(lang);
            Bundle params = new Bundle();
            offlineFemaleTts.speak(replyText, TextToSpeech.QUEUE_FLUSH, params, "REPLY_DONE");
            return;
        }

        onSpeechFinished("REPLY_DONE");
    }

    private void onSpeechFinished(String utteranceId) {
        speakingReply = false;
        processingTurn = false;

        if ("WAKE_ACK".equals(utteranceId)) {
            awaitingCommandAfterWake = true;
            mainHandler.removeCallbacks(commandWindowTimeoutRunnable);
            mainHandler.postDelayed(commandWindowTimeoutRunnable, 9500L);
            updateStage("capturing_command", "জানু আপনার নির্দেশ শুনছে...", "");
            scheduleRecognizerRestart(150);
            return;
        }

        awaitingCommandAfterWake = false;
        updateStage("wake_standby", getStandbyLabel(), "");
        scheduleRecognizerRestart(260);
    }

    private void stopCurrentSpeechPlayback() {
        if (activeMediaPlayer != null) {
            try {
                if (activeMediaPlayer.isPlaying()) {
                    activeMediaPlayer.stop();
                }
            } catch (Exception ignored) {
            }
            try {
                activeMediaPlayer.release();
            } catch (Exception ignored) {
            }
            activeMediaPlayer = null;
        }
        if (offlineFemaleTts != null) {
            try {
                offlineFemaleTts.stop();
            } catch (Exception ignored) {
            }
        }
    }

    // =========================================================================
    // NATIVE DEVICE HELPERS FOR BACKGROUND / SCREEN-LOCKED COMMANDS
    // =========================================================================
    private int readBatteryPercentage() {
        try {
            BatteryManager bm = (BatteryManager) getSystemService(Context.BATTERY_SERVICE);
            if (bm != null) {
                int cap = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
                if (cap >= 0 && cap <= 100) return cap;
            }
        } catch (Exception ignored) {
        }
        return -1;
    }

    private boolean isBatteryCharging() {
        try {
            Intent status = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (status != null) {
                int st = status.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                return st == BatteryManager.BATTERY_STATUS_CHARGING
                    || st == BatteryManager.BATTERY_STATUS_FULL;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private boolean setHardwareTorch(boolean enable) {
        try {
            CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
            if (cm == null) return false;
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics chars = cm.getCameraCharacteristics(id);
                Boolean hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (hasFlash != null && hasFlash) {
                    cm.setTorchMode(id, enable);
                    return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private boolean tryLockScreenNow() {
        try {
            DevicePolicyManager dpm =
                (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName admin = new ComponentName(this, PiyaDeviceAdminReceiver.class);
            if (dpm != null && dpm.isAdminActive(admin)) {
                dpm.lockNow();
                return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private void openAndroidSettings(String action) {
        try {
            Intent intent = new Intent(action);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    private void launchKnownPackage(String pkg, String fallbackUrl) {
        try {
            PackageManager pm = getPackageManager();
            Intent launch = pm.getLaunchIntentForPackage(pkg);
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launch);
                return;
            }
            if (fallbackUrl != null) {
                Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl));
                web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(web);
            }
        } catch (Exception ignored) {
        }
    }

    private void launchAppBySpokenName(String lowerName) {
        if (lowerName.contains("youtube music")) {
            launchKnownPackage("com.google.android.apps.youtube.music", "https://music.youtube.com");
        } else if (lowerName.contains("youtube")) {
            launchKnownPackage("com.google.android.youtube", "https://m.youtube.com");
        } else if (lowerName.contains("whatsapp")) {
            launchKnownPackage("com.whatsapp", null);
        } else if (lowerName.contains("spotify")) {
            launchKnownPackage("com.spotify.music", "https://open.spotify.com");
        } else if (lowerName.contains("chrome")) {
            launchKnownPackage("com.android.chrome", "https://www.google.com");
        } else if (lowerName.contains("maps")) {
            launchKnownPackage("com.google.android.apps.maps", "https://maps.google.com");
        } else if (lowerName.contains("gmail")) {
            launchKnownPackage("com.google.android.gm", null);
        } else if (lowerName.contains("instagram")) {
            launchKnownPackage("com.instagram.android", "https://www.instagram.com");
        }
    }

    private String findSavedContactPhone(String queryName) {
        if (queryName == null || queryName.trim().isEmpty()) return null;
        String q = queryName.trim().toLowerCase(Locale.ROOT);
        try {
            JSONArray arr = new JSONArray(JanuAlwaysActivePrefs.getContactsJson(this));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject c = arr.getJSONObject(i);
                String name = c.optString("name", "").toLowerCase(Locale.ROOT);
                String phone = c.optString("phone", "");
                if (!name.isEmpty() && (name.contains(q) || q.contains(name))) {
                    return phone.replaceAll("[^\\d+]", "");
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static String normalizeDigits(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch >= '\u09E6' && ch <= '\u09EF') {
                out.append((char) ('0' + (ch - '\u09E6')));
            } else if (ch >= '\u0966' && ch <= '\u096F') {
                out.append((char) ('0' + (ch - '\u0966')));
            } else {
                out.append(ch);
            }
        }
        return out.toString();
    }

    private static String detectSimpleLang(String text, String fallback) {
        int bn = 0;
        int hi = 0;
        int latin = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= '\u0980' && c <= '\u09FF') bn++;
            else if (c >= '\u0900' && c <= '\u097F') hi++;
            else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) latin++;
        }
        if (bn > 0 && bn >= hi) return "bn";
        if (hi > 0 && hi > bn) return "hi";
        if (latin >= 3) return "en";
        return fallback;
    }
}
