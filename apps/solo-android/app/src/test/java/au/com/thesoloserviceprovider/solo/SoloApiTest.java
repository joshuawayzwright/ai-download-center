package au.com.thesoloserviceprovider.solo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;


public class SoloApiTest {
  private static final String ID = "3f9e2b1a-4c5d-4e6f-8a7b-9c0d1e2f3a4b";

  @Test public void readsReplyFieldNotAnswer() {
    SoloApi.Result r = SoloApi.interpret(200, "{\"reply\":\" Hello \",\"model\":\"m\",\"provider\":\"gemini\"}", null);
    assertTrue(r.ok);
    assertEquals("Hello", r.reply);
  }

  @Test public void obsoleteAnswerFieldIsNotTreatedAsAReply() {
    SoloApi.Result r = SoloApi.interpret(200, "{\"answer\":\"Hello\"}", null);
    assertFalse(r.ok);
    assertEquals("empty_reply", r.code);
  }

  @Test public void showsServerErrorTextAndCode() {
    SoloApi.Result r = SoloApi.interpret(503,
        "{\"error\":\"Customer conversations are not enabled yet.\",\"code\":\"customer_disabled\"}", null);
    assertFalse(r.ok);
    assertEquals("Customer conversations are not enabled yet.", r.error);
    assertEquals("customer_disabled", r.code);
    assertTrue(MainActivity.meansClosed(r));
  }

  @Test public void hostingNotFoundPageMeansNotDeployed() {
    SoloApi.Result r = SoloApi.interpret(404, "The page could not be found\n\nNOT_FOUND", null);
    assertFalse(r.ok);
    assertTrue(MainActivity.meansClosed(r));
  }

  @Test public void quotaErrorsIncludeRetryAfterAndStayRetryable() {
    SoloApi.Result r = SoloApi.interpret(429,
        "{\"error\":\"Your SOLO usage limit has been reached.\",\"code\":\"daily_limit\"}", "3600");
    assertEquals("Your SOLO usage limit has been reached. Try again in 1 hour.", r.error);
    assertFalse(MainActivity.meansClosed(r));
  }

  @Test public void providerFailuresAreRetryableNotClosed() {
    SoloApi.Result r = SoloApi.interpret(502, "{\"error\":\"Gemini provider unavailable\",\"upstreamStatus\":500}", null);
    assertFalse(MainActivity.meansClosed(r));
    assertEquals("Gemini provider unavailable", r.error);
  }

  @Test public void readsRemainingDailyUsage() {
    SoloApi.Result r = SoloApi.interpret(200, "{\"reply\":\"ok\",\"usage\":{\"remaining_daily\":4,\"daily_limit\":20}}", null);
    assertEquals(Integer.valueOf(4), r.remainingDaily);
    assertNull(SoloApi.interpret(200, "{\"reply\":\"ok\"}", null).remainingDaily);
  }

  // ---- Real HTTP round trip against a local server ----

  private TinyHttpServer server;

  @Before public void start() throws Exception {
    server = new TinyHttpServer(200, "application/json; charset=utf-8",
        "{\"reply\":\"Sure.\",\"provider\":\"gemini\",\"model\":\"gemini-3.5-flash-lite\"}");
  }

  @After public void stop() throws Exception { server.close(); }

  private String url() { return "http://127.0.0.1:" + server.port() + "/api/solo-chat"; }

  @Test public void sendsContractRequestWithBearerAndNoOrigin() throws Exception {
    SoloApi api = new SoloApi(url(), () -> "token-abc", "SOLOAI-Android/test");
    SoloApi.Result r = api.send(new Conversation().prepare("Plan my week", ID));
    assertTrue(r.ok);
    assertEquals("Sure.", r.reply);
    assertEquals("application/json", server.header("Content-Type").split(";")[0].trim());
    assertEquals("Bearer token-abc", server.header("Authorization"));
    assertNull(server.header("Origin"));
    JSONObject body = new JSONObject(server.lastBody);
    assertEquals("Plan my week", body.getJSONArray("messages").getJSONObject(0).getString("content"));
    assertEquals(ID, body.getString("requestId"));
  }

  @Test public void omitsAuthorizationWhenSignedOut() throws Exception {
    SoloApi api = new SoloApi(url(), () -> null, null);
    assertTrue(api.send(new Conversation().prepare("hi", ID)).ok);
    assertNull(server.header("Authorization"));
  }

  @Test public void probeSendsNoConversationText() {
    SoloApi api = new SoloApi(url(), () -> null, null);
    assertEquals(200, api.probe());
    assertEquals("{}", server.lastBody);
  }

  @Test public void unreachableServerIsReportedAsNetworkFailure() {
    SoloApi api = new SoloApi("http://127.0.0.1:1/api/solo-chat", () -> null, null);
    SoloApi.Result r = api.send(new Conversation.Request("{}", java.util.Collections.emptyList(), ID));
    assertFalse(r.ok);
    assertEquals("network", r.code);
    assertEquals(0, api.probe());
  }

  @Test public void nonJsonErrorBodyIsHandled() throws Exception {
    try (TinyHttpServer notFound = new TinyHttpServer(404, "text/plain", "The page could not be found")) {
      SoloApi api = new SoloApi("http://127.0.0.1:" + notFound.port() + "/api/solo-chat", () -> null, null);
      SoloApi.Result r = api.send(new Conversation().prepare("hi", ID));
      assertFalse(r.ok);
      assertEquals(404, r.status);
      assertEquals("SOLO AI chat isn't available on the server yet.", r.error);
    }
  }
}
