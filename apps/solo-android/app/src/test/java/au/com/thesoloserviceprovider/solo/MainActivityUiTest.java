package au.com.thesoloserviceprovider.solo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.graphics.Bitmap;
import android.os.Looper;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;

@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 36, qualifiers = "w411dp-h891dp-xxhdpi")
public class MainActivityUiTest {
  private TinyHttpServer server;
  private ActivityController<MainActivity> controller;

  @After public void tearDown() throws Exception {
    if (controller != null) controller.pause().stop().destroy();
    if (server != null) server.close();
    MainActivity.endpointOverride = null;
  }

  private MainActivity launch(int status, String type, String body) throws Exception {
    server = new TinyHttpServer(status, type, body);
    MainActivity.endpointOverride = "http://127.0.0.1:" + server.port() + "/api/solo-chat";
    controller = Robolectric.buildActivity(MainActivity.class).setup();
    settle();
    return controller.get();
  }

  /** Lets the background request finish, then runs posted UI work. */
  private static void settle() throws InterruptedException {
    for (int i = 0; i < 40; i++) {
      Thread.sleep(50);
      shadowOf(Looper.getMainLooper()).idle();
    }
  }

  static void screenshot(MainActivity a, String name) throws Exception {
    View root = a.getWindow().getDecorView();
    root.measure(View.MeasureSpec.makeMeasureSpec(1233, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(2673, View.MeasureSpec.EXACTLY));
    root.layout(0, 0, 1233, 2673);
    Bitmap bitmap = Bitmap.createBitmap(1233, 2673, Bitmap.Config.ARGB_8888);
    root.draw(new android.graphics.Canvas(bitmap));
    File dir = new File("build/screenshots");
    dir.mkdirs();
    try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
    }
  }

  private static String allText(View v) {
    if (v instanceof TextView) return ((TextView) v).getText() + "\n";
    StringBuilder b = new StringBuilder();
    if (v instanceof android.view.ViewGroup) {
      android.view.ViewGroup g = (android.view.ViewGroup) v;
      for (int i = 0; i < g.getChildCount(); i++) if (g.getChildAt(i).getVisibility() == View.VISIBLE) b.append(allText(g.getChildAt(i)));
    }
    return b.toString();
  }

  @Test public void notDeployedShowsHonestClosedStateAndLocksComposer() throws Exception {
    MainActivity a = launch(404, "text/plain", "The page could not be found");
    assertEquals(View.VISIBLE, a.findViewById(R.id.status_card).getVisibility());
    assertTrue(allText(a.findViewById(R.id.status_card)).contains("SOLO AI chat isn't open yet"));
    assertFalse(a.findViewById(R.id.input).isEnabled());
    assertFalse(a.findViewById(R.id.send).isEnabled());
    screenshot(a, "1-closed");
  }

  @Test public void readyStateShowsWelcomeAndSuggestions() throws Exception {
    MainActivity a = launch(400, "application/json", "{\"error\":\"Invalid conversation body\"}");
    assertEquals(View.GONE, a.findViewById(R.id.status_card).getVisibility());
    assertEquals(View.VISIBLE, a.findViewById(R.id.suggestions).getVisibility());
    assertTrue(a.findViewById(R.id.input).isEnabled());
    assertFalse("empty draft cannot be sent", a.findViewById(R.id.send).isEnabled());
    screenshot(a, "2-welcome");
  }

  @Test public void sendShowsUserMessageAndReply() throws Exception {
    MainActivity a = launch(200, "application/json; charset=utf-8",
        "{\"reply\":\"Here is a simple plan: list your three priorities, block focused time each morning, and review on Friday.\",\"usage\":{\"remaining_daily\":19,\"daily_limit\":20}}");
    EditText input = a.findViewById(R.id.input);
    input.setText("Help me plan my week");
    shadowOf(Looper.getMainLooper()).idle();
    assertTrue(a.findViewById(R.id.send).isEnabled());
    a.findViewById(R.id.send).performClick();
    settle();
    String text = allText(a.findViewById(R.id.messages));
    assertTrue(text.contains("Help me plan my week"));
    assertTrue(text.contains("Here is a simple plan"));
    assertEquals("19 messages left today", ((TextView) a.findViewById(R.id.header_subtitle)).getText().toString());
    assertEquals("", input.getText().toString());
    screenshot(a, "3-conversation");
  }

  @Test public void serverErrorIsShownWithRetryAndDraftIsKept() throws Exception {
    MainActivity a = launch(502, "application/json", "{\"error\":\"Gemini provider unavailable\",\"upstreamStatus\":500}");
    // Probe returned 502, which is not "not deployed", so chat stays open.
    EditText input = a.findViewById(R.id.input);
    input.setText("Write a follow-up email");
    shadowOf(Looper.getMainLooper()).idle();
    a.findViewById(R.id.send).performClick();
    settle();
    String text = allText(a.findViewById(R.id.messages));
    assertTrue(text.contains("Gemini provider unavailable"));
    assertTrue(text.contains("Retry"));
    assertTrue("unsent text stays visible for retry", text.contains("Write a follow-up email"));
    screenshot(a, "4-error");
  }

  @Test public void privateTestingGateClosesChatWithServerText() throws Exception {
    MainActivity a = launch(503, "application/json",
        "{\"error\":\"SOLO chat is in private testing. Public AI conversations are not enabled.\"}");
    EditText input = a.findViewById(R.id.input);
    input.setText("Hello");
    shadowOf(Looper.getMainLooper()).idle();
    a.findViewById(R.id.send).performClick();
    settle();
    assertEquals(View.VISIBLE, a.findViewById(R.id.status_card).getVisibility());
    assertTrue(allText(a.findViewById(R.id.status_card)).contains("private testing"));
    assertFalse(a.findViewById(R.id.input).isEnabled());
    assertEquals("draft kept for later", "Hello", input.getText().toString());
  }

  @Test public void stateSurvivesRecreation() throws Exception {
    MainActivity a = launch(200, "application/json", "{\"reply\":\"Saved reply\"}");
    ((EditText) a.findViewById(R.id.input)).setText("Remember this");
    shadowOf(Looper.getMainLooper()).idle();
    a.findViewById(R.id.send).performClick();
    settle();
    controller.recreate();
    settle();
    String text = allText(controller.get().findViewById(R.id.messages));
    assertTrue(text.contains("Remember this"));
    assertTrue(text.contains("Saved reply"));
  }
}
