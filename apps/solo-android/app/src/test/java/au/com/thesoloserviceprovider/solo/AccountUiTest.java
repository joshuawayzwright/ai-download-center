package au.com.thesoloserviceprovider.solo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlertDialog;
import android.content.Context;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/** Drives app sign-in, authenticated chat and reply reporting against a scripted server. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 36, qualifiers = "w411dp-h891dp-xxhdpi")
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
public class AccountUiTest {
  private static final String SIGNED_OUT = "{\"enabled\":true,\"authenticated\":false,\"chatEnabled\":false}";
  private static final String SIGNED_IN = "{\"enabled\":true,\"authenticated\":true,\"chatEnabled\":true,"
      + "\"user\":{\"id\":\"u\",\"email\":\"pilot@example.test\"},\"usage\":{\"remaining_daily\":20,\"daily_limit\":20}}";
  private static final String SESSION = "{\"enabled\":true,\"authenticated\":true,\"chatEnabled\":true,"
      + "\"user\":{\"id\":\"u\",\"email\":\"pilot@example.test\"},"
      + "\"session\":{\"access_token\":\"access-1\",\"refresh_token\":\"refresh-1\",\"expires_in\":3600,\"token_type\":\"bearer\"}}";

  private TinyHttpServer server;
  private ActivityController<MainActivity> controller;
  private final AtomicBoolean signedIn = new AtomicBoolean(false);

  @Before public void fakeCrypto() {
    // Android Keystore is not available on the JVM; this reversible stand-in proves
    // the store never writes the plain token.
    SessionStore.cryptoOverride = new SessionStore.Crypto() {
      @Override public String encrypt(String plain) { return "sealed:" + new StringBuilder(plain).reverse(); }
      @Override public String decrypt(String sealed) { return new StringBuilder(sealed.substring(7)).reverse().toString(); }
    };
  }

  @After public void tearDown() throws Exception {
    if (controller != null) controller.pause().stop().destroy();
    if (server != null) server.close();
    MainActivity.endpointOverride = null;
    SessionStore.cryptoOverride = null;
    RuntimeEnvironment.getApplication().getSharedPreferences("solo_session", Context.MODE_PRIVATE).edit().clear().commit();
  }

  private MainActivity launch() throws Exception {
    server = new TinyHttpServer((method, path, body) -> {
      if (path.equals("/api/solo-chat")) {
        if (body.equals("{}")) return new String[] {"400", "application/json", "{\"error\":\"Invalid conversation body\"}"};
        return new String[] {"200", "application/json", "{\"reply\":\"Plan: three priorities.\",\"usage\":{\"remaining_daily\":19,\"daily_limit\":20}}"};
      }
      if (path.equals("/api/solo-auth")) {
        if (method.equals("GET")) return new String[] {"200", "application/json", signedIn.get() ? SIGNED_IN : SIGNED_OUT};
        signedIn.set(true);
        return new String[] {"200", "application/json", SESSION};
      }
      if (path.equals("/api/solo-report")) return new String[] {"200", "application/json", "{\"ok\":true,\"code\":\"reported\"}"};
      return new String[] {"404", "text/plain", "not found"};
    });
    MainActivity.endpointOverride = "http://127.0.0.1:" + server.port() + "/api/solo-chat";
    controller = Robolectric.buildActivity(MainActivity.class).setup();
    settle();
    return controller.get();
  }

  private static void settle() throws InterruptedException {
    for (int i = 0; i < 40; i++) {
      Thread.sleep(50);
      shadowOf(Looper.getMainLooper()).idle();
    }
  }

  private static <T extends View> List<T> find(View root, Class<T> type) {
    List<T> out = new ArrayList<>();
    if (type.isInstance(root)) out.add(type.cast(root));
    if (root instanceof ViewGroup) {
      ViewGroup g = (ViewGroup) root;
      for (int i = 0; i < g.getChildCount(); i++) out.addAll(find(g.getChildAt(i), type));
    }
    return out;
  }

  private static Button button(View root, String label) {
    for (Button b : find(root, Button.class)) {
      if (label.contentEquals(b.getText()) && b.getVisibility() == View.VISIBLE) return b;
    }
    return null;
  }

  private TinyHttpServer.Seen last(String path) {
    TinyHttpServer.Seen found = null;
    synchronized (server.requests) {
      for (TinyHttpServer.Seen s : server.requests) if (s.path.equals(path) && !s.body.equals("{}") && !s.body.isEmpty()) found = s;
    }
    return found;
  }

  @Test public void signedOutStateLocksChatAndOffersSignIn() throws Exception {
    MainActivity a = launch();
    assertEquals(View.VISIBLE, a.findViewById(R.id.status_card).getVisibility());
    assertEquals("Sign in to chat with SOLO AI", ((TextView) a.findViewById(R.id.status_title)).getText().toString());
    assertFalse(a.findViewById(R.id.input).isEnabled());
    MainActivityUiTest.screenshot(a, "5-signed-out");
    TinyHttpServer.Seen status = server.requests.stream().filter(s -> s.path.equals("/api/solo-auth")).findFirst().get();
    assertEquals("GET", status.method);
    assertEquals("android", status.headers.get("x-solo-client"));
  }

  @Test public void signInChatAndReportEndToEnd() throws Exception {
    MainActivity a = launch();
    a.findViewById(R.id.status_action).performClick();
    shadowOf(Looper.getMainLooper()).idle();
    AlertDialog dialog = (AlertDialog) ShadowAlertDialog.getLatestDialog();
    List<EditText> fields = find(dialog.getWindow().getDecorView(), EditText.class);
    fields.get(0).setText("pilot@example.test");
    fields.get(1).setText("correct horse battery");
    dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
    settle();

    JSONObject login = new JSONObject(last("/api/solo-auth").body);
    assertEquals("login", login.getString("action"));
    assertNull(last("/api/solo-auth").headers.get("origin"));
    assertTrue(a.findViewById(R.id.input).isEnabled());
    String stored = RuntimeEnvironment.getApplication().getSharedPreferences("solo_session", Context.MODE_PRIVATE).getString("refresh", null);
    assertNotNull(stored);
    assertFalse("refresh token is never stored in plain text", stored.contains("refresh-1"));

    ((EditText) a.findViewById(R.id.input)).setText("Plan my week");
    shadowOf(Looper.getMainLooper()).idle();
    a.findViewById(R.id.send).performClick();
    settle();
    TinyHttpServer.Seen chat = last("/api/solo-chat");
    assertEquals("Bearer access-1", chat.headers.get("authorization"));
    String requestId = new JSONObject(chat.body).getString("requestId");

    Button report = button(a.findViewById(R.id.messages), "Report");
    assertNotNull("signed-in replies can be reported in the app", report);
    MainActivityUiTest.screenshot(a, "6-signed-in-reply");
    report.performClick();
    shadowOf(Looper.getMainLooper()).idle();
    AlertDialog reportDialog = (AlertDialog) ShadowAlertDialog.getLatestDialog();
    reportDialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
    settle();
    TinyHttpServer.Seen sent = last("/api/solo-report");
    assertNotNull(sent);
    JSONObject body = new JSONObject(sent.body);
    assertEquals(requestId, body.getString("requestId"));
    assertEquals("harmful", body.getString("reason"));
    assertEquals("Plan: three priorities.", body.getString("reply"));
    assertEquals("Bearer access-1", sent.headers.get("authorization"));
  }

  @Test public void repliesAreNotReportableWhenAccountsAreOff() throws Exception {
    server = new TinyHttpServer((method, path, body) -> path.equals("/api/solo-chat") && !body.equals("{}")
        ? new String[] {"200", "application/json", "{\"reply\":\"Hello\"}"}
        : new String[] {"404", "text/plain", "not found"});
    // Probe needs a deployed chat endpoint: answer {} with 400.
    server.close();
    server = new TinyHttpServer((method, path, body) -> {
      if (path.equals("/api/solo-chat")) return body.equals("{}")
          ? new String[] {"400", "application/json", "{}"} : new String[] {"200", "application/json", "{\"reply\":\"Hello\"}"};
      return new String[] {"404", "text/plain", "not found"};
    });
    MainActivity.endpointOverride = "http://127.0.0.1:" + server.port() + "/api/solo-chat";
    controller = Robolectric.buildActivity(MainActivity.class).setup();
    settle();
    MainActivity a = controller.get();
    assertTrue(a.findViewById(R.id.input).isEnabled());
    ((EditText) a.findViewById(R.id.input)).setText("Hi");
    shadowOf(Looper.getMainLooper()).idle();
    a.findViewById(R.id.send).performClick();
    settle();
    assertNull(button(a.findViewById(R.id.messages), "Report"));
  }
}
