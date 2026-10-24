package com.wrightwayz.aicentre;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class CatalogRepository {
    private static final String CATALOG_URL =
        "https://raw.githubusercontent.com/joshuawayzwright/ai-download-center/main/data/tools.json";
    private static final String CACHE_FILE = "wrightwayz_tools_cache.json";
    private static final int MAX_BYTES = 4_000_000;

    // No account, API key, tracking SDK or backend required.
    static List<Tool> loadOffline(Context context) throws Exception {
        File cached = new File(context.getFilesDir(), CACHE_FILE);
        if (cached.isFile()) {
            try (InputStream in = new FileInputStream(cached)) {
                return parse(read(in));
            } catch (Exception ignored) {
                // A damaged cache must never prevent first launch.
            }
        }
        try (InputStream in = context.getAssets().open("tools.json")) {
            return parse(read(in));
        }
    }

    static List<Tool> refresh(Context context) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(CATALOG_URL).openConnection();
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "WrightWayz-AI-Centre/1.0");
        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK)
                throw new IllegalStateException("HTTP " + connection.getResponseCode());
            String raw;
            try (InputStream in = connection.getInputStream()) { raw = read(in); }
            List<Tool> items = parse(raw); // Validate before replacing local cache.
            File dest = new File(context.getFilesDir(), CACHE_FILE);
            File temp = new File(context.getFilesDir(), CACHE_FILE + ".tmp");
            try (FileOutputStream out = new FileOutputStream(temp)) {
                out.write(raw.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            }
            if (!temp.renameTo(dest)) {
                // Continue showing the validated in-memory data even if caching fails.
                temp.delete();
            }
            return items;
        } finally {
            connection.disconnect();
        }
    }

    private static String read(InputStream input) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] bytes = new byte[8192];
        int count;
        while ((count = input.read(bytes)) != -1) {
            if (buffer.size() + count > MAX_BYTES) throw new IllegalStateException("Catalog too large");
            buffer.write(bytes, 0, count);
        }
        return buffer.toString("UTF-8");
    }

    private static List<Tool> parse(String raw) throws Exception {
        JSONArray entries = new JSONObject(raw).getJSONArray("tools");
        List<Tool> list = new ArrayList<>();
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.optJSONObject(i);
            if (entry == null) continue;
            Tool item = new Tool(entry);
            if (item.valid()) list.add(item);
        }
        if (list.isEmpty()) throw new IllegalStateException("Catalog has no usable listings");
        return list;
    }

    private CatalogRepository() {}
}
