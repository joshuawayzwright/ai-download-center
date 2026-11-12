package au.com.thesoloserviceprovider.solo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import org.junit.Test;

import java.util.UUID;

/**
 * Runs the app's real client code against a running SOLO chat handler.
 * Skipped unless SOLO_BACKEND_OPEN_URL / SOLO_BACKEND_CLOSED_URL are set.
 */
public class BackendContractTest {
  private static String repeat(String s, int n) {
    StringBuilder b = new StringBuilder();
    for (int i = 0; i < n; i++) b.append(s);
    return b.toString();
  }

  @Test public void multiTurnConversationIsAcceptedByRealValidator() throws Exception {
    String url = System.getProperty("SOLO_BACKEND_OPEN_URL");
    assumeTrue(url != null);
    SoloApi api = new SoloApi(url, () -> null, "SOLOAI-Android/test");
    assertEquals("probe reaches validation only", 400, api.probe());
    Conversation c = new Conversation();
    // Multi-byte, max-length turns push both the 11-message and 16,000-byte limits.
    String heavy = repeat("😀", 600);
    for (int turn = 0; turn < 10; turn++) {
      Conversation.Request request = c.prepare(turn % 2 == 0 ? heavy : "Turn " + turn, UUID.randomUUID().toString());
      SoloApi.Result r = api.send(request);
      assertTrue("turn " + turn + " failed: " + r.status + " " + r.error, r.ok);
      assertTrue(r.reply.startsWith("turn "));
      c.commit(request, r.reply);
    }
  }

  @Test public void closedServerIsReportedAsClosedWithServerText() throws Exception {
    String url = System.getProperty("SOLO_BACKEND_CLOSED_URL");
    assumeTrue(url != null);
    SoloApi api = new SoloApi(url, () -> null, null);
    assertEquals(400, api.probe());
    SoloApi.Result r = api.send(new Conversation().prepare("hello", UUID.randomUUID().toString()));
    assertFalse(r.ok);
    assertEquals(503, r.status);
    assertEquals("SOLO chat is in private testing. Public AI conversations are not enabled.", r.error);
    assertTrue(MainActivity.meansClosed(r));
  }

  @Test public void missingEndpointIsReportedAsClosed() throws Exception {
    String url = System.getProperty("SOLO_BACKEND_CLOSED_URL");
    assumeTrue(url != null);
    SoloApi api = new SoloApi(url.replace("/api/solo-chat", "/api/missing"), () -> null, null);
    assertEquals(404, api.probe());
    assertTrue(MainActivity.meansClosed(api.send(new Conversation().prepare("hi", UUID.randomUUID().toString()))));
  }

  @Test public void streamedConversationAgainstRealHandler() throws Exception {
    String url = System.getProperty("SOLO_BACKEND_STREAM_URL");
    assumeTrue(url != null);
    SoloApi api = new SoloApi(url, () -> null, "SOLOAI-Android/test");
    Conversation c = new Conversation();
    c.setStream(true);
    for (int turn = 0; turn < 4; turn++) {
      StringBuilder deltas = new StringBuilder();
      Conversation.Request request = c.prepare("Turn " + turn, UUID.randomUUID().toString());
      SoloApi.Result r = api.send(request, deltas::append);
      assertTrue("turn " + turn + ": " + r.status + " " + r.error, r.ok);
      assertEquals(r.reply, deltas.toString().trim());
      assertTrue(r.reply.contains("**a streamed**"));
      c.commit(request, r.reply);
    }
  }
}
