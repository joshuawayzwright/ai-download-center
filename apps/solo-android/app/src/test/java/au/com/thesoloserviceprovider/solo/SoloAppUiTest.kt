package au.com.thesoloserviceprovider.solo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ActivityScenario
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Drives the real Compose app against a scripted local SOLO server: service states, sign-in,
 * streaming, formatted replies, saved history, regenerate, reporting and the outage rule.
 * Also renders the Google Play screenshots (1080 x 2160) to build/play-screenshots/.
 */
@OptIn(ExperimentalTestApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h720dp-xxhdpi")
class SoloAppUiTest {
  @get:Rule val compose = createEmptyComposeRule()

  private var server: TinyHttpServer? = null
  private var scenario: ActivityScenario<MainActivity>? = null
  private val accountsOn = AtomicBoolean(false)
  private val signedIn = AtomicBoolean(false)
  private val accountDown = AtomicBoolean(false)
  @Volatile private var chatResponse: Array<String> = json(200, """{"reply":"Hello from SOLO."}""")
  private val chatCalls = AtomicInteger()

  private val app: Context get() = RuntimeEnvironment.getApplication()

  private val prefsName = "solo_session_test_" + java.util.UUID.randomUUID()
  /** The running activity, captured once (onActivity can't be nested inside waitUntil). */
  private fun activity(): MainActivity {
    var a: MainActivity? = null
    scenario!!.onActivity { a = it }
    return a!!
  }

  /** The storage the running app actually uses (Robolectric's activity context). */
  private fun storedRefresh(): String? = currentActivity?.getSharedPreferences(prefsName, Context.MODE_PRIVATE)?.getString("refresh", null)

  private fun historyText(): String? = currentActivity?.let { File(it.filesDir, "conversations.json") }?.takeIf { it.exists() }?.readText()

  private var currentActivity: MainActivity? = null

  @Before fun setUp() {
    SessionStore.prefsNameOverride = prefsName
    File(app.filesDir, "conversations.json").delete()
    SessionStore.cryptoOverride = object : SessionStore.Crypto {
      override fun encrypt(plain: String) = "sealed:" + plain.reversed()
      override fun decrypt(sealed: String) = sealed.removePrefix("sealed:").reversed()
    }
  }

  @After fun tearDown() {
    scenario?.close()
    server?.close()
    SoloConfig.endpointOverride = null
    SessionStore.cryptoOverride = null
    SessionStore.prefsNameOverride = null
    File(app.filesDir, "conversations.json").delete()
  }

  private fun json(status: Int, body: String) = arrayOf(status.toString(), "application/json", body)

  private fun start(deployed: Boolean = true) {
    server = TinyHttpServer { method, path, body ->
      when {
        !deployed -> arrayOf("404", "text/plain", "The page could not be found")
        path == "/api/solo-chat" && body == "{}" -> json(400, """{"error":"Invalid conversation body"}""")
        path == "/api/solo-chat" -> { chatCalls.incrementAndGet(); chatResponse }
        path == "/api/solo-auth" && !accountsOn.get() -> arrayOf("404", "text/plain", "not found")
        path == "/api/solo-auth" && method == "GET" && accountDown.get() ->
          json(503, """{"enabled":true,"authenticated":false,"chatEnabled":false,"error":"Account service is temporarily unavailable.","code":"auth_unavailable"}""")
        path == "/api/solo-auth" && method == "GET" -> json(200,
          if (signedIn.get()) """{"enabled":true,"authenticated":true,"chatEnabled":true,"user":{"id":"u","email":"pilot@example.test"},"usage":{"remaining_daily":20,"daily_limit":20}}"""
          else """{"enabled":true,"authenticated":false,"chatEnabled":false}""")
        path == "/api/solo-auth" -> {
          signedIn.set(true)
          json(200, """{"enabled":true,"authenticated":true,"chatEnabled":true,"user":{"id":"u","email":"pilot@example.test"},"session":{"access_token":"access-1","refresh_token":"refresh-1","expires_in":3600,"token_type":"bearer"}}""")
        }
        path == "/api/solo-report" -> json(200, """{"ok":true,"code":"reported"}""")
        else -> arrayOf("404", "text/plain", "not found")
      }
    }
    SoloConfig.endpointOverride = "http://127.0.0.1:${server!!.port()}/api/solo-chat"
    scenario = ActivityScenario.launch(MainActivity::class.java)
    currentActivity = activity()
  }

  private fun waitForText(text: String, substring: Boolean = true) {
    try {
      compose.waitUntil(20000) {
        compose.onAllNodes(hasText(text, substring = substring), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
      }
    } catch (e: Throwable) {
      // Show what is actually on screen, to make a failure diagnosable.
      val texts = compose.onAllNodes(androidx.compose.ui.test.isRoot(), useUnmergedTree = true).fetchSemanticsNodes()
        .flatMap { flatten(it) }.take(40)
      val requests = synchronized(server!!.requests) { server!!.requests.map { it.method + " " + it.path } }
      throw AssertionError("Waiting for '$text'. Requests: $requests. Screen: $texts", e)
    }
  }

  private fun flatten(node: androidx.compose.ui.semantics.SemanticsNode): List<String> {
    val here = node.config.firstOrNull { it.key == androidx.compose.ui.semantics.SemanticsProperties.Text }?.value?.toString()
    return listOfNotNull(here) + node.children.flatMap { flatten(it) }
  }

  private fun waitForDescription(text: String) = compose.waitUntil(20000) {
    compose.onAllNodes(hasContentDescription(text, substring = true), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
  }

  private fun lastRequest(path: String): TinyHttpServer.Seen? = synchronized(server!!.requests) {
    server!!.requests.lastOrNull { it.path == path && it.body.isNotEmpty() && it.body != "{}" }
  }

  private fun send(text: String) {
    compose.onNodeWithTag("composer").performTextInput(text)
    compose.onNodeWithContentDescription("Send").performClick()
  }

  /** Draws the real window at Play's 1080 x 2160 phone size (Robolectric native graphics). */
  private fun shot(name: String) {
    compose.waitForIdle()
    scenario!!.onActivity { activity ->
      val root = activity.window.decorView
      root.measure(View.MeasureSpec.makeMeasureSpec(1080, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(2160, View.MeasureSpec.EXACTLY))
      root.layout(0, 0, 1080, 2160)
      val bitmap = Bitmap.createBitmap(1080, 2160, Bitmap.Config.ARGB_8888)
      root.draw(Canvas(bitmap))
      val dir = File("build/play-screenshots").apply { mkdirs() }
      FileOutputStream(File(dir, "$name.png")).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
  }

  @Test fun notDeployedShowsAnHonestClosedState() {
    start(deployed = false)
    waitForText("SOLO AI chat isn't open yet")
    compose.onNodeWithText("Express interest").assertExists()
    compose.onNodeWithText("Plan my week").assertDoesNotExist()
  }

  @Test fun suggestionSendsAndTheFormattedReplyIsSavedToHistory() {
    chatResponse = json(200, """{"reply":"## Your week\n- **Monday**: plan\n- Friday: review","usage":{"remaining_daily":19,"daily_limit":20}}""")
    start()
    waitForText("Plan my week")
    shot("1-welcome")
    compose.onNodeWithText("Plan my week").performClick()
    waitForText("Your week")
    compose.onNodeWithText("Monday", substring = true, useUnmergedTree = true).assertExists()
    assertFalse(compose.onAllNodes(hasText("**", substring = true), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
    waitForText("19 messages left today")
    compose.onNodeWithContentDescription("Copy reply").assertExists()
    assertTrue(JSONObject(lastRequest("/api/solo-chat")!!.body).getBoolean("stream"))
    compose.waitUntil(20000) { historyText()?.contains("Help me plan my week") == true }
  }

  @Test fun streamedReplyFlowsInAndCanBeRegenerated() {
    chatResponse = arrayOf("200", "text/event-stream",
      "event: delta\ndata: {\"text\":\"Here is \"}\n\n" +
        "event: delta\ndata: {\"text\":\"**a plan**.\"}\n\n" +
        "event: done\ndata: {\"reply\":\"Here is **a plan**.\"}\n\n")
    start()
    waitForText("Plan my week")
    send("Plan my week for a cleaning business")
    waitForText("Here is a plan.")
    shot("2-conversation")
    assertEquals(1, chatCalls.get())
    compose.onNodeWithContentDescription("Regenerate reply").performClick()
    compose.waitUntil(20000) { chatCalls.get() == 2 }
    waitForText("Here is a plan.")
    val body = JSONObject(lastRequest("/api/solo-chat")!!.body)
    assertEquals("regenerate resends only the question, not the old answer", 1, body.getJSONArray("messages").length())
  }

  @Test fun aFailedMessageIsKeptWithRetryAndNeverJoinsHistory() {
    chatResponse = json(502, """{"error":"Gemini provider unavailable"}""")
    start()
    waitForText("Plan my week")
    send("Write a follow-up email")
    waitForText("Gemini provider unavailable")
    compose.onNodeWithText("Retry").assertExists()
    chatResponse = json(200, """{"reply":"Here's your email."}""")
    compose.onNodeWithText("Retry").performClick()
    waitForText("Here's your email.")
    assertEquals(1, JSONObject(lastRequest("/api/solo-chat")!!.body).getJSONArray("messages").length())
  }

  @Test fun signInChatAndReportEndToEnd() {
    accountsOn.set(true)
    start()
    waitForText("Sign in to chat with SOLO AI")
    compose.onNodeWithText("Sign in").performClick()
    compose.onNodeWithTag("email").performTextInput("pilot@example.test")
    compose.onNodeWithTag("password").performTextInput("correct horse battery")
    compose.onNodeWithTag("sign-in").performClick()
    waitForText("Plan my week")
    val login = lastRequest("/api/solo-auth")!!
    assertEquals("android", login.headers["x-solo-client"])
    compose.waitUntil(20000) { storedRefresh() != null }
    val stored = storedRefresh()
    assertNotNull(stored)
    assertFalse("the refresh token is never stored in plain text", stored!!.contains("refresh-1"))

    chatResponse = json(200, """{"reply":"Plan: three priorities.","requestId":"x"}""")
    send("Plan my week")
    waitForText("Plan: three priorities.")
    val chat = lastRequest("/api/solo-chat")!!
    assertEquals("Bearer access-1", chat.headers["authorization"])
    val requestId = JSONObject(chat.body).getString("requestId")

    waitForDescription("Report this reply")
    compose.onNodeWithContentDescription("Report this reply").performClick()
    compose.onNodeWithText("Send report").performClick()
    compose.waitUntil(20000) { lastRequest("/api/solo-report") != null }
    val report = JSONObject(lastRequest("/api/solo-report")!!.body)
    assertEquals(requestId, report.getString("requestId"))
    assertEquals("harmful", report.getString("reason"))
    assertEquals("Plan: three priorities.", report.getString("reply"))
  }

  @Test fun aTemporaryAccountOutageNeverSignsTheUserOut() {
    accountsOn.set(true)
    start()
    waitForText("Sign in to chat with SOLO AI")
    compose.onNodeWithText("Sign in").performClick()
    compose.onNodeWithTag("email").performTextInput("pilot@example.test")
    compose.onNodeWithTag("password").performTextInput("correct horse battery")
    compose.onNodeWithTag("sign-in").performClick()
    waitForText("Plan my week")

    accountDown.set(true)
    scenario!!.close()
    // A fresh launch without the in-memory access token forces a refresh and status check.
    scenario = ActivityScenario.launch(MainActivity::class.java)
    currentActivity = activity()
    waitForText("Can't confirm your sign-in")
    assertNotNull(storedRefresh())
    accountDown.set(false)
    compose.onNodeWithText("Try again").performClick()
    waitForText("Plan my week")
  }

  @Test fun storeScreenshotFollowUp() {
    chatResponse = json(200, """{"reply":"Here's a short, friendly follow-up:\n\n**Subject:** Your quote for the garden refresh\n\nHi Sam,\n\nJust checking you received the quote I sent on Thursday. Happy to adjust the scope or timing if that helps.\n\nThanks,\nAlex\n\n- Keep it under 100 words\n- Send it 3 to 4 days after the quote"}""")
    start()
    waitForText("Write a follow-up")
    compose.onNodeWithText("Write a follow-up").performClick()
    waitForText("garden refresh")
    shot("3-follow-up")
  }
}
