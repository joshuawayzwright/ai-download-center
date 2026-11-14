package au.com.thesoloserviceprovider.solo;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Native client for {@code /api/solo-auth} (app sign-in) and {@code /api/solo-report}.
 * Sends {@code X-Solo-Client: android} and never an Origin or Cookie header, as the
 * shared contract requires. Tokens come back in the JSON body.
 */
public final class AccountApi {
  static final String CLIENT = "android";

  /** Server account state from {@code GET /api/solo-auth}. */
  public static final class Status {
    public final boolean reachable;
    public final boolean enabled;
    public final boolean authenticated;
    public final boolean chatEnabled;
    public final String email;
    public final int httpStatus;
    public final String error;
    public final String code;
    /** True when the server accepts new accounts from the app. */
    public final boolean signupEnabled;
    /** "member" or "free" for a signed-in account; null when unknown. */
    public final String tier;
    /** Messages left today and the daily allowance, when the server reports them. */
    public final Integer remainingDaily;
    public final Integer dailyLimit;

    Status(boolean reachable, boolean enabled, boolean authenticated, boolean chatEnabled,
        String email, int httpStatus, String error, String code) {
      this(reachable, enabled, authenticated, chatEnabled, email, httpStatus, error, code, false, null, null, null);
    }

    Status(boolean reachable, boolean enabled, boolean authenticated, boolean chatEnabled,
        String email, int httpStatus, String error, String code, boolean signupEnabled, String tier,
        Integer remainingDaily, Integer dailyLimit) {
      this.reachable = reachable;
      this.enabled = enabled;
      this.authenticated = authenticated;
      this.chatEnabled = chatEnabled;
      this.email = email;
      this.httpStatus = httpStatus;
      this.error = error;
      this.code = code;
      this.signupEnabled = signupEnabled;
      this.tier = tier;
      this.remainingDaily = remainingDaily;
      this.dailyLimit = dailyLimit;
    }
  }

  /** Result of create account, password reset or account deletion. */
  public static final class Outcome {
    public final boolean ok;
    /** User-facing error text when {@code ok} is false. */
    public final String message;
    public final int httpStatus;
    public final String code;

    Outcome(boolean ok, String message, int httpStatus, String code) {
      this.ok = ok;
      this.message = message;
      this.httpStatus = httpStatus;
      this.code = code;
    }
  }

  /** Result of login or refresh. {@code accessToken} is null on failure. */
  public static final class SignIn {
    public final Status status;
    public final String accessToken;
    public final String refreshToken;
    public final int expiresIn;

    SignIn(Status status, String accessToken, String refreshToken, int expiresIn) {
      this.status = status;
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.expiresIn = expiresIn;
    }

    public boolean ok() {
      return accessToken != null;
    }
  }

  /** Result of a report submission. */
  public static final class Report {
    public final boolean ok;
    public final String message;
    public final int httpStatus;

    Report(boolean ok, String message, int httpStatus) {
      this.ok = ok;
      this.message = message;
      this.httpStatus = httpStatus;
    }
  }

  private static final int MAX_RESPONSE_BYTES = 64 * 1024;
  private final String authUrl;
  private final String reportUrl;
  private final String userAgent;

  public AccountApi(String chatEndpoint, String userAgent) {
    this.authUrl = sibling(chatEndpoint, "solo-auth");
    this.reportUrl = sibling(chatEndpoint, "solo-report");
    this.userAgent = userAgent;
  }

  /** Replaces the last path segment: {@code .../api/solo-chat -> .../api/<name>}. */
  static String sibling(String chatEndpoint, String name) {
    int slash = chatEndpoint.lastIndexOf('/');
    return chatEndpoint.substring(0, slash + 1) + name;
  }

  public Status status(String accessToken) {
    Response r = call("GET", authUrl, null, accessToken);
    return toStatus(r);
  }

  public SignIn login(String email, String password) {
    try {
      return toSignIn(call("POST", authUrl,
          new JSONObject().put("action", "login").put("email", email.trim()).put("password", password), null));
    } catch (JSONException e) {
      return new SignIn(failure(0, "Couldn't prepare the sign-in request.", "client_error"), null, null, 0);
    }
  }

  public SignIn refresh(String refreshToken) {
    try {
      return toSignIn(call("POST", authUrl,
          new JSONObject().put("action", "refresh").put("refresh_token", refreshToken), null));
    } catch (JSONException e) {
      return new SignIn(failure(0, "Couldn't prepare the refresh request.", "client_error"), null, null, 0);
    }
  }

