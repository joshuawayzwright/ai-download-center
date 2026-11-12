package au.com.thesoloserviceprovider.solo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

public class AccountApiTest {
  private static final String SESSION = "{\"enabled\":true,\"authenticated\":true,\"chatEnabled\":true,"
      + "\"user\":{\"id\":\"u\",\"email\":\"pilot@example.test\"},"
      + "\"session\":{\"access_token\":\"acc-token-123\",\"refresh_token\":\"ref-token-123\",\"expires_in\":3600,\"token_type\":\"bearer\"}}";

  @Test public void endpointsAreSiblingsOfTheChatEndpoint() {
    assertEquals("https://example.test/api/solo-auth", AccountApi.sibling("https://example.test/api/solo-chat", "solo-auth"));
  }

  @Test public void loginSendsNativeHeadersAndNoOrigin() throws Exception {
    try (TinyHttpServer server = new TinyHttpServer(200, "application/json", SESSION)) {
      AccountApi api = new AccountApi("http://127.0.0.1:" + server.port() + "/api/solo-chat", "test");
      AccountApi.SignIn result = api.login(" pilot@example.test ", "secret password");
      assertTrue(result.ok());
      assertEquals("acc-token-123", result.accessToken);
      assertEquals("ref-token-123", result.refreshToken);
      assertEquals("pilot@example.test", result.status.email);
      TinyHttpServer.Seen seen = server.requests.get(0);
      assertEquals("/api/solo-auth", seen.path);
      assertEquals("android", seen.headers.get("x-solo-client"));
      assertNull(seen.headers.get("origin"));
      assertNull(seen.headers.get("cookie"));
      JSONObject body = new JSONObject(seen.body);
      assertEquals("login", body.getString("action"));
      assertEquals("pilot@example.test", body.getString("email"));
    }
  }

  @Test public void signInErrorsCarryServerTextAndRetryAfter() {
    AccountApi.SignIn denied = AccountApi.toSignIn(new AccountApi.Response(401,
        json("{\"error\":\"Unable to sign in. Check your account details.\",\"code\":\"invalid_credentials\"}"), null));
    assertFalse(denied.ok());
    assertEquals("Unable to sign in. Check your account details.", denied.status.error);
    AccountApi.SignIn limited = AccountApi.toSignIn(new AccountApi.Response(429,
        json("{\"error\":\"Too many sign-in attempts.\",\"code\":\"auth_rate_limited\"}"), "120"));
    assertEquals("Too many sign-in attempts. Try again in 2 minutes.", limited.status.error);
  }

  @Test public void a200WithoutTokensIsNotASignIn() {
    assertFalse(AccountApi.toSignIn(new AccountApi.Response(200, json("{\"enabled\":true}"), null)).ok());
  }

  @Test public void missingAuthEndpointMeansAccountsDisabled() {
    AccountApi.Status st = AccountApi.toStatus(new AccountApi.Response(404, null, null));
    assertTrue(st.reachable);
    assertFalse(st.enabled);
  }

  @Test public void reportPostsToReportEndpointWithBearer() throws Exception {
    try (TinyHttpServer server = new TinyHttpServer(200, "application/json", "{\"ok\":true,\"code\":\"reported\"}")) {
      AccountApi api = new AccountApi("http://127.0.0.1:" + server.port() + "/api/solo-chat", "test");
      AccountApi.Report r = api.report("acc-token-123", "3f9e2b1a-4c5d-4e6f-8a7b-9c0d1e2f3a4b", "harmful", "  bad  ", "Reply");
      assertTrue(r.ok);
      TinyHttpServer.Seen seen = server.requests.get(0);
      assertEquals("/api/solo-report", seen.path);
      assertEquals("Bearer acc-token-123", seen.headers.get("authorization"));
      JSONObject body = new JSONObject(seen.body);
      assertEquals("harmful", body.getString("reason"));
      assertEquals("bad", body.getString("note"));
      assertEquals("Reply", body.getString("reply"));
    }
  }

  private static JSONObject json(String s) {
    try { return new JSONObject(s); } catch (Exception e) { throw new AssertionError(e); }
  }
}
