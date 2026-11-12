package au.com.thesoloserviceprovider.solo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** SOLO AI chat screen. Talks only to the shared SOLO API; holds no provider secrets. */
public final class MainActivity extends Activity {
  private static final String SITE = "https://thesoloserviceprovider.com.au";
  private static final String AI_HUB = "https://joshuawayzwright.github.io/ai-download-center/";
  private static final String INTEREST =
      "mailto:hello@thesoloserviceprovider.com.au?subject=SOLO%20AI%20Android%20early%20access";
  private static final String STATE_KEY = "solo_state";
  /** Test-only endpoint override; always null in the shipped app. */
  static volatile String endpointOverride;

  private enum Service { CHECKING, READY, CLOSED, OFFLINE, SIGNED_OUT }

  /** Report reasons accepted by /api/solo-report, in display order. */
  private static final String[] REPORT_REASONS = {"harmful", "hateful", "sexual", "misleading", "other"};

  /** One visible transcript entry. */
  private static final class Entry {
    final String kind; // user | solo | error
    final String text;
    final String draft; // for error entries: the unsent user text
    final String requestId; // for signed-in solo replies: the reportable request

    Entry(String kind, String text, String draft) {
      this(kind, text, draft, null);
    }

    Entry(String kind, String text, String draft, String requestId) {
      this.kind = kind;
      this.text = text;
      this.draft = draft;
      this.requestId = requestId;
    }
  }

  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService worker = Executors.newSingleThreadExecutor();
  private final Conversation conversation = new Conversation();
  private final List<Entry> transcript = new ArrayList<>();
  private SoloApi api;
  private AccountApi account;
  private SessionStore session;
  /** True only when the server reports that app sign-in is switched on. */
  private boolean accountsEnabled;
  private Service service = Service.CHECKING;
  private String closedMessage;
  private boolean sending;
  private int generation;
  private Integer remainingDaily;

  private ScrollView scroll;
  private LinearLayout messages;
  private View welcome;
  private View statusCard;
  private TextView statusTitle;
  private TextView statusBody;
  private Button statusAction;
  private TextView subtitle;
  private EditText input;
  private ImageButton send;
  private TextView charCount;
  private View thinking;

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    setContentView(R.layout.activity_main);
    String endpoint = endpointOverride != null ? endpointOverride : BuildConfig.SOLO_API_URL;
    String agent = "SOLOAI-Android/" + BuildConfig.VERSION_NAME;
    session = new SessionStore(this);
    api = new SoloApi(endpoint, () -> session.accessToken(), agent);
    account = new AccountApi(endpoint, agent);

    scroll = findViewById(R.id.scroll);
    messages = findViewById(R.id.messages);
    welcome = findViewById(R.id.welcome);
    statusCard = findViewById(R.id.status_card);
    statusTitle = findViewById(R.id.status_title);
    statusBody = findViewById(R.id.status_body);
    statusAction = findViewById(R.id.status_action);
    subtitle = findViewById(R.id.header_subtitle);
    input = findViewById(R.id.input);
    send = findViewById(R.id.send);
    charCount = findViewById(R.id.char_count);

    applyEdgeToEdgeInsets(findViewById(R.id.root));
    findViewById(R.id.menu_button).setOnClickListener(this::showMenu);
    send.setOnClickListener(v -> submit(input.getText().toString()));
    input.addTextChangedListener(new TextWatcher() {
      @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
      @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
      @Override public void afterTextChanged(Editable s) { refreshComposer(); }
    });
    buildSuggestions();

