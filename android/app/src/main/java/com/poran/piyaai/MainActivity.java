package com.poran.piyaai;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PiyaDeviceControlPlugin.class);
        super.onCreate(savedInstanceState);
        ensureAlwaysActiveRestoredIfEnabled();
    }

    @Override
    public void onResume() {
        super.onResume();
        ensureAlwaysActiveRestoredIfEnabled();
    }

    private void ensureAlwaysActiveRestoredIfEnabled() {
        if (!JanuAlwaysActivePrefs.isAlwaysActiveEnabled(this)) {
            return;
        }
        if (JanuAlwaysActiveService.isServiceRunning()) {
            return;
        }
        boolean hasMicPerm =
            ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        if (!hasMicPerm) {
            return;
        }
        try {
            Intent serviceIntent = new Intent(this, JanuAlwaysActiveService.class);
            serviceIntent.setAction(JanuAlwaysActiveService.ACTION_START_OR_SYNC);
            ContextCompat.startForegroundService(this, serviceIntent);
        } catch (Exception ignored) {
        }
    }
}
