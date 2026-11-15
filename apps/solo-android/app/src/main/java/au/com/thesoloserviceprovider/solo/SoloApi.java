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

  /** Receives streamed text as it arrives (on the calling worker thread). */
  public interface DeltaListener {
    void onDelta(String text);
  }

  /** A web page the reply drew on (Google Search grounding). HTTPS only. */
  public static final class Source {
    public final String title;
    public final String url;

    public Source(String title, String url) {
      this.title = title;
      this.url = url;
    }
  }

  static final int MAX_SOURCES = 8;
  static final int MAX_SOURCE_TITLE = 200;
  static final int MAX_SOURCE_URL = 2048;

  /** Reads {@code sources: [{title, url}]}, keeping only well-formed https links (max 8). */
  static java.util.List<Source> parseSources(JSONObject json) {
    java.util.List<Source> out = new java.util.ArrayList<>();
    org.json.JSONArray array = json == null ? null : json.optJSONArray("sources");
    if (array == null) return out;
    for (int i = 0; i < array.length() && out.size() < MAX_SOURCES; i++) {
      JSONObject item = array.optJSONObject(i);
      if (item == null) continue;
      String url = item.optString("url", "").trim();
      if (!isSafeSourceUrl(url)) continue;
      String title = item.optString("title", "").replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
      if (title.isEmpty()) title = host(url);
      if (title.length() > MAX_SOURCE_TITLE) title = title.substring(0, MAX_SOURCE_TITLE);
      boolean duplicate = false;
      for (Source s : out) if (s.url.equals(url)) { duplicate = true; break; }
      if (!duplicate) out.add(new Source(title, url));
    }
    return out;
  }

  static boolean isSafeSourceUrl(String url) {
    if (url == null || url.length() > MAX_SOURCE_URL || url.matches(".*[\\s\\x00-\\x1f\\x7f].*")) return false;
    try {
      java.net.URI uri = new java.net.URI(url);
      return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null && !uri.getHost().isEmpty()
          && uri.getUserInfo() == null;
    } catch (Exception e) {
      return false;
    }
  }

  /** The site name shown on a source chip, e.g. {@code abc.net.au}. */
  public static String host(String url) {
    try {
      String host = new java.net.URI(url).getHost();
      if (host == null) return url;
      return host.startsWith("www.") ? host.substring(4) : host;
    } catch (Exception e) {
      return url;
    }
  }

  /** The outcome of one chat request. */
  public static final class Result {
    public final boolean ok;
    public final int status;
    public final String reply;
    public final String error;
    public final String code;
    public final Integer remainingDaily;
    /** True when the reply hit the server's length cap. */
    public final boolean truncated;
    /** For failures after streaming started: the text received before it stopped. */
    public final String partial;
    /** Web pages the reply drew on; empty when none. Never null. */
    public final java.util.List<Source> sources;

    private Result(boolean ok, int status, String reply, String error, String code, Integer remainingDaily,
        boolean truncated, String partial, java.util.List<Source> sources) {
      this.ok = ok;
      this.status = status;
      this.reply = reply;
      this.error = error;
      this.code = code;
      this.remainingDaily = remainingDaily;
      this.truncated = truncated;
      this.partial = partial;
      this.sources = sources == null ? java.util.Collections.<Source>emptyList()
          : java.util.Collections.unmodifiableList(sources);
    }

    static Result success(int status, String reply, Integer remainingDaily) {
      return success(status, reply, remainingDaily, false);
    }

    static Result success(int status, String reply, Integer remainingDaily, boolean truncated) {
      return success(status, reply, remainingDaily, truncated, null);
    }

    static Result success(int status, String reply, Integer remainingDaily, boolean truncated,
        java.util.List<Source> sources) {
      return new Result(true, status, reply, null, null, remainingDaily, truncated, null, sources);
    }

    static Result failure(int status, String error, String code) {
      return failure(status, error, code, null);
    }

    static Result failure(int status, String error, String code, String partial) {
      return new Result(false, status, null, error, code, null, false, partial, null);
    }
  }

  static final int CONNECT_TIMEOUT_MS = 10000;
  // The server allows the provider 15 s; leave headroom for admission and network.
  static final int READ_TIMEOUT_MS = 30000;
  private static final int MAX_RESPONSE_BYTES = 64 * 1024;
  private static final int MAX_STREAM_CHARS = 256 * 1024;

  private final String endpoint;
  private final java.util.concurrent.atomic.AtomicReference<HttpURLConnection> active =
      new java.util.concurrent.atomic.AtomicReference<>();
  private volatile boolean cancelled;
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

  /** Stops the request in progress, if any. Safe to call from any thread. */
  public void cancel() {
    cancelled = true;
    HttpURLConnection connection = active.get();
    if (connection != null) connection.disconnect();
  }

  /** Sends a prepared request. Blocking: call off the main thread. */
  public Result send(Conversation.Request request) {
    return send(request, null);
  }

  /**
   * Sends a prepared request. If the server streams (text/event-stream), each piece of
   * visible text goes to {@code listener}; only a final {@code done} event is a reply.
   * Servers that answer with plain JSON are handled exactly as before.
   */
  public Result send(Conversation.Request request, DeltaListener listener) {
    HttpURLConnection connection = null;
    cancelled = false;
    try {
      connection = (HttpURLConnection) new URL(endpoint).openConnection();
      active.set(connection);
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
      if (cancelled) return Result.failure(0, "Stopped.", "cancelled");
      int status = connection.getResponseCode();
      String type = connection.getContentType();
      if (status == 200 && type != null && type.toLowerCase(java.util.Locale.ROOT).startsWith("text/event-stream")) {
        return readStream(connection.getInputStream(), listener);
      }
      InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
      String text = stream == null ? "" : readLimited(stream);
      String retryAfter = connection.getHeaderField("Retry-After");
      return interpret(status, text, retryAfter);
    } catch (SocketTimeoutException e) {
      if (cancelled) return Result.failure(0, "Stopped.", "cancelled");
      return Result.failure(0, "SOLO AI took too long to respond. Please try again.", "client_timeout");
    } catch (IOException e) {
      if (cancelled) return Result.failure(0, "Stopped.", "cancelled");
      return Result.failure(0, "Can't reach SOLO AI. Check your connection and try again.", "network");
    } finally {
      active.set(null);
      if (connection != null) connection.disconnect();
    }
  }

  /** Reads server-sent events: delta {text}, then done {reply, ...} or error {error, code}. */
  private Result readStream(InputStream raw, DeltaListener listener) throws IOException {
    StringBuilder partial = new StringBuilder();
    try (java.io.BufferedReader reader = new java.io.BufferedReader(
        new java.io.InputStreamReader(raw, StandardCharsets.UTF_8))) {
      String event = null;
      StringBuilder data = new StringBuilder();
      String line;
      long received = 0;
      while ((line = reader.readLine()) != null) {
        received += line.length();
        if (received > MAX_STREAM_CHARS) {
          return Result.failure(200, "The reply was too long to display.", "too_long", partial.toString());
        }
        if (line.startsWith("event:")) {
          event = line.substring(6).trim();
        } else if (line.startsWith("data:")) {
          data.append(line.substring(5).trim());
        } else if (line.isEmpty() && event != null) {
          Result done = handleEvent(event, data.toString(), partial, listener);
          if (done != null) return done;
          event = null;
          data.setLength(0);
        }
      }
      if (event != null) {
        Result done = handleEvent(event, data.toString(), partial, listener);
        if (done != null) return done;
      }
    } catch (IOException e) {
      if (cancelled) return Result.failure(0, "Stopped.", "cancelled", partial.toString());
      return Result.failure(0, "The connection dropped before SOLO finished.", "interrupted", partial.toString());
    }
    if (cancelled) return Result.failure(0, "Stopped.", "cancelled", partial.toString());
    return Result.failure(200, "The reply was interrupted. Please try again.", "interrupted", partial.toString());
  }

  private static Result handleEvent(String event, String data, StringBuilder partial, DeltaListener listener) {
    JSONObject json;
    try {
      json = new JSONObject(data);
    } catch (Exception e) {
      return null; // Ignore malformed or keep-alive events.
    }
    switch (event) {
      case "delta": {
        String text = json.optString("text", "");
        if (!text.isEmpty()) {
          partial.append(text);
          if (listener != null) listener.onDelta(text);
        }
        return null;
      }
      case "done": {
        Result r = interpret(200, data, null);
        if (!r.ok) return Result.failure(200, r.error, r.code, partial.toString());
        return Result.success(200, r.reply, r.remainingDaily, json.optBoolean("truncated", false), r.sources);
      }
      case "error": {
        String error = json.optString("error", "SOLO AI couldn't finish the reply.");
        return Result.failure(200, error, json.optString("code", "stream_error"), partial.toString());
      }
      default:
        return null;
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
      return Result.success(status, reply.trim(), remaining, json.optBoolean("truncated", false), parseSources(json));
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
