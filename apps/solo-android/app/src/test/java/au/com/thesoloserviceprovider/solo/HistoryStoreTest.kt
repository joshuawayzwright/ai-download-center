package au.com.thesoloserviceprovider.solo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class HistoryStoreTest {
  private fun thread(id: String, at: Long) = ChatThread(
    id, "Title $id", at,
    listOf(
      ChatMessage("u$id", Role.USER, "Plan my week"),
      ChatMessage("s$id", Role.SOLO, "**Monday**", requestId = "3f9e2b1a-4c5d-4e6f-8a7b-9c0d1e2f3a4b", truncated = true),
      ChatMessage("f$id", Role.USER, "Not sent", MessageStatus.FAILED, error = "Offline"),
    ),
    listOf(Conversation.Message("user", "Plan my week"), Conversation.Message("assistant", "**Monday**")),
  )

  @Test fun roundTripsThreadsMessagesAndHistory() {
    val dir = Files.createTempDirectory("solo").toFile()
    val store = HistoryStore(File(dir, "conversations.json"))
    store.save(listOf(thread("a", 1), thread("b", 2)))
    val loaded = store.load()
    assertEquals(listOf("b", "a"), loaded.map { it.id })
    val m = loaded[0].messages
    assertEquals(MessageStatus.FAILED, m[2].status)
    assertEquals("Offline", m[2].error)
    assertTrue(m[1].truncated)
    assertEquals("assistant", loaded[0].history[1].role)
  }

  @Test fun keepsOnlyTheNewestFiftyThreads() {
    val store = HistoryStore(File(Files.createTempDirectory("solo").toFile(), "c.json"))
    store.save((1..60).map { thread("t$it", it.toLong()) })
    val loaded = store.load()
    assertEquals(50, loaded.size)
    assertEquals("tt60", "t" + loaded.first().id)
  }

  @Test fun aCorruptFileNeverCrashes() {
    val file = File(Files.createTempDirectory("solo").toFile(), "c.json")
    file.writeText("{not json")
    assertEquals(emptyList<ChatThread>(), HistoryStore(file).load())
  }
}
