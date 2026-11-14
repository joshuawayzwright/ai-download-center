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

  @Test public void statusReadsRecoverySwitch() {
    assertTrue(AccountApi.toStatus(new AccountApi.Response(200,
        json("{\"enabled\":true,\"signupEnabled\":true,\"recoveryEnabled\":true}"), null)).recoveryEnabled);
    assertFalse(AccountApi.toStatus(new AccountApi.Response(200, json("{\"enabled\":true}"), null)).recoveryEnabled);
  }

  @Test public void signupGoesToOnboardingWithTermsAndOnlyTheListedKeys() throws Exception {
    try (TinyHttpServer server = new TinyHttpServer(202, "application/json", "{\"ok\":true,\"code\":\"check_email\"}")) {
      AccountApi.Outcome r = api(server).signup(" new@example.test ", "twelve chars long");
      assertTrue(r.ok);
      TinyHttpServer.Seen seen = server.requests.get(0);
      assertEquals("/api/solo-onboarding", seen.path);
      assertEquals("android", seen.headers.get("x-solo-client"));
      assertNull(seen.headers.get("origin"));
      assertNull(seen.headers.get("cookie"));
      assertNull(seen.headers.get("authorization"));
      JSONObject body = new JSONObject(seen.body);
      assertEquals(4, body.length());
      assertEquals("signup", body.getString("action"));
      assertEquals("new@example.test", body.getString("email"));
      assertEquals("twelve chars long", body.getString("password"));
      assertTrue(body.getBoolean("acceptedTerms"));
    }
  }

  @Test public void verifyEmailSendsTheCodeAndExpectsEmailVerified() throws Exception {
    try (TinyHttpServer server = new TinyHttpServer(200, "application/json", "{\"ok\":true,\"code\":\"email_verified\"}")) {
      assertTrue(api(server).verifyEmail("a@b.co", " 41950368 ").ok);
      JSONObject body = new JSONObject(server.requests.get(0).body);
      assertEquals(3, body.length());
      assertEquals("verify_email", body.getString("action"));
      assertEquals("41950368", body.getString("code"));
    }
    try (TinyHttpServer server = new TinyHttpServer(401, "application/json",
        "{\"ok\":false,\"code\":\"invalid_code\",\"error\":\"That code is invalid or expired. Request a new code and try again.\"}")) {
      AccountApi.Outcome r = api(server).verifyEmail("a@b.co", "00000000");
      assertFalse(r.ok);
      assertEquals("invalid_code", r.code);
      assertEquals("That code is invalid or expired. Request a new code and try again.", r.message);
    }
  }

  @Test public void resetIsTwoStepsByCode() throws Exception {
    try (TinyHttpServer server = new TinyHttpServer(202, "application/json", "{\"ok\":true,\"code\":\"check_email\"}")) {
      assertTrue(api(server).requestReset("a@b.co").ok);
      JSONObject body = new JSONObject(server.requests.get(0).body);
      assertEquals(2, body.length());
      assertEquals("request_reset", body.getString("action"));
      assertEquals("/api/solo-onboarding", server.requests.get(0).path);
    }
    try (TinyHttpServer server = new TinyHttpServer(200, "application/json",
        "{\"ok\":true,\"code\":\"password_reset\",\"sessionInvalidated\":true}")) {
      assertTrue(api(server).resetPassword("a@b.co", "12345678", "a brand new password").ok);
      JSONObject body = new JSONObject(server.requests.get(0).body);
      assertEquals(4, body.length());
      assertEquals("reset_password", body.getString("action"));
      assertEquals("12345678", body.getString("code"));
      assertEquals("a brand new password", body.getString("password"));
    }
  }

  @Test public void onboardingNeedsTheExactStatusAndCode() {
    AccountApi.Outcome wrongStatus = AccountApi.onboardingOutcome(new AccountApi.Response(200,
        json("{\"ok\":true,\"code\":\"check_email\"}"), null), 202, "check_email", "x");
    assertFalse(wrongStatus.ok);
    AccountApi.Outcome notOk = AccountApi.onboardingOutcome(new AccountApi.Response(202,
        json("{\"ok\":false,\"code\":\"check_email\"}"), null), 202, "check_email", "x");
    assertFalse(notOk.ok);
    AccountApi.Outcome weak = AccountApi.onboardingOutcome(new AccountApi.Response(400,
        json("{\"ok\":false,\"code\":\"weak_password\",\"error\":\"Use a password of 12 to 128 characters.\"}"), null),
        202, "check_email", "x");
    assertEquals("weak_password", weak.code);
    assertEquals("Use a password of 12 to 128 characters.", weak.message);
    AccountApi.Outcome limited = AccountApi.onboardingOutcome(new AccountApi.Response(429,
        json("{\"ok\":false,\"code\":\"auth_rate_limited\",\"error\":\"Too many account requests.\"}"), "60"), 202, "check_email", "x");
    assertEquals("Too many account requests. Try again in 1 minute.", limited.message);
    AccountApi.Outcome failed = AccountApi.onboardingOutcome(new AccountApi.Response(503, json("{\"ok\":false,"
        + "\"code\":\"reset_incomplete\",\"error\":\"The reset code was checked, but password reset could not be confirmed.\"}"), null),
        200, "password_reset", "x");
    assertEquals("The reset code was checked, but password reset could not be confirmed.", failed.message);
    AccountApi.Outcome missing = AccountApi.onboardingOutcome(new AccountApi.Response(404, null, null), 202, "check_email", "x");
    assertEquals("onboarding_disabled", missing.code);
  }

  @Test public void loginWithUnconfirmedEmailKeepsTheCode() {
    AccountApi.SignIn r = AccountApi.toSignIn(new AccountApi.Response(403, json("{\"error\":\"Confirm your email first.\","
        + "\"code\":\"email_not_confirmed\"}"), null));
    assertFalse(r.ok());
    assertEquals("email_not_confirmed", r.status.code);
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
