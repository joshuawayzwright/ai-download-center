package au.com.thesoloserviceprovider.solo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public class ConversationTest {
  private static final String ID = "3f9e2b1a-4c5d-4e6f-8a7b-9c0d1e2f3a4b";

  private static String repeat(String s, int n) {
    StringBuilder b = new StringBuilder();
    for (int i = 0; i < n; i++) b.append(s);
    return b.toString();
  }

  private static JSONArray messages(Conversation.Request r) throws Exception {
    return new JSONObject(r.body).getJSONArray("messages");
  }

  @Test public void firstRequestMatchesContractShape() throws Exception {
    Conversation c = new Conversation();
    Conversation.Request r = c.prepare("  Help me plan my week ", ID);
    JSONObject body = new JSONObject(r.body);
    assertEquals(ID, body.getString("requestId"));
    JSONArray m = body.getJSONArray("messages");
    assertEquals(1, m.length());
    assertEquals("user", m.getJSONObject(0).getString("role"));
    assertEquals("Help me plan my week", m.getJSONObject(0).getString("content"));
  }

  @Test public void successfulTurnsAlternateAndStartAndEndWithUser() throws Exception {
    Conversation c = new Conversation();
    for (int i = 0; i < 9; i++) {
      Conversation.Request r = c.prepare("question " + i, ID);
      c.commit(r, "answer " + i);
    }
    JSONArray m = messages(c.prepare("next", ID));
    assertTrue(m.length() <= Conversation.MAX_MESSAGES);
    assertEquals(1, m.length() % 2);
    for (int i = 0; i < m.length(); i++) {
      assertEquals(i % 2 == 0 ? "user" : "assistant", m.getJSONObject(i).getString("role"));
    }
    assertEquals("next", m.getJSONObject(m.length() - 1).getString("content"));
    // Oldest complete pairs were dropped first.
    assertEquals("question 4", m.getJSONObject(0).getString("content"));
  }

  @Test public void failedTurnIsNeverCommitted() throws Exception {
    Conversation c = new Conversation();
    c.commit(c.prepare("first", ID), "reply");
    c.prepare("this one fails", ID); // prepared but never committed
    JSONArray m = messages(c.prepare("retry text", ID));
    assertEquals(3, m.length());
    assertEquals("first", m.getJSONObject(0).getString("content"));
    assertEquals("retry text", m.getJSONObject(2).getString("content"));
  }

  @Test public void requestBodyStaysWithinByteLimitForMultiByteText() throws Exception {
    Conversation c = new Conversation();
    String heavy = repeat("😀", 600); // 1,200 UTF-16 units, 2,400 UTF-8 bytes
    for (int i = 0; i < 5; i++) c.commit(c.prepare(heavy, ID), heavy);
    Conversation.Request r = c.prepare(heavy, ID);
    assertTrue(r.body.getBytes(StandardCharsets.UTF_8).length <= Conversation.MAX_BODY_BYTES);
    JSONArray m = messages(r);
    assertEquals("user", m.getJSONObject(0).getString("role"));
    assertEquals("user", m.getJSONObject(m.length() - 1).getString("role"));
  }

  @Test public void longRepliesAreCappedSoHistoryRemainsValid() throws Exception {
    Conversation c = new Conversation();
    c.commit(c.prepare("hi", ID), repeat("a", 5000));
    JSONArray m = messages(c.prepare("more", ID));
    assertEquals(4000, m.getJSONObject(1).getString("content").length());
  }

  @Test public void legacyServersGetTheOriginalAssistantLimit() throws Exception {
    Conversation c = new Conversation();
    c.commit(c.prepare("hi", ID), repeat("a", 3000));
    assertTrue(c.useLegacyAssistantLimit());
    assertEquals(1200, messages(c.prepare("more", ID)).getJSONObject(1).getString("content").length());
    c.commit(c.prepare("again", ID), repeat("b", 3000));
    assertEquals(1200, c.history().get(3).content.length());
  }

  @Test public void streamingFlagIsSentOnlyWhenEnabled() throws Exception {
    Conversation c = new Conversation();
    assertTrue(!new JSONObject(c.prepare("hi", ID).body).has("stream"));
    c.setStream(true);
    assertTrue(new JSONObject(c.prepare("hi", ID).body).getBoolean("stream"));
  }

  @Test public void truncationNeverSplitsSurrogatePairs() {
    String value = repeat("a", 1199) + "😀";
    String cut = Conversation.truncate(value, 1200);
    assertEquals(1199, cut.length());
  }

  @Test public void draftValidationUsesContractLimit() {
    assertNotNull(Conversation.validateDraft("   "));
    assertNull(Conversation.validateDraft(repeat("x", 1200)));
    assertNotNull(Conversation.validateDraft(repeat("x", 1201)));
  }

  @Test public void restoreRejectsInvalidHistory() throws Exception {
    Conversation c = new Conversation();
    c.restore(Arrays.asList(new Conversation.Message("assistant", "x"), new Conversation.Message("user", "y")));
    assertEquals(0, c.history().size());
    c.restore(Arrays.asList(new Conversation.Message("user", "q"), new Conversation.Message("assistant", "a")));
    assertEquals(2, c.history().size());
  }
}
