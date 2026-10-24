package com.artcraft.pdfsuite;

import android.content.Context;
import android.media.AudioManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Indica si el teléfono está en modo normal, vibración o silencio (para el sonido del escáner). */
@CapacitorPlugin(name = "DeviceSound")
public class DeviceSoundPlugin extends Plugin {

    @PluginMethod
    public void getRingerMode(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int mode = am != null ? am.getRingerMode() : AudioManager.RINGER_MODE_SILENT;
        JSObject ret = new JSObject();
        ret.put("mode", mode == AudioManager.RINGER_MODE_NORMAL ? "normal" : mode == AudioManager.RINGER_MODE_VIBRATE ? "vibrate" : "silent");
        call.resolve(ret);
    }
}
