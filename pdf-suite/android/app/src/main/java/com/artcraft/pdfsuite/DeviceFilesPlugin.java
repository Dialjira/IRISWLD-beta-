package com.artcraft.pdfsuite;

import android.Manifest;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Búsqueda profunda de documentos (PDF y Word) en todo el almacenamiento del teléfono.
 * En Android 11+ necesita el permiso "Acceso a todos los archivos"; en versiones anteriores, el de lectura.
 */
@CapacitorPlugin(
    name = "DeviceFiles",
    permissions = { @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }) }
)
public class DeviceFilesPlugin extends Plugin {

    private static final int MAX_FILES = 20000;
    private static final int MAX_DEPTH = 14;
    private static final long MAX_READ = 120L * 1024 * 1024;

    private boolean hasFullAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return Environment.isExternalStorageManager();
        return getPermissionState("storage") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void hasAccess(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", hasFullAccess());
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (hasFullAccess()) { hasAccess(call); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent;
            try {
                intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            } catch (Exception e) {
                intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
            }
            startActivityForResult(call, intent, "accessResult");
        } else {
            requestPermissionForAlias("storage", call, "permissionResult");
        }
    }

    @ActivityCallback
    private void accessResult(PluginCall call, ActivityResult result) { if (call != null) hasAccess(call); }

    @PermissionCallback
    private void permissionResult(PluginCall call) { hasAccess(call); }

    @PluginMethod
    public void scan(PluginCall call) {
        if (!hasFullAccess()) { call.reject("Sin permiso de acceso a los archivos", "NO_ACCESS"); return; }
        new Thread(() -> {
            try {
                JSArray out = new JSArray();
                Set<String> seen = new HashSet<>();
                int[] dirs = { 0 };
                // 1) recorrido de carpetas: almacenamiento interno y tarjetas SD
                Set<File> roots = new HashSet<>();
                roots.add(Environment.getExternalStorageDirectory());
                File[] ext = getContext().getExternalFilesDirs(null);
                if (ext != null) for (File f : ext) {
                    if (f == null) continue;
                    String p = f.getAbsolutePath();
                    int i = p.indexOf("/Android/");
                    if (i > 0) roots.add(new File(p.substring(0, i)));
                }
                for (File root : roots) walk(root, 0, out, seen, dirs);
                // 2) índice de Android (encuentra archivos en rutas que el recorrido no alcanzó)
                queryMediaStore(out, seen);
                JSObject r = new JSObject();
                r.put("files", out);
                r.put("dirs", dirs[0]);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Error al buscar: " + e.getMessage());
            }
        }).start();
    }

    private static String extOf(String name) {
        int i = name.lastIndexOf('.');
        return i < 0 ? "" : name.substring(i + 1).toLowerCase(Locale.ROOT);
    }

    private static boolean wanted(String ext) {
        return ext.equals("pdf") || ext.equals("docx") || ext.equals("doc");
    }

    private void add(File f, JSArray out, Set<String> seen) {
        String path = f.getAbsolutePath();
        if (seen.contains(path) || out.length() >= MAX_FILES) return;
        seen.add(path);
        JSObject o = new JSObject();
        o.put("path", path);
        o.put("name", f.getName());
        o.put("size", f.length());
        o.put("modified", f.lastModified());
        o.put("ext", extOf(f.getName()));
        File parent = f.getParentFile();
        o.put("folder", parent != null ? parent.getAbsolutePath() : "");
        out.put(o);
    }

    private void walk(File dir, int depth, JSArray out, Set<String> seen, int[] dirs) {
        if (dir == null || depth > MAX_DEPTH || out.length() >= MAX_FILES) return;
        String name = dir.getName();
        String path = dir.getAbsolutePath();
        // carpetas internas de apps, ocultas y papelera: lentas y sin documentos del usuario
        if (depth > 0 && (name.startsWith(".") || path.endsWith("/Android/data") || path.endsWith("/Android/obb"))) return;
        File[] list = dir.listFiles();
        if (list == null) return;
        dirs[0]++;
        if (dirs[0] % 200 == 0) {
            JSObject ev = new JSObject();
            ev.put("dirs", dirs[0]);
            ev.put("found", out.length());
            ev.put("current", path);
            notifyListeners("scanProgress", ev);
        }
        for (File f : list) {
            if (f.isDirectory()) walk(f, depth + 1, out, seen, dirs);
            else if (wanted(extOf(f.getName())) && f.length() > 0) add(f, out, seen);
        }
    }

    @SuppressWarnings("deprecation")
    private void queryMediaStore(JSArray out, Set<String> seen) {
        Uri uri = MediaStore.Files.getContentUri("external");
        String[] proj = { MediaStore.Files.FileColumns.DATA };
        String sel = MediaStore.Files.FileColumns.MIME_TYPE + " IN (?,?,?) OR " + MediaStore.Files.FileColumns.DATA + " LIKE ? OR " + MediaStore.Files.FileColumns.DATA + " LIKE ?";
        String[] args = { "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "%.pdf", "%.docx" };
        try (Cursor c = getContext().getContentResolver().query(uri, proj, sel, args, null)) {
            if (c == null) return;
            while (c.moveToNext() && out.length() < MAX_FILES) {
                String p = c.getString(0);
                if (p == null) continue;
                File f = new File(p);
                if (f.isFile() && wanted(extOf(f.getName()))) add(f, out, seen);
            }
        } catch (Exception ignored) { }
    }

    @PluginMethod
    public void read(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("Falta la ruta"); return; }
        new Thread(() -> {
            File f = new File(path);
            if (!f.isFile()) { call.reject("El archivo ya no existe"); return; }
            if (f.length() > MAX_READ) { call.reject("El archivo es demasiado grande (más de 120 MB)"); return; }
            try (InputStream in = new FileInputStream(f); ByteArrayOutputStream bo = new ByteArrayOutputStream((int) f.length())) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                JSObject r = new JSObject();
                r.put("data", Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
                call.resolve(r);
            } catch (Exception e) {
                call.reject("No se pudo leer el archivo: " + e.getMessage());
            }
        }).start();
    }
}
