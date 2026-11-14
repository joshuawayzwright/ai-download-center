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

  private static AccountApi api(TinyHttpServer server) {
    return new AccountApi("http://127.0.0.1:" + server.port() + "/api/solo-chat", "test");
  }

  @Test public void statusReadsSignupTierAndUsage() {
    AccountApi.Status open = AccountApi.toStatus(new AccountApi.Response(200,
        json("{\"enabled\":true,\"authenticated\":false,\"chatEnabled\":false,\"signupEnabled\":true}"), null));
    assertTrue(open.signupEnabled);
    assertNull(open.tier);
    AccountApi.Status free = AccountApi.toStatus(new AccountApi.Response(200,
        json("{\"enabled\":true,\"authenticated\":true,\"chatEnabled\":true,\"user\":{\"email\":\"a@b.co\"},"
            + "\"usage\":{\"remaining_daily\":9,\"daily_limit\":10,\"tier\":\"free\"}}"), null));
    assertEquals("free", free.tier);
    assertEquals(Integer.valueOf(9), free.remainingDaily);
    assertEquals(Integer.valueOf(10), free.dailyLimit);
    AccountApi.Status odd = AccountApi.toStatus(new AccountApi.Response(200,
        json("{\"enabled\":true,\"authenticated\":true,\"usage\":{\"tier\":\"admin\"}}"), null));
    assertNull("unknown tiers are ignored", odd.tier);
    assertFalse(AccountApi.toStatus(new AccountApi.Response(200, json("{\"enabled\":true}"), null)).signupEnabled);
  }

  @Test public void signupPostsCredentialsAndExpectsCheckEmail() throws Exception {
    try (TinyHttpServer server = new TinyHttpServer(200, "application/json",
        "{\"enabled\":true,\"authenticated\":false,\"chatEnabled\":false,\"signup\":\"check_email\"}")) {
      AccountApi.Outcome r = api(server).signup(" new@example.test ", "long enough pw");
      assertTrue(r.ok);
      TinyHttpServer.Seen seen = server.requests.get(0);
      assertEquals("android", seen.headers.get("x-solo-client"));
      assertNull(seen.headers.get("authorization"));
      JSONObject body = new JSONObject(seen.body);
      assertEquals("signup", body.getString("action"));
      assertEquals("new@example.test", body.getString("email"));
      assertEquals("long enough pw", body.getString("password"));
    }
  }

  @Test public void signupErrorsShowServerText() {
    AccountApi.Outcome weak = AccountApi.toOutcome(new AccountApi.Response(400,
        json("{\"error\":\"Use at least 8 characters.\",\"code\":\"weak_password\"}"), null), "signup", "check_email", "x");
    assertFalse(weak.ok);
    assertEquals("weak_password", weak.code);
    assertEquals("Use at least 8 characters.", weak.message);
    AccountApi.Outcome limited = AccountApi.toOutcome(new AccountApi.Response(429,
        json("{\"error\":\"Too many account requests.\",\"code\":\"auth_rate_limited\"}"), "60"), "signup", "check_email", "x");
    assertEquals("Too many account requests. Try again in 1 minute.", limited.message);
    AccountApi.Outcome odd = AccountApi.toOutcome(new AccountApi.Response(200, json("{\"enabled\":true}"), null),
        "signup", "check_email", "x");
    assertFalse("a 200 without signup:check_email is not a success", odd.ok);
  }

  @Test public void loginWithUnconfirmedEmailExplainsWhy() {
    AccountApi.SignIn r = AccountApi.toSignIn(new AccountApi.Response(403, json("{\"error\":\"Confirm your email first. "
        + "Open the link we sent you, then sign in.\",\"code\":\"email_not_confirmed\"}"), null));
    assertFalse(r.ok());
    assertEquals("email_not_confirmed", r.status.code);
    assertTrue(r.status.error.startsWith("Confirm your email first."));
  }

  @Test public void requestResetSendsOnlyTheEmail() throws Exception {
    try (TinyHttpServer server = new TinyHttpServer(200, "application/json", "{\"enabled\":true,\"reset\":\"check_email\"}")) {
      assertTrue(api(server).requestReset("a@b.co").ok);
      JSONObject body = new JSONObject(server.requests.get(0).body);
      assertEquals("request_reset", body.getString("action"));
      assertFalse(body.has("password"));
    }
  }

  @Test public void deleteAccountNeedsBearerAndConfirmation() throws Exception {
    try (TinyHttpServer server = new TinyHttpServer(200, "application/json",
        "{\"deleted\":true,\"enabled\":true,\"authenticated\":false,\"chatEnabled\":false}")) {
      assertTrue(api(server).deleteAccount("acc-token-123").ok);
      TinyHttpServer.Seen seen = server.requests.get(0);
      assertEquals("Bearer acc-token-123", seen.headers.get("authorization"));
      JSONObject body = new JSONObject(seen.body);
      assertEquals("delete_account", body.getString("action"));
      assertEquals("DELETE", body.getString("confirm"));
    }
    try (TinyHttpServer server = new TinyHttpServer(401, "application/json",
        "{\"error\":\"Please sign in again.\",\"code\":\"invalid_session\"}")) {
      AccountApi.Outcome r = api(server).deleteAccount("stale");
      assertFalse(r.ok);
      assertEquals(401, r.httpStatus);
    }
  }

  private static JSONObject json(String s) {
    try { return new JSONObject(s); } catch (Exception e) { throw new AssertionError(e); }
  }
}