  /** Creates an account. On success the server emails a confirmation link; nobody is signed in yet. */
  public Outcome signup(String email, String password) {
    try {
      Response r = call("POST", authUrl,
          new JSONObject().put("action", "signup").put("email", email.trim()).put("password", password), null);
      return toOutcome(r, "signup", "check_email", "Couldn't create the account");
    } catch (JSONException e) {
      return new Outcome(false, "Couldn't prepare the request.", 0, "client_error");
    }
  }

  /** Asks for a password reset email. The server's answer is the same whether or not the account exists. */
  public Outcome requestReset(String email) {
    try {
      Response r = call("POST", authUrl, new JSONObject().put("action", "request_reset").put("email", email.trim()), null);
      return toOutcome(r, "reset", "check_email", "Couldn't send the reset email");
    } catch (JSONException e) {
      return new Outcome(false, "Couldn't prepare the request.", 0, "client_error");
    }
  }

  /** Permanently deletes the signed-in account on the server. */
  public Outcome deleteAccount(String accessToken) {
    try {
      Response r = call("POST", authUrl, new JSONObject().put("action", "delete_account").put("confirm", "DELETE"), accessToken);
      if (r.status == 200 && r.json != null && r.json.optBoolean("deleted", false)) return new Outcome(true, null, 200, null);
      if (r.status == 200) return new Outcome(false, "SOLO AI returned an unexpected response.", 200, "invalid_response");
      return toOutcome(r, "deleted", null, "Couldn't delete the account");
    } catch (JSONException e) {
      return new Outcome(false, "Couldn't prepare the request.", 0, "client_error");
    }
  }

  static Outcome toOutcome(Response r, String field, String expected, String fallback) {
    if (r.status == 200 && r.json != null && expected != null && expected.equals(r.json.optString(field, null))) {
      return new Outcome(true, null, 200, null);
    }
    if (r.status == 0) return new Outcome(false, "Can't reach SOLO AI. Check your connection and try again.", 0, "network");
    String code = r.json == null ? null : r.json.optString("code", null);
    String message = r.json == null ? null : r.json.optString("error", null);
    if (r.status == 200) message = "SOLO AI returned an unexpected response.";
    if (message == null || message.trim().isEmpty()) message = fallback + " (HTTP " + r.status + ").";
    if (r.status == 429 && r.retryAfter != null && r.retryAfter.matches("\\d{1,6}")) {
      message += " Try again in " + SoloApi.waitText(Integer.parseInt(r.retryAfter)) + ".";
    }
    return new Outcome(false, message.trim(), r.status, code);
  }

  /** Best-effort server sign-out. The app clears its own tokens either way. */
  public boolean logout(String accessToken, String refreshToken) {
    try {
      JSONObject body = new JSONObject().put("action", "logout");
      if (refreshToken != null) body.put("refresh_token", refreshToken);
      return call("POST", authUrl, body, accessToken).status == 200;
    } catch (JSONException e) {
      return false;
    }
  }

  public Report report(String accessToken, String requestId, String reason, String note, String reply) {
    try {
      JSONObject body = new JSONObject().put("requestId", requestId).put("reason", reason).put("reply", reply);
      if (note != null && !note.trim().isEmpty()) body.put("note", note.trim());
      Response r = call("POST", reportUrl, body, accessToken);
      if (r.status == 200) return new Report(true, null, 200);
      String message = r.json != null ? r.json.optString("error", null) : null;
      if (r.status == 0) message = "Can't reach SOLO AI. Check your connection and try again.";
      if (message == null || message.isEmpty()) message = "The report couldn't be sent (HTTP " + r.status + ").";
      if (r.status == 429 && r.retryAfter != null && r.retryAfter.matches("\\d{1,6}")) {
        message += " Try again in " + SoloApi.waitText(Integer.parseInt(r.retryAfter)) + ".";
      }
      return new Report(false, message, r.status);
    } catch (JSONException e) {
      return new Report(false, "Couldn't prepare the report.", 0);
    }
  }

  // ---- Mapping ----------------------------------------------------------------

