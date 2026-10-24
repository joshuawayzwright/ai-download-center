package com.wrightwayz.aicentre;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    // WrightWayz: industrial charcoal, burnished gold, steel and restrained blue.
    private static final int BLACK = Color.rgb(16, 17, 20);
    private static final int CARD = Color.rgb(29, 32, 37);
    private static final int GOLD = Color.rgb(198, 161, 92);
    private static final int SILVER = Color.rgb(178, 186, 198);
    private static final int WHITE = Color.rgb(246, 247, 248);
    private static final int BLUE = Color.rgb(54, 169, 238);
    private static final int LINE = Color.rgb(64, 68, 75);
    private static final int RUST = Color.rgb(146, 83, 63);

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final List<Tool> catalog = new ArrayList<>();
    private final List<Tool> shown = new ArrayList<>();
    private final Set<String> saved = new HashSet<>();
    private final String[] featuredFilters = {
        "all", "android", "chatbot", "assistant", "llm",
        "image", "video", "audio", "code", "self-hosted", "utility"
    };
    private String category = "all";
    private boolean savedOnly;
    private boolean loading;
    private EditText searchInput;
    private LinearLayout filterGroup;
    private TextView counter, connection, allButton, savedButton;
    private ListView results;
    private final ItemAdapter adapter = new ItemAdapter();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BLACK);
        getWindow().setNavigationBarColor(BLACK);
        SharedPreferences prefs = getSharedPreferences("catalog", MODE_PRIVATE);
        saved.addAll(prefs.getStringSet("saved_urls", new HashSet<>()));
        buildScreen();
        readOffline();
    }

    private void buildScreen() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BLACK);
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(0, bars.top, 0, bars.bottom);
                return insets;
            });
        }
        setContentView(root);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(18), dp(15), dp(18), dp(10));
        root.addView(header, new LinearLayout.LayoutParams(-1, -2));

        TextView mark = label("W", 23, GOLD, true);
        mark.setGravity(Gravity.CENTER);
        mark.setBackground(shape(CARD, GOLD, 18));
        header.addView(mark, new LinearLayout.LayoutParams(dp(54), dp(54)));

        LinearLayout titles = vertical();
        titles.setPadding(dp(12), 0, 0, 0);
        header.addView(titles, new LinearLayout.LayoutParams(0, -2, 1f));
        titles.addView(label("WRIGHTWAYZ", 18, GOLD, true));
        titles.addView(label("AI DOWNLOAD CENTRE", 12, WHITE, true));
        titles.addView(label("BROKEN SYSTEMS. UNBREAKABLE BONDS.", 8, SILVER, false));

        TextView info = label("ⓘ", 24, BLUE, true);
        info.setGravity(Gravity.CENTER);
        info.setContentDescription("About WrightWayz AI Centre");
        header.addView(info, new LinearLayout.LayoutParams(dp(44), dp(44)));
        info.setOnClickListener(v -> showAbout());

        LinearLayout intro = vertical();
        intro.setPadding(dp(18), dp(4), dp(18), dp(12));
        root.addView(intro);
        intro.addView(label("DISCOVER. LEARN. BUILD.", 21, WHITE, true));
        TextView sub = label("A practical directory of AI tools, models and official project links.", 13, SILVER, false);
        sub.setPadding(0, dp(3), 0, dp(10));
        intro.addView(sub);

        searchInput = new EditText(this);
        searchInput.setSingleLine(true);
        searchInput.setTextColor(WHITE);
        searchInput.setHintTextColor(SILVER);
        searchInput.setHint("Search tools, models, companies...");
        searchInput.setTextSize(15);
        searchInput.setPadding(dp(14), dp(8), dp(14), dp(8));
        searchInput.setBackground(shape(CARD, LINE, 14));
        intro.addView(searchInput, new LinearLayout.LayoutParams(-1, dp(52)));
        searchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                applyFilter();
            }
            @Override public void afterTextChanged(Editable editable) {}
        });

        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(-1, dp(51));
        root.addView(scroll, scrollParams);
        filterGroup = new LinearLayout(this);
        filterGroup.setGravity(Gravity.CENTER_VERTICAL);
        filterGroup.setPadding(dp(14), 0, dp(14), 0);
        scroll.addView(filterGroup);
        rebuildFilters();

        LinearLayout options = new LinearLayout(this);
        options.setGravity(Gravity.CENTER_VERTICAL);
        options.setPadding(dp(18), dp(3), dp(18), dp(5));
        root.addView(options, new LinearLayout.LayoutParams(-1, dp(51)));

        allButton = tab("EXPLORE");
        savedButton = tab("★ SAVED");
        options.addView(allButton, new LinearLayout.LayoutParams(0, dp(38), 1f));
        LinearLayout.LayoutParams savedParams = new LinearLayout.LayoutParams(0, dp(38), 1f);
        savedParams.setMargins(dp(8), 0, dp(8), 0);
        options.addView(savedButton, savedParams);
        TextView refresh = label("↻", 26, BLUE, true);
        refresh.setGravity(Gravity.CENTER);
        refresh.setContentDescription("Refresh catalogue");
        options.addView(refresh, new LinearLayout.LayoutParams(dp(42), dp(42)));
        allButton.setOnClickListener(v -> { savedOnly = false; applyFilter(); });
        savedButton.setOnClickListener(v -> { savedOnly = true; applyFilter(); });
        refresh.setOnClickListener(v -> refresh());

        LinearLayout details = new LinearLayout(this);
        details.setGravity(Gravity.CENTER_VERTICAL);
        details.setPadding(dp(20), 0, dp(18), dp(8));
        root.addView(details);
        counter = label("Loading catalog...", 12, SILVER, false);
        details.addView(counter, new LinearLayout.LayoutParams(0, -2, 1f));
        connection = label("OFFLINE FIRST", 10, GOLD, true);
        details.addView(connection);

        results = new ListView(this);
        results.setDivider(null);
        results.setBackgroundColor(BLACK);
        results.setCacheColorHint(BLACK);
        results.setClipToPadding(false);
        results.setPadding(dp(12), 0, dp(12), dp(12));
        results.setAdapter(adapter);
        results.setOnItemClickListener((parent, view, position, id) -> {
            if (position >= 0 && position < shown.size()) showItem(shown.get(position));
        });
        root.addView(results, new LinearLayout.LayoutParams(-1, 0, 1f));

        TextView footer = label("#WEWALKASONE   •   WRIGHTWAYZ", 11, GOLD, true);
        footer.setGravity(Gravity.CENTER);
        footer.setPadding(dp(8), dp(10), dp(8), dp(10));
        footer.setBackgroundColor(CARD);
        root.addView(footer, new LinearLayout.LayoutParams(-1, dp(40)));
        footer.setOnClickListener(v -> openUrl("https://wrightwayz.com"));
    }

    private void readOffline() {
        connection.setText("OPENING CATALOGUE");
        worker.execute(() -> {
            try {
                List<Tool> items = CatalogRepository.loadOffline(this);
                runOnUiThread(() -> {
                    setCatalog(items);
                    connection.setText("OFFLINE READY");
                    refresh();
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    counter.setText("Offline catalogue unavailable");
                    connection.setText("RETRY ONLINE");
                    refresh();
                });
            }
        });
    }

    private void refresh() {
        if (loading) return;
        loading = true;
        connection.setText("SYNCING...");
        worker.execute(() -> {
            try {
                List<Tool> items = CatalogRepository.refresh(this);
                runOnUiThread(() -> {
                    loading = false;
                    setCatalog(items);
                    connection.setText("LIVE CATALOGUE");
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    loading = false;
                    connection.setText(catalog.isEmpty() ? "CONNECT TO RETRY" : "OFFLINE READY");
                });
            }
        });
    }

    private void setCatalog(List<Tool> items) {
        catalog.clear();
        catalog.addAll(items);
        rebuildFilters();
        applyFilter();
    }

    private void applyFilter() {
        if (searchInput == null || counter == null) return;
        String query = searchInput.getText().toString().trim().toLowerCase(Locale.ROOT);
        shown.clear();
        for (Tool tool : catalog) {
            if (!category.equals("all") && !category.equals(tool.category)
                    && !tool.keywords.contains(category)) continue;
            if (savedOnly && !saved.contains(tool.id())) continue;
            if (!tool.keywords.contains(query)) continue;
            shown.add(tool);
        }
        shown.sort((a,b) -> Boolean.compare(b.sponsored, a.sponsored));
        counter.setText(shown.size() + " RESULTS  •  " + catalog.size() + " CATALOGUE ENTRIES");
        allButton.setBackground(shape(savedOnly ? CARD : GOLD, savedOnly ? LINE : GOLD, 10));
        allButton.setTextColor(savedOnly ? SILVER : BLACK);
        savedButton.setBackground(shape(savedOnly ? GOLD : CARD, savedOnly ? GOLD : LINE, 10));
        savedButton.setTextColor(savedOnly ? BLACK : SILVER);
        adapter.notifyDataSetChanged();
    }

    private void rebuildFilters() {
        if (filterGroup == null) return;
        filterGroup.removeAllViews();
        for (String filter : featuredFilters) {
            if (!filter.equals("all")) {
                boolean exists = false;
                for (Tool t : catalog) if (t.category.equals(filter) || t.keywords.contains(filter)) {
                    exists = true; break;
                }
                if (!catalog.isEmpty() && !exists) continue;
            }
            String title = filter.equals("all") ? "ALL TOOLS" : filter.replace('-', ' ').toUpperCase(Locale.ROOT);
            TextView chip = label(title, 11, category.equals(filter) ? BLACK : SILVER, true);
            chip.setGravity(Gravity.CENTER);
            chip.setPadding(dp(15), dp(9), dp(15), dp(9));
            chip.setBackground(shape(category.equals(filter) ? GOLD : CARD,
                category.equals(filter) ? GOLD : LINE, 26));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, dp(35));
            params.setMargins(dp(4), 0, dp(4), 0);
            filterGroup.addView(chip, params);
            chip.setOnClickListener(v -> {
                category = filter;
                rebuildFilters();
                applyFilter();
            });
        }
    }

    private void showItem(Tool tool) {
        String info = tool.company + "\n" + tool.category.toUpperCase(Locale.ROOT) +
            "  •  " + tool.platform + "\n" + tool.price +
            (tool.sponsored ? "\nSponsored placement" : "") + "\n\n" +
            tool.description + "\n\nAlways check the provider's own licensing, pricing and safety information.";
        String saveTitle = saved.contains(tool.id()) ? "Remove favourite" : "Save favourite";
        new AlertDialog.Builder(this)
            .setTitle(tool.name)
            .setMessage(info)
            .setPositiveButton("Visit listed source", (d, which) -> openUrl(tool.url))
            .setNeutralButton(saveTitle, (d, which) -> {
                if (!saved.add(tool.id())) saved.remove(tool.id());
                getSharedPreferences("catalog", MODE_PRIVATE).edit()
                    .putStringSet("saved_urls", new HashSet<>(saved)).apply();
                applyFilter();
            })
            .setNegativeButton("Share", (d, which) -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, tool.name + "\n" + tool.url);
                startActivity(Intent.createChooser(send, "Share tool"));
            }).show();
    }

    private void showAbout() {
        new AlertDialog.Builder(this)
            .setTitle("WrightWayz AI Download Centre")
            .setMessage("Broken Systems. Unbreakable Bonds.\n\n" +
                "Find AI apps, model cards, project pages and learning resources. " +
                "Search and favourites work offline using the bundled GitHub catalogue.\n\n" +
                "External tools are operated by their own providers. Links are not app-installation " +
                "files and every tool must be checked before use.\n\n" +
                "WrightWayz is a community organisation, not an emergency or clinical service.")
            .setPositiveButton("WrightWayz", (d, w) -> openUrl("https://wrightwayz.com"))
            .setNeutralButton("Catalog GitHub", (d, w) ->
                openUrl("https://github.com/joshuawayzwright/ai-download-center"))
            .setNegativeButton("Close", null)
            .show();
    }

    private void openUrl(String url) {
        if (!url.startsWith("https://")) return;
        try {
            Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(browser);
        } catch (Exception exception) {
            new AlertDialog.Builder(this).setMessage("No browser is available to open this link.")
                .setPositiveButton("OK", null).show();
        }
    }

    private TextView tab(String text) {
        TextView view = label(text, 12, SILVER, true);
        view.setGravity(Gravity.CENTER);
        return view;
    }

    private LinearLayout vertical() {
        LinearLayout result = new LinearLayout(this);
        result.setOrientation(LinearLayout.VERTICAL);
        return result;
    }

    private TextView label(String text, int sp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(color);
        view.setTextSize(sp);
        view.setIncludeFontPadding(true);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable shape(int fill, int stroke, int radius) {
        GradientDrawable result = new GradientDrawable();
        result.setColor(fill);
        result.setCornerRadius(dp(radius));
        result.setStroke(dp(1), stroke);
        return result;
    }

    private int dp(int size) {
        return (int) (size * getResources().getDisplayMetrics().density + .5f);
    }

    private final class ItemAdapter extends BaseAdapter {
        @Override public int getCount() { return shown.size(); }
        @Override public Object getItem(int position) { return shown.get(position); }
        @Override public long getItemId(int position) { return position; }

        @Override public View getView(int position, View recycled, ViewGroup parent) {
            Tool tool = shown.get(position);
            LinearLayout outside = vertical();
            outside.setPadding(dp(3), dp(3), dp(3), dp(8));
            LinearLayout card = vertical();
            card.setPadding(dp(15), dp(13), dp(15), dp(14));
            card.setBackground(shape(CARD, LINE, 16));
            outside.addView(card);

            LinearLayout top = new LinearLayout(MainActivity.this);
            top.setGravity(Gravity.CENTER_VERTICAL);
            card.addView(top);
            TextView kind = label(tool.category.toUpperCase(Locale.ROOT), 10, BLUE, true);
            top.addView(kind, new LinearLayout.LayoutParams(0, -2, 1f));
            if (tool.sponsored) {
                TextView paid = label("SPONSORED", 9, GOLD, true);
                top.addView(paid);
            }
            if (saved.contains(tool.id())) {
                TextView favourite = label("  ★", 16, GOLD, true);
                top.addView(favourite);
            }

            TextView title = label(tool.name, 18, WHITE, true);
            title.setPadding(0, dp(7), 0, dp(2));
            title.setMaxLines(2);
            card.addView(title);

            TextView company = label(tool.company + "  ·  " + tool.platform, 12, GOLD, false);
            company.setMaxLines(1);
            card.addView(company);

            TextView description = label(tool.description, 13, SILVER, false);
            description.setPadding(0, dp(7), 0, dp(9));
            description.setMaxLines(3);
            card.addView(description);

            LinearLayout bottom = new LinearLayout(MainActivity.this);
            bottom.setGravity(Gravity.CENTER_VERTICAL);
            card.addView(bottom);
            TextView price = label(tool.price, 11, SILVER, true);
            bottom.addView(price, new LinearLayout.LayoutParams(0, -2, 1f));
            bottom.addView(label("VIEW SOURCE  ↗", 11, GOLD, true));
            return outside;
        }
    }

    @Override protected void onDestroy() {
        worker.shutdownNow();
        super.onDestroy();
    }
}
