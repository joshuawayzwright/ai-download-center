package au.com.thesoloserviceprovider.solo;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Conversation history rules from docs/SOLO-SHARED-API-CONTRACT.md.
 *
 * <ul>
 *   <li>At most 12 messages; a valid request starts and ends with {@code user},
 *       so it holds at most 11.</li>
 *   <li>Each message is at most 1,200 JavaScript string characters. Java
 *       {@link String#length()} counts the same UTF-16 code units.</li>
 *   <li>The complete JSON request is at most 16,000 UTF-8 bytes.</li>
 *   <li>Trim complete oldest user/assistant pairs to meet both limits.</li>
 *   <li>Failed turns never enter the committed history.</li>
 * </ul>
 */
public final class Conversation {
  public static final int MAX_MESSAGES = 11;
  public static final int MAX_CHARS = 1200;
  /** Servers with streaming support accept assistant history turns up to 4,000 characters. */
  public static final int MAX_ASSISTANT_CHARS = 4000;
  public static final int MAX_BODY_BYTES = 16000;

  /** One chat message as sent to the API. */
  public static final class Message {
    public final String role;
    public final String content;

    public Message(String role, String content) {
      this.role = role;
      this.content = content;
    }
  }

  /** A prepared request: the exact JSON body plus the turns it contains. */
  public static final class Request {
    public final String body;
    public final List<Message> messages;
    public final String requestId;

    Request(String body, List<Message> messages, String requestId) {
      this.body = body;
      this.messages = messages;
      this.requestId = requestId;
    }
  }

  private final List<Message> committed = new ArrayList<>();
  /** Lowered to 1,200 for older servers that reject longer assistant turns. */
  private int assistantCap = MAX_ASSISTANT_CHARS;
  /** Ask the server to stream the reply. */
  private boolean stream;

  public void setStream(boolean stream) {
    this.stream = stream;
  }

  /** Switches to the original 1,200-character limit for assistant turns. Returns true if anything changed. */
  public boolean useLegacyAssistantLimit() {
    boolean changed = assistantCap != MAX_CHARS;
    assistantCap = MAX_CHARS;
    for (int i = 0; i < committed.size(); i++) {
      Message m = committed.get(i);
      if ("assistant".equals(m.role) && m.content.length() > MAX_CHARS) {
        committed.set(i, new Message(m.role, truncate(m.content, MAX_CHARS)));
        changed = true;
      }
    }
    return changed;
  }

  /** Returns why a draft cannot be sent, or {@code null} when it is valid. */
  public static String validateDraft(String text) {
    if (text == null || text.trim().isEmpty()) return "Type a message first.";
    if (text.trim().length() > MAX_CHARS) return "Keep messages to 1,200 characters.";
    return null;
  }

  /**
   * Builds the request body for a new user message, trimming the oldest
   * complete exchanges until the contract limits are met.
   */
  public Request prepare(String userText, String requestId) throws JSONException {
    String text = userText.trim();
    if (validateDraft(text) != null) throw new IllegalArgumentException("Invalid draft");
    List<Message> pending = new ArrayList<>(committed);
    pending.add(new Message("user", text));
    while (pending.size() > MAX_MESSAGES) dropOldestPair(pending);
    String body = encode(pending, requestId, stream);
    while (utf8Length(body) > MAX_BODY_BYTES && pending.size() > 1) {
      dropOldestPair(pending);
      body = encode(pending, requestId, stream);
    }
    if (utf8Length(body) > MAX_BODY_BYTES) throw new IllegalArgumentException("Message is too large");
    return new Request(body, Collections.unmodifiableList(pending), requestId);
  }

  /** Commits a successful exchange. Replies are capped so they can be resent. */
  public void commit(Request request, String reply) {
    committed.clear();
    committed.addAll(request.messages);
    committed.add(new Message("assistant", truncate(reply.trim(), assistantCap)));
  }

  /**
   * Restores saved history. Anything that is not a valid alternating
   * user/assistant sequence within the contract limits is discarded.
   */
  public void restore(List<Message> saved) {
    committed.clear();
    if (saved == null || saved.size() % 2 != 0) return;
    for (int i = 0; i < saved.size(); i++) {
      Message m = saved.get(i);
      String expected = i % 2 == 0 ? "user" : "assistant";
      if (m == null || !expected.equals(m.role) || m.content == null
          || m.content.trim().isEmpty() || m.content.length() > (i % 2 == 0 ? MAX_CHARS : MAX_ASSISTANT_CHARS)) {
        committed.clear();
        return;
      }
      committed.add(m);
    }
  }

  public void clear() {
    committed.clear();
  }

  public List<Message> history() {
    return Collections.unmodifiableList(committed);
  }

  static String encode(List<Message> messages, String requestId) throws JSONException {
    return encode(messages, requestId, false);
  }

  static String encode(List<Message> messages, String requestId, boolean stream) throws JSONException {
    JSONArray array = new JSONArray();
    for (Message m : messages) {
      array.put(new JSONObject().put("role", m.role).put("content", m.content));
    }
    JSONObject body = new JSONObject().put("messages", array);
    if (requestId != null) body.put("requestId", requestId);
    if (stream) body.put("stream", true);
    return body.toString();
  }

  static int utf8Length(String value) {
    return value.getBytes(StandardCharsets.UTF_8).length;
  }

  /** Truncates to {@code max} UTF-16 units without splitting a surrogate pair. */
  static String truncate(String value, int max) {
    if (value.length() <= max) return value;
    int end = max;
    if (Character.isHighSurrogate(value.charAt(end - 1))) end--;
    return value.substring(0, end);
  }

  private static void dropOldestPair(List<Message> pending) {
    pending.remove(0);
    if (!pending.isEmpty() && !"user".equals(pending.get(0).role)) pending.remove(0);
  }
}
