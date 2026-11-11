package au.com.thesoloserviceprovider.solo;

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
 * Client for {@code POST /api/solo-chat}. The response field is {@code reply};
 * errors are {@code {"error": "...", "code": "..."}}. Server error text is shown
 * as sent and is never presented as a model reply. No provider secret is ever
 * held by the app.
 */
public final class SoloApi {
  /** Supplies a customer access token, or {@code null} when signed out. */
  public interface TokenSource {
    String accessToken();
  }

  /** The outcome of one chat request. */
  public static final class Result {
    public final boolean ok;
    public final int status;
    public final String reply;
    public final String error;
    public final String code;
    public final Integer remainingDaily;

    private Result(boolean ok, int status, String reply, String error, String code, Integer remainingDaily) {
      this.ok = ok;
      this.status = status;
      this.reply = reply;
      this.error = error;
      this.code = code;
      this.remainingDaily = remainingDaily;
    }

    static Result success(int status, String reply, Integer remainingDaily) {
      return new Result(true, status, reply, null, null, remainingDaily);
    }

    static Result failure(int status, String error, String code) {
      return new Result(false, status, null, error, code, null);
    }
  }

  static final int CONNECT_TIMEOUT_MS = 10000;
  // The server allows the provider 15 s; leave headroom for admission and network.
  static final int READ_TIMEOUT_MS = 30000;
  private static final int MAX_RESPONSE_BYTES = 64 * 1024;

  private final String endpoint;
  private final TokenSource tokens;
  private final String userAgent;

  public SoloApi(String endpoint, TokenSource tokens, String userAgent) {
    this.endpoint = endpoint;
    this.tokens = tokens;
    this.userAgent = userAgent;
  }

  /**
   * Checks whether the chat endpoint is deployed without sending any
   * conversation text or reaching the model: an empty body is rejected by
   * request validation (400) before access gates or provider calls. Returns
   * the HTTP status, or 0 when the server cannot be reached.
   */
  public int probe() {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(endpoint).openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(CONNECT_TIMEOUT_MS);
      connection.setInstanceFollowRedirects(false);
      connection.setUseCaches(false);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      if (userAgent != null) connection.setRequestProperty("User-Agent", userAgent);
      byte[] payload = "{}".getBytes(StandardCharsets.UTF_8);
      connection.setFixedLengthStreamingMode(payload.length);
      try (OutputStream out = connection.getOutputStream()) {
        out.write(payload);
      }
      return connection.getResponseCode();
    } catch (IOException e) {
      return 0;
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  /** Sends a prepared request. Blocking: call off the main thread. */
  public Result send(Conversation.Request request) {
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection) new URL(endpoint).openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
      connection.setReadTimeout(READ_TIMEOUT_MS);
      connection.setInstanceFollowRedirects(false);
      connection.setUseCaches(false);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
      connection.setRequestProperty("Accept", "application/json");
      if (userAgent != null) connection.setRequestProperty("User-Agent", userAgent);
      String token = tokens == null ? null : tokens.accessToken();
      if (token != null && !token.isEmpty()) {
        connection.setRequestProperty("Authorization", "Bearer " + token);
      }
      byte[] payload = request.body.getBytes(StandardCharsets.UTF_8);
      connection.setFixedLengthStreamingMode(payload.length);
      try (OutputStream out = connection.getOutputStream()) {
        out.write(payload);
      }
      int status = connection.getResponseCode();
      InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
      String text = stream == null ? "" : readLimited(stream);
      String retryAfter = connection.getHeaderField("Retry-After");
      return interpret(status, text, retryAfter);
    } catch (SocketTimeoutException e) {
      return Result.failure(0, "SOLO AI took too long to respond. Please try again.", "client_timeout");
    } catch (IOException e) {
      return Result.failure(0, "Can't reach SOLO AI. Check your connection and try again.", "network");
    } finally {
      if (connection != null) connection.disconnect();
    }
  }

  /** Maps an HTTP response to a result. Package-private for tests. */
  static Result interpret(int status, String text, String retryAfter) {
    JSONObject json = null;
    try {
      json = new JSONObject(text);
    } catch (Exception ignored) {
      // Non-JSON bodies (for example a hosting 404 page) are handled below.
    }
    if (status == 200) {
      String reply = json == null ? null : json.optString("reply", null);
      if (reply == null || reply.trim().isEmpty()) {
        return Result.failure(status, "SOLO AI returned an empty response. Please try again.", "empty_reply");
      }
      Integer remaining = null;
      JSONObject usage = json.optJSONObject("usage");
      if (usage != null && usage.has("remaining_daily") && !usage.isNull("remaining_daily")) {
        remaining = usage.optInt("remaining_daily");
      }
      return Result.success(status, reply.trim(), remaining);
    }
    String error = json == null ? null : json.optString("error", null);
    String code = json == null ? null : json.optString("code", null);
    if (error == null || error.trim().isEmpty()) {
      error = status == 404
          ? "SOLO AI chat isn't available on the server yet."
          : "SOLO AI couldn't respond (HTTP " + status + ").";
    }
    if (status == 429 && retryAfter != null && retryAfter.matches("\\d{1,6}")) {
      error = error + " Try again in " + waitText(Integer.parseInt(retryAfter)) + ".";
    }
    return Result.failure(status, error.trim(), code);
  }

  static String waitText(int seconds) {
    if (seconds < 60) return seconds + (seconds == 1 ? " second" : " seconds");
    int minutes = (seconds + 59) / 60;
    if (minutes < 60) return minutes + (minutes == 1 ? " minute" : " minutes");
    int hours = (minutes + 59) / 60;
    return hours + (hours == 1 ? " hour" : " hours");
  }

  private static String readLimited(InputStream stream) throws IOException {
    try (InputStream in = stream) {
      ByteArrayOutputStream buffer = new ByteArrayOutputStream();
      byte[] chunk = new byte[8192];
      int read;
      while ((read = in.read(chunk)) != -1) {
        if (buffer.size() + read > MAX_RESPONSE_BYTES) throw new IOException("Response too large");
        buffer.write(chunk, 0, read);
      }
      return buffer.toString(StandardCharsets.UTF_8.name());
    }
  }
}
