package com.wrightwayz.aicentre;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;

final class Tool {
    final String name, company, category, description, url, platform, price;
    final boolean sponsored;
    final String keywords;

    Tool(JSONObject json) {
        name = json.optString("name").trim();
        company = json.optString("company", "Independent").trim();
        category = json.optString("category", "utility").trim();
        description = json.optString("description").trim();
        url = json.optString("url").trim();
        platform = json.optString("platform", "Online").trim();
        price = json.optString("price", "Check provider").trim();
        sponsored = json.optBoolean("sponsored", false);
        StringBuilder builder = new StringBuilder();
        JSONArray tags = json.optJSONArray("tags");
        if (tags != null) for (int i = 0; i < tags.length(); i++) {
            builder.append(' ').append(tags.optString(i));
        }
        keywords = (name + " " + company + " " + category + " " +
                    description + " " + platform + builder).toLowerCase(Locale.ROOT);
    }

    boolean valid() {
        return !name.isEmpty() && url.startsWith("https://") && url.length() < 2048;
    }

    String id() { return url; }
}