    if (state != null) restore(state.getString(STATE_KEY));
    render();
    checkService();
  }

  @Override
  protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    try {
      JSONObject json = new JSONObject();
      JSONArray entries = new JSONArray();
      for (Entry e : transcript) {
        entries.put(new JSONObject().put("k", e.kind).put("t", e.text).put("d", e.draft).put("q", e.requestId));
      }
      JSONArray history = new JSONArray();
      for (Conversation.Message m : conversation.history()) {
        history.put(new JSONObject().put("r", m.role).put("c", m.content));
      }
      out.putString(STATE_KEY, json.put("entries", entries).put("history", history).toString());
    } catch (Exception ignored) {
      // Losing transcript state on process death is acceptable; never crash here.
    }
  }

  @Override
  protected void onDestroy() {
    generation++;
    worker.shutdownNow();
    super.onDestroy();
  }

  // ---- Service availability -------------------------------------------------

  private void checkService() {
    setService(Service.CHECKING, null);
    final int gen = generation;
    worker.execute(() -> {
      int status = api.probe();
      AccountApi.Status accountStatus = null;
      if (status != 0 && status != 404 && status != 410) {
        String token = currentAccessToken();
        accountStatus = account.status(token);
        if (accountStatus.httpStatus == 401) {
          session.clear();
          accountStatus = account.status(null);
        }
      }
      final AccountApi.Status st = accountStatus;
      main.post(() -> {
        if (gen != generation || isFinishing()) return;
        accountsEnabled = st != null && st.enabled;
        if (st != null && st.enabled && !st.authenticated && session.hasSession()) session.clear();
        if (status == 0) setService(Service.OFFLINE, null);
        else if (status == 404 || status == 410) setService(Service.CLOSED, null);
        else if (accountsEnabled && !st.authenticated) setService(Service.SIGNED_OUT, null);
        else setService(Service.READY, null);
      });
    });
  }

  /** Returns a usable access token, refreshing once if only a refresh token is held. Worker thread only. */
  private String currentAccessToken() {
    String token = session.accessToken();
    if (token != null) return token;
    String refresh = session.refreshToken();
    if (refresh == null) return null;
    AccountApi.SignIn renewed = account.refresh(refresh);
    if (renewed.ok()) {
      session.save(renewed.accessToken, renewed.refreshToken, renewed.expiresIn, renewed.status.email);
      return renewed.accessToken;
    }
    // A definite rejection ends the session; a network failure keeps it for later.
    if (renewed.status.httpStatus == 401 || renewed.status.httpStatus == 403) session.clear();
    return null;
  }

  private void setService(Service next, String message) {
    service = next;
    closedMessage = message;
    switch (next) {
      case CHECKING:
        subtitle.setText(R.string.status_checking);
        statusCard.setVisibility(View.GONE);
        break;
      case READY:
        updateSubtitle();
        statusCard.setVisibility(View.GONE);
        break;
      case CLOSED:
        subtitle.setText(R.string.tagline);
        statusTitle.setText(R.string.status_unavailable_title);
        statusBody.setText(message != null ? message : getString(R.string.status_unavailable_body));
        statusAction.setText(R.string.status_express_interest);
        statusAction.setOnClickListener(v -> open(INTEREST));
        statusCard.setVisibility(View.VISIBLE);
        break;
      case SIGNED_OUT:
        subtitle.setText(R.string.tagline);
        statusTitle.setText(R.string.status_sign_in_title);
        statusBody.setText(message != null ? message : getString(R.string.status_sign_in_body));
        statusAction.setText(R.string.sign_in);
        statusAction.setOnClickListener(v -> showSignIn());
        statusCard.setVisibility(View.VISIBLE);
        break;
      case OFFLINE:
        subtitle.setText(R.string.tagline);
        statusTitle.setText(R.string.status_offline_title);
        statusBody.setText(R.string.status_offline_body);
        statusAction.setText(R.string.status_try_again);
        statusAction.setOnClickListener(v -> checkService());
        statusCard.setVisibility(View.VISIBLE);
        break;
    }
    render();
  }

  /** Server responses that mean conversations are switched off, not a transient failure. */
  static boolean meansClosed(SoloApi.Result r) {
    if (r.status == 404 || r.status == 410) return true;
    if (r.status == 503) {
      return r.code == null || "customer_disabled".equals(r.code) || "private_testing_disabled".equals(r.code);
    }
    // A signed-in account without (or no longer with) SOLO access.
    if (r.status == 403) {
      return "access_denied".equals(r.code) || "member_expired".equals(r.code) || "member_blocked".equals(r.code);
    }
    // 401 without a code is the owner-only private test gate.
    return r.status == 401 && r.code == null;
  }

  // ---- Sending --------------------------------------------------------------

  private void submit(String raw) {
    String text = raw == null ? "" : raw.trim();
    if (sending || service != Service.READY || Conversation.validateDraft(text) != null) return;
    final Conversation.Request request;
    try {
      request = conversation.prepare(text, UUID.randomUUID().toString());
    } catch (Exception e) {
      Toast.makeText(this, "Message is too long to send.", Toast.LENGTH_SHORT).show();
      return;
    }
    removeTrailingError();
    transcript.add(new Entry("user", text, null));
    input.setText("");
    sending = true;
    render();
    final int gen = generation;
    final boolean signedIn = session.hasSession();
    worker.execute(() -> {
      Conversation.Request attempt = request;
      if (signedIn) currentAccessToken();
      SoloApi.Result first = api.send(attempt);
      SoloApi.Result outcome = first;
      // An expired access token is rejected before any quota is used, so one
      // refresh and resend (with a fresh request ID) is safe.
      if (signedIn && first.status == 401 && session.refreshToken() != null) {
        session.invalidateAccess();
        if (currentAccessToken() != null) {
          try {
            attempt = conversation.prepare(text, UUID.randomUUID().toString());
            outcome = api.send(attempt);
          } catch (Exception ignored) {
            // Keep the first result.
          }
        }
      }
      final SoloApi.Result result = outcome;
      final Conversation.Request sent = attempt;
      main.post(() -> {
        if (gen != generation || isFinishing()) return;
        sending = false;
        if (result.ok) {
          conversation.commit(sent, result.reply);
          transcript.add(new Entry("solo", result.reply, null, signedIn ? sent.requestId : null));
          if (result.remainingDaily != null) remainingDaily = result.remainingDaily;
          updateSubtitle();
          render();
          return;
        }
        // Failed turns never join the history. Keep the text for retry.
        transcript.remove(transcript.size() - 1);
        if (signedIn && result.status == 401) {
          session.clear();
          if (input.getText().length() == 0) input.setText(text);
          setService(accountsEnabled ? Service.SIGNED_OUT : Service.CLOSED, result.error);
          return;
        }
        if (meansClosed(result)) {
          if (input.getText().length() == 0) input.setText(text);
          setService(Service.CLOSED, result.error);
          return;
        }
        transcript.add(new Entry("error", result.error, text));
        render();
      });
    });
  }

  private void retry(String draft) {
    removeTrailingError();
    submit(draft);
  }

  private void removeTrailingError() {
    int last = transcript.size() - 1;
    if (last >= 0 && "error".equals(transcript.get(last).kind)) transcript.remove(last);
  }

  private void newConversation() {
    generation++;
    sending = false;
    conversation.clear();
    transcript.clear();
    input.setText("");
    checkService();
  }

  // ---- Rendering ------------------------------------------------------------

  private void render() {
    // Keep the welcome block (index 0) and rebuild the transcript below it.
    while (messages.getChildCount() > 1) messages.removeViewAt(1);
    boolean empty = transcript.isEmpty() && !sending;
    welcome.setVisibility(empty || service == Service.CLOSED || service == Service.OFFLINE
        || service == Service.SIGNED_OUT ? View.VISIBLE : View.GONE);
    findViewById(R.id.suggestions).setVisibility(empty && service == Service.READY ? View.VISIBLE : View.GONE);
    for (Entry e : transcript) messages.addView(bubble(e));
    if (sending) {
      thinking = bubble(new Entry("thinking", getString(R.string.thinking), null));
      thinking.animate().alpha(0.45f).setDuration(700).withEndAction(this::pulse).start();
      messages.addView(thinking);
    } else {
      thinking = null;
    }
    refreshComposer();
    scroll.post(() -> scroll.smoothScrollTo(0, messages.getHeight()));
  }

  private void pulse() {
    View v = thinking;
    if (v == null || !sending) return;
    float target = v.getAlpha() < 0.7f ? 1f : 0.45f;
    v.animate().alpha(target).setDuration(700).withEndAction(this::pulse).start();
  }

  private View bubble(Entry e) {
    boolean error = "error".equals(e.kind);
    boolean user = "user".equals(e.kind);
    LinearLayout row = new LinearLayout(this);
    row.setOrientation(LinearLayout.VERTICAL);
    row.setGravity(user || error ? Gravity.END : Gravity.START);
    LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    rowParams.topMargin = dp(user || error ? 14 : 8);
    row.setLayoutParams(rowParams);

    if (!user && !error) {
      TextView label = new TextView(this);
      label.setText(R.string.solo);
      label.setTextColor(getColor(R.color.solo_gold));
      label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
      label.setPadding(dp(4), 0, 0, dp(4));
      label.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
      row.addView(label, wrap());
    }

    // A failed turn shows the unsent text as a dimmed user bubble, then the error.
    TextView body = bubbleText(error ? e.draft : e.text);
    if (user || error) {
      body.setBackgroundResource(R.drawable.bubble_user);
      body.setTextColor(getColor(R.color.solo_on_gold));
      body.setContentDescription(getString(R.string.cd_user_message, error ? e.draft : e.text));
      if (error) body.setAlpha(0.55f);
      else body.setOnLongClickListener(v -> copy(e.text));
    } else {
      body.setBackgroundResource(R.drawable.bubble_solo);
      boolean thinkingEntry = "thinking".equals(e.kind);
      body.setTextColor(getColor(thinkingEntry ? R.color.solo_text_muted : R.color.solo_text));
      if (thinkingEntry) {
        body.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
      } else {
        body.setContentDescription(getString(R.string.cd_solo_message, e.text));
        body.setTextIsSelectable(true);
        body.setOnLongClickListener(v -> copy(e.text));
      }
    }
    row.addView(body, wrap());

    if ("solo".equals(e.kind) && e.requestId != null && session.hasSession()) {
      Button report = new Button(this, null, android.R.attr.borderlessButtonStyle);
      report.setText(R.string.report_reply);
      report.setAllCaps(false);
      report.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
      report.setMinWidth(0);
      report.setMinHeight(dp(40));
      report.setMinimumHeight(dp(40));
      report.setPadding(dp(4), 0, dp(4), 0);
      report.setTextColor(getColor(R.color.solo_steel));
      report.setContentDescription(getString(R.string.cd_report_reply));
      report.setOnClickListener(v -> showReport(e));
      row.addView(report, wrap());
    }

    if (error) {
      TextView message = new TextView(this);
      message.setText(e.text);
      message.setTextColor(getColor(R.color.solo_error));
      message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
      message.setGravity(Gravity.END);
      message.setPadding(dp(4), dp(6), dp(4), 0);
      message.setMaxWidth(maxBubbleWidth());
      message.setContentDescription(getString(R.string.cd_error_message, e.text));
      message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
      row.addView(message, wrap());
      Button retry = new Button(this, null, android.R.attr.borderlessButtonStyle);
      retry.setText(R.string.retry);
      retry.setAllCaps(false);
      retry.setMinWidth(dp(64));
      retry.setTextColor(getColor(R.color.solo_gold));
      retry.setOnClickListener(v -> retry(e.draft));
      row.addView(retry, wrap());
    }
    return row;
  }

  private TextView bubbleText(String text) {
    TextView body = new TextView(this);
    body.setText(text);
    body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
    body.setLineSpacing(dp(2), 1f);
    body.setMaxWidth(maxBubbleWidth());
    body.setPadding(dp(14), dp(10), dp(14), dp(10));
    return body;
  }

  private int maxBubbleWidth() {
    return (int) (getResources().getDisplayMetrics().widthPixels * 0.82f);
  }

  private static LinearLayout.LayoutParams wrap() {
    return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
  }

  private void buildSuggestions() {
    LinearLayout box = findViewById(R.id.suggestions);
    int[] ids = {R.string.suggestion_1, R.string.suggestion_2, R.string.suggestion_3};
    for (int id : ids) {
      TextView chip = new TextView(this);
      chip.setText(id);
      chip.setTextColor(getColor(R.color.solo_text));
      chip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
      chip.setBackgroundResource(R.drawable.chip_bg);
      chip.setPadding(dp(16), dp(12), dp(16), dp(12));
      chip.setMinHeight(dp(48));
      chip.setGravity(Gravity.CENTER_VERTICAL);
      chip.setClickable(true);
      chip.setFocusable(true);
      chip.setOnClickListener(v -> submit(getString(id)));
      LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
      p.topMargin = dp(8);
      box.addView(chip, p);
    }
  }

  private void refreshComposer() {
    boolean open = service == Service.READY;
    input.setEnabled(open);
    String text = input.getText().toString();
    send.setEnabled(open && !sending && Conversation.validateDraft(text) == null);
    send.setAlpha(send.isEnabled() ? 1f : 0.5f);
    int length = text.length();
    charCount.setVisibility(length > 1000 ? View.VISIBLE : View.GONE);
    charCount.setText(getString(R.string.char_count, length));
  }

  private void updateSubtitle() {
    if (service != Service.READY) return;
    if (remainingDaily != null) subtitle.setText(getResources().getQuantityString(R.plurals.remaining_today, remainingDaily, remainingDaily));
    else subtitle.setText(R.string.tagline);
  }

  // ---- Menu, links, insets --------------------------------------------------

  private void showMenu(View anchor) {
    PopupMenu menu = new PopupMenu(this, anchor);
    menu.getMenu().add(0, 1, 0, R.string.menu_new_chat);
    menu.getMenu().add(0, 2, 1, R.string.menu_ai_hub);
    menu.getMenu().add(0, 3, 2, R.string.menu_privacy);
    menu.getMenu().add(0, 4, 3, R.string.menu_terms);
    menu.getMenu().add(0, 5, 4, R.string.menu_contact);
    if (accountsEnabled) {
      if (session.hasSession()) menu.getMenu().add(0, 7, 5, R.string.sign_out);
      else menu.getMenu().add(0, 6, 5, R.string.sign_in);
    }
    menu.setOnMenuItemClickListener(item -> {
      switch (item.getItemId()) {
        case 1: newConversation(); return true;
        case 2: open(AI_HUB); return true;
        case 3: open(SITE + "/privacy.html"); return true;
        case 4: open(SITE + "/terms.html"); return true;
        case 5: open(SITE + "/contact.html"); return true;
        case 6: showSignIn(); return true;
        case 7: signOut(); return true;
        default: return false;
      }
    });
    menu.show();
  }

  // ---- Accounts and reporting ------------------------------------------------

  private void showSignIn() {
    LinearLayout form = new LinearLayout(this);
    form.setOrientation(LinearLayout.VERTICAL);
    form.setPadding(dp(24), dp(8), dp(24), 0);
    TextView intro = new TextView(this);
    intro.setText(R.string.sign_in_intro);
    intro.setTextColor(getColor(R.color.solo_text_muted));
    intro.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
    form.addView(intro);
    EditText email = new EditText(this);
    email.setHint(R.string.email);
    email.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    email.setAutofillHints(View.AUTOFILL_HINT_EMAIL_ADDRESS);
    email.setTextColor(getColor(R.color.solo_text));
    email.setHintTextColor(getColor(R.color.solo_steel));
    if (session.email() != null) email.setText(session.email());
    form.addView(email);
    EditText password = new EditText(this);
    password.setHint(R.string.password);
    password.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
    password.setAutofillHints(View.AUTOFILL_HINT_PASSWORD);
    password.setTextColor(getColor(R.color.solo_text));
    password.setHintTextColor(getColor(R.color.solo_steel));
    form.addView(password);
    TextView error = new TextView(this);
    error.setTextColor(getColor(R.color.solo_error));
    error.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
    error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    error.setVisibility(View.GONE);
    form.addView(error);

    android.app.AlertDialog dialog = new android.app.AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
        .setTitle(R.string.sign_in)
        .setView(form)
        .setPositiveButton(R.string.sign_in, null)
        .setNegativeButton(android.R.string.cancel, null)
        .create();
    dialog.setOnShowListener(d -> {
      Button positive = dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE);
      positive.setOnClickListener(v -> {
        String address = email.getText().toString().trim();
        String secret = password.getText().toString();
        if (address.isEmpty() || secret.isEmpty()) {
          error.setText(R.string.sign_in_missing);
          error.setVisibility(View.VISIBLE);
          return;
        }
        positive.setEnabled(false);
        error.setVisibility(View.GONE);
        worker.execute(() -> {
          AccountApi.SignIn result = account.login(address, secret);
          if (result.ok()) {
            session.save(result.accessToken, result.refreshToken, result.expiresIn,
                result.status.email != null ? result.status.email : address);
          }
          main.post(() -> {
            if (isFinishing()) return;
            positive.setEnabled(true);
            if (!result.ok()) {
              error.setText(result.status.error);
              error.setVisibility(View.VISIBLE);
              return;
            }
            dialog.dismiss();
            remainingDaily = null;
            setService(Service.READY, null);
            checkService();
          });
        });
      });
    });
    dialog.show();
  }

  private void signOut() {
    final String access = session.accessToken();
    final String refresh = session.refreshToken();
    session.clear();
    generation++;
    sending = false;
    conversation.clear();
    transcript.clear();
    remainingDaily = null;
    worker.execute(() -> account.logout(access, refresh));
    Toast.makeText(this, R.string.signed_out, Toast.LENGTH_SHORT).show();
    checkService();
  }

  private void showReport(Entry entry) {
    final int[] choice = {0};
    String[] labels = getResources().getStringArray(R.array.report_reasons);
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(24), 0, dp(24), 0);
    EditText note = new EditText(this);
    note.setHint(R.string.report_note_hint);
    note.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
        | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    note.setFilters(new android.text.InputFilter[] {new android.text.InputFilter.LengthFilter(500)});
    note.setTextColor(getColor(R.color.solo_text));
    note.setHintTextColor(getColor(R.color.solo_steel));
    box.addView(note);
    TextView privacy = new TextView(this);
    privacy.setText(R.string.report_privacy);
    privacy.setTextColor(getColor(R.color.solo_text_muted));
    privacy.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
    box.addView(privacy);
    new android.app.AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
        .setTitle(R.string.report_title)
        .setSingleChoiceItems(labels, 0, (d, which) -> choice[0] = which)
        .setView(box)
        .setPositiveButton(R.string.report_send, (d, w) -> {
          String reason = REPORT_REASONS[choice[0]];
          String noteText = note.getText().toString();
          worker.execute(() -> {
            String token = currentAccessToken();
            AccountApi.Report result = token == null
                ? null : account.report(token, entry.requestId, reason, noteText, entry.text);
            main.post(() -> {
              if (isFinishing()) return;
              if (result == null) {
                Toast.makeText(this, R.string.report_sign_in, Toast.LENGTH_LONG).show();
              } else {
                Toast.makeText(this, result.ok ? getString(R.string.report_sent) : result.message,
                    Toast.LENGTH_LONG).show();
              }
            });
          });
        })
        .setNegativeButton(android.R.string.cancel, null)
        .show();
  }

  private void open(String url) {
    try {
      startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    } catch (ActivityNotFoundException e) {
      Toast.makeText(this, url, Toast.LENGTH_LONG).show();
    }
  }

  private boolean copy(String text) {
    ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
    if (clipboard != null) {
      clipboard.setPrimaryClip(ClipData.newPlainText(getString(R.string.app_name), text));
      // Android 13+ shows its own clipboard confirmation.
      if (Build.VERSION.SDK_INT < 33) Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show();
    }
    return true;
  }

  /** Android 15+ enforces edge-to-edge; pad for system bars and the keyboard. */
  @SuppressWarnings("deprecation") // Only called on API 30-34, where it is the supported switch.
  private void applyEdgeToEdgeInsets(View root) {
    if (Build.VERSION.SDK_INT < 30) return; // adjustResize handles older versions.
    if (Build.VERSION.SDK_INT < 35) getWindow().setDecorFitsSystemWindows(false);
    root.setOnApplyWindowInsetsListener((v, insets) -> {
      Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
      Insets ime = insets.getInsets(WindowInsets.Type.ime());
      v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
      if (ime.bottom > 0) scroll.post(() -> scroll.smoothScrollTo(0, messages.getHeight()));
      return WindowInsets.CONSUMED;
    });
  }

  private void restore(String saved) {
    if (saved == null) return;
    try {
      JSONObject json = new JSONObject(saved);
      JSONArray entries = json.getJSONArray("entries");
      for (int i = 0; i < entries.length(); i++) {
        JSONObject e = entries.getJSONObject(i);
        transcript.add(new Entry(e.getString("k"), e.getString("t"), e.optString("d", null), e.optString("q", null)));
      }
      JSONArray history = json.getJSONArray("history");
      List<Conversation.Message> restored = new ArrayList<>();
      for (int i = 0; i < history.length(); i++) {
        JSONObject m = history.getJSONObject(i);
        restored.add(new Conversation.Message(m.getString("r"), m.getString("c")));
      }
      conversation.restore(restored);
    } catch (Exception e) {
      transcript.clear();
      conversation.clear();
    }
  }

  private int dp(int value) {
    return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value,
        getResources().getDisplayMetrics()));
  }
}
