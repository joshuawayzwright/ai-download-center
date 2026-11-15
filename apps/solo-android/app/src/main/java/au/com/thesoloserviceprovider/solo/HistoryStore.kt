package au.com.thesoloserviceprovider.solo

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Saves conversations as JSON in the app's private storage. That storage is protected by
 * Android's file-based encryption, excluded from backup and device transfer, and removed
 * on uninstall. Nothing here leaves the phone.
 */
class HistoryStore(private val file: File) {
  companion object {
    const val MAX_THREADS = 50
    const val MAX_MESSAGES_PER_THREAD = 200
  }

  @Synchronized
  fun load(): List<ChatThread> = try {
    if (!file.exists()) emptyList() else parse(file.readText())
  } catch (e: Exception) {
    emptyList() // A corrupt file must never crash the app.
  }

  @Synchronized
  fun save(threads: List<ChatThread>) {
    val trimmed = threads.sortedByDescending { it.updatedAt }.take(MAX_THREADS)
    val tmp = File(file.parentFile, file.name + ".tmp")
    tmp.writeText(encode(trimmed))
    if (!tmp.renameTo(file)) {
      file.delete()
      tmp.renameTo(file)
    }
  }

  @Synchronized
  fun clear() {
    file.delete()
  }

  internal fun encode(threads: List<ChatThread>): String {
    val array = JSONArray()
    for (t in threads) {
      val messages = JSONArray()
      for (m in t.messages.takeLast(MAX_MESSAGES_PER_THREAD)) {
        messages.put(JSONObject().apply {
          put("id", m.id); put("role", m.role.name); put("text", m.text); put("status", m.status.name)
          m.requestId?.let { put("requestId", it) }
          if (m.truncated) put("truncated", true)
          m.error?.let { put("error", it) }
          if (m.sources.isNotEmpty()) {
            val sources = JSONArray()
            for (src in m.sources) sources.put(JSONObject().put("title", src.title).put("url", src.url))
            put("sources", sources)
          }
        })
      }
      val history = JSONArray()
      for (h in t.history) history.put(JSONObject().put("role", h.role).put("content", h.content))
      array.put(JSONObject().put("id", t.id).put("title", t.title).put("updatedAt", t.updatedAt)
        .put("messages", messages).put("history", history))
    }
    return JSONObject().put("version", 1).put("threads", array).toString()
  }

  /** Saved sources are re-checked on load; anything not a well-formed https link is dropped. */
  private fun parseSources(m: JSONObject): List<Source> =
    SoloApi.parseSources(m).map { Source(it.title, it.url) }

  internal fun parse(text: String): List<ChatThread> {
    val root = JSONObject(text)
    val array = root.optJSONArray("threads") ?: return emptyList()
    val out = ArrayList<ChatThread>()
    for (i in 0 until array.length()) {
      val t = array.getJSONObject(i)
      val msgs = t.getJSONArray("messages")
      val messages = (0 until msgs.length()).map { j ->
        val m = msgs.getJSONObject(j)
        ChatMessage(
          id = m.getString("id"),
          role = Role.valueOf(m.getString("role")),
          text = m.getString("text"),
          status = MessageStatus.valueOf(m.optString("status", "DONE")),
          requestId = m.optString("requestId").ifEmpty { null },
          truncated = m.optBoolean("truncated", false),
          error = m.optString("error").ifEmpty { null },
          sources = parseSources(m),
        )
      }
      val h = t.getJSONArray("history")
      val history = (0 until h.length()).map { j ->
        val m = h.getJSONObject(j)
        Conversation.Message(m.getString("role"), m.getString("content"))
      }
      out += ChatThread(t.getString("id"), t.getString("title"), t.getLong("updatedAt"), messages, history)
    }
    return out
  }
}