  static Status toStatus(Response r) {
    if (r.status == 0) return failure(0, "Can't reach SOLO AI. Check your connection.", "network");
    if (r.json == null) {
      // A missing endpoint (hosting 404 page) means app accounts are not deployed.
      return new Status(true, false, false, false, null, r.status, null, null);
    }
    JSONObject user = r.json.optJSONObject("user");
    JSONObject usage = r.json.optJSONObject("usage");
    String tier = usage == null ? null : usage.optString("tier", null);
    if (tier != null && !tier.equals("member") && !tier.equals("free")) tier = null;
    Integer remaining = null, limit = null;
    if (usage != null) {
      if (usage.has("remaining_daily") && !usage.isNull("remaining_daily")) remaining = usage.optInt("remaining_daily");
      if (usage.has("daily_limit") && !usage.isNull("daily_limit")) limit = usage.optInt("daily_limit");
    }
    return new Status(true, r.json.optBoolean("enabled", false), r.json.optBoolean("authenticated", false),
        r.json.optBoolean("chatEnabled", false), user == null ? null : user.optString("email", null),
        r.status, r.status == 200 ? null : r.json.optString("error", null), r.json.optString("code", null),
        r.json.optBoolean("signupEnabled", false), tier, remaining, limit);
  }

  static SignIn toSignIn(Response r) {
    Status status = toStatus(r);
    if (r.status == 200 && r.json != null) {
      JSONObject s = r.json.optJSONObject("session");
      if (s != null) {
        String access = s.optString("access_token", null);
        String refresh = s.optString("refresh_token", null);
        int expires = s.optInt("expires_in", 0);
        if (access != null && !access.isEmpty() && refresh != null && !refresh.isEmpty() && expires > 0) {
          return new SignIn(status, access, refresh, expires);
        }
      }
      return new SignIn(failure(200, "SOLO AI returned an invalid sign-in response.", "invalid_session"), null, null, 0);
    }
    String message = status.error;
    if (message == null || message.isEmpty()) {
      message = r.status == 0 ? "Can't reach SOLO AI. Check your connection." : "Sign-in failed (HTTP " + r.status + ").";
    }
    if (r.status == 429 && r.retryAfter != null && r.retryAfter.matches("\\d{1,6}")) {
      message += " Try again in " + SoloApi.waitText(Integer.parseInt(r.retryAfter)) + ".";
    }
    return new SignIn(failure(r.status, message, status.code), null, null, 0);
  }

  private static Status failure(int httpStatus, String error, String code) {
    return new Status(httpStatus != 0, false, false, false, null, httpStatus, error, code);
  }

  // ---- HTTP -------------------------------------------------------------------

  static final class Response {
    final int status;
    final JSONObject json;
    final String retryAfter;

    Response(int status, JSONObject json, String retryAfter) {
      this.status = status;
      this.json = json;
      this.retryAfter = retryAfter;
    }
  }

  private Response call(String method, String url, JSONObject body, String accessToken) {
    HttpURLConnection c = null;
    try {
      c = (HttpURLConnection) new URL(url).openConnection();
      c.setRequestMethod(method);
      c.setConnectTimeout(SoloApi.CONNECT_TIMEOUT_MS);
      c.setReadTimeout(20000);
      c.setInstanceFollowRedirects(false);
      c.setUseCaches(false);
      c.setRequestProperty("Accept", "application/json");
      c.setRequestProperty("X-Solo-Client", CLIENT);
      if (userAgent != null) c.setRequestProperty("User-Agent", userAgent);
      if (accessToken != null && !accessToken.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + accessToken);
      if (body != null) {
        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        c.setFixedLengthStreamingMode(payload.length);
        try (OutputStream out = c.getOutputStream()) {
          out.write(payload);
        }
      }
      int status = c.getResponseCode();
      InputStream stream = status >= 400 ? c.getErrorStream() : c.getInputStream();
      JSONObject json = null;
      if (stream != null) {
        try {
          json = new JSONObject(read(stream));
        } catch (JSONException ignored) {
          // Non-JSON body, e.g. a hosting 404 page.
        }
      }
      return new Response(status, json, c.getHeaderField("Retry-After"));
    } catch (SocketTimeoutException e) {
      return new Response(0, null, null);
    } catch (IOException e) {
      return new Response(0, null, null);
    } finally {
      if (c != null) c.disconnect();
    }
  }

  private static String read(InputStream stream) throws IOException {
    try (InputStream in = stream) {
      ByteArrayOutputStream buffer = new ByteArrayOutputStream();
      byte[] chunk = new byte[8192];
      int n;
      while ((n = in.read(chunk)) != -1) {
        if (buffer.size() + n > MAX_RESPONSE_BYTES) throw new IOException("Response too large");
        buffer.write(chunk, 0, n);
      }
      return buffer.toString(StandardCharsets.UTF_8.name());
    }
  }
}
