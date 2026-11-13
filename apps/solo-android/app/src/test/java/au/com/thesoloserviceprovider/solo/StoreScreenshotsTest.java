package au.com.thesoloserviceprovider.solo;

import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Looper;
import android.view.View;
import android.widget.EditText;

import org.json.JSONObject;
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
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Renders Google Play phone screenshots (1080 x 2160, within Play's 2:1 limit) from the
 * real app UI with a scripted sample conversation. Output: build/play-screenshots/.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 36, qualifiers = "w360dp-h720dp-xxhdpi")
public class StoreScreenshotsTest {
  private static final String[] REPLIES = {
      "## Your week at a glance\n"
          + "1. **Monday:** confirm all three client jobs and block travel time.\n"
          + "2. **Tuesday to Wednesday:** complete the jobs. Keep Thursday morning free as a buffer.\n"
          + "3. **Thursday afternoon:** send your quotes while the details are fresh.\n"
          + "4. **Friday:** invoice finished work and follow up open quotes.\n\n"
          + "**Tip:** write all your quotes in one sitting. It's faster and your pricing stays consistent.\n\n"
          + "Want me to draft a quote follow-up message?",
      "Here's a short, friendly follow-up:\n\n"
          + "**Subject:** Your quote for the garden refresh\n\n"
          + "Hi Sam,\n\nJust checking you received the quote I sent on Thursday. "
          + "Happy to adjust the scope or timing if that helps. I can start as early as next week.\n\n"
          + "Thanks,\nAlex\n\n"
          + "- Keep it under 100 words\n- Send it 3 to 4 days after the quote\n- Offer one clear next step"
  };

  private TinyHttpServer server;
  private ActivityController<MainActivity> controller;

  @After public void tearDown() throws Exception {
    if (controller != null) controller.pause().stop().destroy();
    if (server != null) server.close();
    MainActivity.endpointOverride = null;
  }

  private static void settle() throws InterruptedException {
    for (int i = 0; i < 40; i++) {
      Thread.sleep(50);
      shadowOf(Looper.getMainLooper()).idle();
    }
  }

  private static void shoot(MainActivity a, String name) throws Exception {
    View root = a.getWindow().getDecorView();
    int w = 1080, h = 2160;
    root.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
    root.layout(0, 0, w, h);
    Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
    root.draw(new Canvas(bitmap));
    File dir = new File("build/play-screenshots");
    dir.mkdirs();
    try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) {
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
    }
  }

  private void ask(MainActivity a, String text) throws Exception {
    ((EditText) a.findViewById(R.id.input)).setText(text);
    shadowOf(Looper.getMainLooper()).idle();
    a.findViewById(R.id.send).performClick();
    settle();
  }

  @Test public void renderStoreScreenshots() throws Exception {
    AtomicInteger turn = new AtomicInteger();
    server = new TinyHttpServer((method, path, body) -> {
      if (!path.equals("/api/solo-chat")) return new String[] {"404", "text/plain", "not found"};
      if (body.equals("{}")) return new String[] {"400", "application/json", "{}"};
      try {
        String reply = REPLIES[Math.min(turn.getAndIncrement(), REPLIES.length - 1)];
        return new String[] {"200", "application/json", new JSONObject().put("reply", reply).toString()};
      } catch (Exception e) {
        throw new RuntimeException(e);
      }
    });
    MainActivity.endpointOverride = "http://127.0.0.1:" + server.port() + "/api/solo-chat";
    controller = Robolectric.buildActivity(MainActivity.class).setup();
    settle();
    MainActivity a = controller.get();
    shoot(a, "1-welcome");
    ask(a, "Help me plan my week. I have three client jobs and quotes to send.");
    shoot(a, "2-plan");
    ask(a, "Yes please, draft the quote follow-up");
    a.findViewById(R.id.scroll).scrollTo(0, 100000);
    shoot(a, "3-follow-up");
    assertTrue(new File("build/play-screenshots/3-follow-up.png").length() > 0);
  }
}
