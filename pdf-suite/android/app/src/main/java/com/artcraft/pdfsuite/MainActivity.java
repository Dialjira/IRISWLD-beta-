package com.artcraft.pdfsuite;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeviceSoundPlugin.class);
        registerPlugin(DeviceFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
