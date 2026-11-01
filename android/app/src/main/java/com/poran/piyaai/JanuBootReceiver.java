package com.poran.piyaai;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Restores Janu AI Always Active Voice Assistant after device reboot or app update
 * when the user's permanent switch is ON, respecting Android 14+ foreground microphone rules.
 */
public class JanuBootReceiver extends BroadcastReceiver {
    private static final String BOOT_RECOVERY_CHANNEL = "janu_boot_recovery_channel";
    private static final int BOOT_NOTIFICATION_ID = 4103;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        // Strictly respect user privacy: never start if user turned Always Active OFF
        if (!JanuAlwaysActivePrefs.isAlwaysActiveEnabled(context)) {
            return;
        }

        boolean hasMicPerm =
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;

        if (!hasMicPerm) {
            postResumeNotification(
                context,
                "মাইক্রোফোন অনুমতি দিয়ে Janu AI Always Active পুনরায় চালু করুন।"
            );
            return;
        }

        try {
            Intent serviceIntent = new Intent(context, JanuAlwaysActiveService.class);
            serviceIntent.setAction(JanuAlwaysActiveService.ACTION_START_OR_SYNC);
            ContextCompat.startForegroundService(context, serviceIntent);
        } catch (Exception e) {
            // Android 14+ (API 34+) restricts background BOOT_COMPLETED from directly launching
            // foregroundServiceType="microphone" until user interacts with notification or opens app.
            postResumeNotification(
                context,
                "ফোন রিস্টার্ট হয়েছে — ট্যাপ করলেই Janu AI Always Active আবার সক্রিয় হবে।"
            );
        }
    }

    private void postResumeNotification(Context context, String message) {
        try {
            NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel ch = new NotificationChannel(
                    BOOT_RECOVERY_CHANNEL,
                    "Janu AI Boot Recovery",
                    NotificationManager.IMPORTANCE_HIGH
                );
                ch.setDescription("Restores Janu AI Always Active Voice Assistant after reboot");
                nm.createNotificationChannel(ch);
            }

            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.putExtra("auto_resume_always_active", true);
            openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent =
                PendingIntent.getActivity(context, 99, openIntent, piFlags);

            NotificationCompat.Builder builder =
                new NotificationCompat.Builder(context, BOOT_RECOVERY_CHANNEL)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("Janu AI Always Active")
                    .setContentText(message)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent);

            nm.notify(BOOT_NOTIFICATION_ID, builder.build());
        } catch (Exception ignored) {
        }
    }
}
