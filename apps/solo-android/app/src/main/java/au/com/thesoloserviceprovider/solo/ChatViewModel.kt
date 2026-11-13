package au.com.thesoloserviceprovider.solo

import android.app.Application
import android.content.Intent
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale
import java.util.UUID

/**
 * All SOLO AI app logic. Talks only to the shared SOLO API and never holds provider secrets.
 * The rules here match the reviewed Java client: temporary errors never sign the user out,
 * a refresh can't resurrect a signed-out session, and failed or stopped turns never join
 * the conversation history.
 */
class ChatViewModel(app: Application) : AndroidViewModel(app) {
  companion object {
    val REPORT_REASONS = listOf("harmful", "hateful", "sexual", "misleading", "other")
    private const val STREAM_FRAME_MS = 50L
  }

  private val endpoint = SoloConfig.endpointOverride ?: BuildConfig.SOLO_API_URL
  private val agent = "SOLOAI-Android/" + BuildConfig.VERSION_NAME
  private val session = SessionStore(app)
  private val api = SoloApi(endpoint, { session.accessToken() }, agent)
  private val account = AccountApi(endpoint, agent)
  private val store = HistoryStore(File(app.filesDir, "conversations.json"))

  private val _state = MutableStateFlow(UiState())
  val state: StateFlow<UiState> = _state.asStateFlow()

  private val _notices = Channel<String>(Channel.BUFFERED)
  /** One-off messages for a snackbar. */
  val notices = _notices.receiveAsFlow()

  private var threads: MutableList<ChatThread> = mutableListOf()
  private var conversation = Conversation().apply { setStream(true) }
  /** Invalidates in-flight sends when the conversation changes. */
  private var generation = 0
  /** Invalidates in-flight service checks when a newer check starts. */
  private var serviceGeneration = 0
  private var sendJob: Job? = null
  private var tts: TextToSpeech? = null
  private var ttsReady = false

  init {
    viewModelScope.launch(Dispatchers.IO) {
      threads = store.load().sortedByDescending { it.updatedAt }.toMutableList()
      val voice = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .resolveActivity(app.packageManager) != null
      _state.update { it.copy(threads = summaries(), voiceAvailable = voice) }
    }
    checkService()
  }

  // ---- Service and account ----------------------------------------------------

  fun checkService() {
    val gen = ++serviceGeneration
    _state.update { it.copy(service = ServiceState.CHECKING, statusMessage = null) }
    viewModelScope.launch(Dispatchers.IO) {
      val probe = api.probe()
      var status: AccountApi.Status? = null
      var unverified = false
      if (probe != 0 && probe != 404 && probe != 410) {
        val epoch = session.epoch()
        val token = currentAccessToken()
        status = account.status(token)
        val serverTrouble = !status.reachable || status.httpStatus == 429 || status.httpStatus >= 500
        if (token != null && status.httpStatus == 401) {
          session.clearIfCurrent(epoch) // the server definitively rejected this session
          status = account.status(null)
        } else if (session.hasSession() && (token == null || serverTrouble)) {
          unverified = true // temporary: keep the stored sign-in
        }
      }
      if (gen != serviceGeneration) return@launch
      val st = status
      val service = when {
        probe == 0 -> ServiceState.OFFLINE
        probe == 404 || probe == 410 -> ServiceState.CLOSED
        unverified -> ServiceState.UNVERIFIED
        st != null && st.enabled && !st.authenticated -> ServiceState.SIGNED_OUT
        else -> ServiceState.READY
      }
      _state.update {
        it.copy(
          service = service,
          accountsEnabled = st?.enabled == true,
          signedIn = session.hasSession(),
          email = st?.email ?: session.email(),
        )
      }
    }
  }

  /** A usable access token, refreshing once if only a refresh token is held. IO thread only. */
  private fun currentAccessToken(): String? {
    session.accessToken()?.let { return it }
    val epoch = session.epoch()
    val refresh = session.refreshToken() ?: return null
    val renewed = account.refresh(refresh)
    if (renewed.ok()) {
      return if (session.saveIfCurrent(epoch, renewed.accessToken, renewed.refreshToken, renewed.expiresIn,
          renewed.status.email)) renewed.accessToken else null
    }
    if (renewed.status.httpStatus == 401 || renewed.status.httpStatus == 403) session.clearIfCurrent(epoch)
    return null
  }

  /** Signs in. Returns null on success, or the error to show. */
  suspend fun signIn(email: String, password: String): String? = withContext(Dispatchers.IO) {
    val result = account.login(email, password)
    if (!result.ok()) return@withContext result.status.error ?: "Sign-in failed."
    session.save(result.accessToken, result.refreshToken, result.expiresIn, result.status.email ?: email.trim())
    withContext(Dispatchers.Main) { checkService() }
    null
  }

  fun signOut() {
    val access = session.accessToken()
    val refresh = session.refreshToken()
    session.clear()
    stopGenerating()
    _state.update { it.copy(signedIn = false, email = null, remainingDaily = null, dailyLimit = null) }
    viewModelScope.launch(Dispatchers.IO) { account.logout(access, refresh) }
    notify("Signed out")
    checkService()
  }

  // ---- Threads -----------------------------------------------------------------

  private fun summaries() = threads.map { ThreadSummary(it.id, it.title, it.updatedAt) }

  fun newChat() {
    stopGenerating()
    generation++
    conversation = Conversation().apply { setStream(true) }
    _state.update { it.copy(currentThreadId = null, messages = emptyList(), sending = false, streamingText = "") }
  }

  fun openThread(id: String) {
    val t = threads.firstOrNull { it.id == id } ?: return
    stopGenerating()
    generation++
    conversation = Conversation().apply { setStream(true); restore(t.history) }
    _state.update { it.copy(currentThreadId = id, messages = t.messages, sending = false, streamingText = "") }
  }

  fun deleteThread(id: String) {
    threads.removeAll { it.id == id }
    if (_state.value.currentThreadId == id) newChat()
    persist()
  }

  fun clearAllHistory() {
    threads.clear()
    newChat()
    viewModelScope.launch(Dispatchers.IO) { store.clear() }
    _state.update { it.copy(threads = emptyList()) }
    notify("All conversations deleted from this phone")
  }

  private fun saveCurrent(messages: List<ChatMessage>) {
    if (messages.isEmpty()) return
    val id = _state.value.currentThreadId ?: UUID.randomUUID().toString()
    val title = messages.firstOrNull { it.role == Role.USER }?.text?.lineSequence()?.firstOrNull()
      ?.take(48)?.trim().orEmpty().ifEmpty { "New conversation" }
    val existing = threads.indexOfFirst { it.id == id }
    val thread = ChatThread(id, if (existing >= 0) threads[existing].title else title,
      System.currentTimeMillis(), messages, conversation.history().toList())
    if (existing >= 0) threads.removeAt(existing)
    threads.add(0, thread)
    _state.update { it.copy(currentThreadId = id) }
    persist()
  }

  private fun persist() {
    val snapshot = threads.toList()
    _state.update { it.copy(threads = summaries()) }
    viewModelScope.launch(Dispatchers.IO) {
      try { store.save(snapshot) } catch (e: Exception) { /* storage full: keep in memory */ }
    }
  }

  // ---- Sending -------------------------------------------------------------------

  fun send(raw: String) {
    val text = raw.trim()
    val s = _state.value
    if (s.sending || !s.canChat || Conversation.validateDraft(text) != null) return
    val request = try {
      conversation.prepare(text, UUID.randomUUID().toString())
    } catch (e: Exception) {
      notify("That message is too long to send.")
      return
    }
    val base = s.messages.filterNot { it.role == Role.USER && it.status == MessageStatus.FAILED }
    val userMessage = ChatMessage(UUID.randomUUID().toString(), Role.USER, text)
    _state.update { it.copy(messages = base + userMessage, sending = true, streamingText = "") }
    val gen = generation
    val signedIn = session.hasSession()
    val live = StringBuilder()
    sendJob = viewModelScope.launch(Dispatchers.IO) {
      // Repaint streamed text at a steady frame rate rather than on every token.
      val painter = launch {
        while (true) {
          delay(STREAM_FRAME_MS)
          val now = synchronized(live) { live.toString() }
          if (gen == generation) _state.update { if (it.streamingText != now) it.copy(streamingText = now) else it }
        }
      }
      val listener = SoloApi.DeltaListener { delta -> synchronized(live) { live.append(delta) } }
      var attempt = request
      var result: SoloApi.Result
      val token = if (signedIn) currentAccessToken() else null
      if (signedIn && token == null) {
        result = if (session.hasSession())
          SoloApi.Result.failure(0, "Couldn't confirm your sign-in. Check your connection and try again.", "session_unconfirmed")
        else SoloApi.Result.failure(401, "Please sign in again.", "session_expired")
      } else {
        result = api.send(attempt, listener)
        // An expired access token is rejected before any quota is used, so one refresh and
        // resend (with a fresh request ID) is safe.
        if (signedIn && result.status == 401 && session.refreshToken() != null) {
          session.invalidateAccess()
          if (currentAccessToken() != null) {
            attempt = conversation.prepare(text, UUID.randomUUID().toString())
            result = api.send(attempt, listener)
          }
        }
      }
      painter.cancel()
      if (gen != generation) return@launch
      withContext(Dispatchers.Main) { finishSend(text, userMessage, attempt, result, signedIn) }
    }
  }

  private fun finishSend(text: String, user: ChatMessage, sent: Conversation.Request, r: SoloApi.Result, signedIn: Boolean) {
    val current = _state.value.messages
    if (r.ok) {
      conversation.commit(sent, r.reply)
      val reply = ChatMessage(UUID.randomUUID().toString(), Role.SOLO, r.reply,
        requestId = if (signedIn) sent.requestId else null, truncated = r.truncated)
      val messages = current + reply
      _state.update {
        it.copy(messages = messages, sending = false, streamingText = "",
          remainingDaily = r.remainingDaily ?: it.remainingDaily)
      }
      saveCurrent(messages)
      return
    }
    if (r.code == "cancelled") {
      // Stopped by the user: keep what arrived, but it never joins the history.
      val partial = r.partial?.trim().orEmpty()
      val messages = if (partial.isNotEmpty())
        current + ChatMessage(UUID.randomUUID().toString(), Role.SOLO, partial, MessageStatus.STOPPED)
      else current.dropLast(1)
      _state.update { it.copy(messages = messages, sending = false, streamingText = "") }
      if (partial.isNotEmpty()) saveCurrent(messages)
      return
    }
    if (r.status == 400 && r.code == null && conversation.useLegacyAssistantLimit()) {
      // An older server rejected long history: resend once with the original limits.
      _state.update { it.copy(messages = current.dropLast(1), sending = false, streamingText = "") }
      send(text)
      return
    }
    val failed = user.copy(status = MessageStatus.FAILED, error = r.error)
    _state.update { it.copy(messages = current.dropLast(1) + failed, sending = false, streamingText = "") }
    when {
      signedIn && r.status == 401 -> {
        session.clear()
        _state.update {
          it.copy(service = if (it.accountsEnabled) ServiceState.SIGNED_OUT else ServiceState.CLOSED,
            statusMessage = r.error, signedIn = false)
        }
      }
      ServicePolicy.meansClosed(r) ->
        _state.update { it.copy(service = ServiceState.CLOSED, statusMessage = r.error) }
    }
  }

  fun retry(message: ChatMessage) {
    _state.update { s -> s.copy(messages = s.messages.filterNot { it.id == message.id }) }
    send(message.text)
  }

  /** Asks again for a fresh answer to the last question. */
  fun regenerate() {
    val s = _state.value
    if (s.sending || !s.canChat) return
    val lastSolo = s.messages.lastOrNull() ?: return
    if (lastSolo.role != Role.SOLO || lastSolo.status != MessageStatus.DONE) return
    val lastUser = s.messages.dropLast(1).lastOrNull { it.role == Role.USER } ?: return
    val history = conversation.history().toList()
    if (history.size >= 2) conversation.restore(history.dropLast(2))
    val trimmed = s.messages.dropLast(1).dropLastWhile { it.id == lastUser.id }
    _state.update { it.copy(messages = trimmed) }
    send(lastUser.text)
  }

  fun stopGenerating() {
    if (!_state.value.sending) return
    // Disconnecting can touch the network, so never on the main thread.
    viewModelScope.launch(Dispatchers.IO) { api.cancel() }
  }

  // ---- Reporting ------------------------------------------------------------------

  fun report(message: ChatMessage, reasonIndex: Int, note: String) {
    val requestId = message.requestId ?: return
    val reason = REPORT_REASONS.getOrElse(reasonIndex) { "other" }
    val reported = Conversation.truncate(message.text, Conversation.MAX_ASSISTANT_CHARS)
    viewModelScope.launch(Dispatchers.IO) {
      val token = currentAccessToken()
      if (token == null) { notify("Sign in again to send this report."); return@launch }
      val result = account.report(token, requestId, reason, note, reported)
      notify(if (result.ok) "Thanks. The reply was reported for review." else result.message)
    }
  }

  // ---- Read aloud -----------------------------------------------------------------

  fun toggleSpeak(message: ChatMessage) {
    if (_state.value.speakingMessageId == message.id) {
      tts?.stop()
      _state.update { it.copy(speakingMessageId = null) }
      return
    }
    val speakText = MarkdownText.plain(message.text)
    val engine = tts
    if (engine != null && ttsReady) {
      speakNow(engine, message.id, speakText)
      return
    }
    tts = TextToSpeech(getApplication()) { status ->
      ttsReady = status == TextToSpeech.SUCCESS
      val e = tts
      if (ttsReady && e != null) {
        e.language = Locale("en", "AU")
        e.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(id: String?) {}
          override fun onDone(id: String?) { _state.update { if (it.speakingMessageId == id) it.copy(speakingMessageId = null) else it } }
          @Deprecated("Deprecated in Java") override fun onError(id: String?) { onDone(id) }
        })
        speakNow(e, message.id, speakText)
      } else {
        notify("Read aloud isn't available on this phone.")
      }
    }
  }

  private fun speakNow(engine: TextToSpeech, id: String, text: String) {
    engine.speak(text.take(TextToSpeech.getMaxSpeechInputLength() - 1), TextToSpeech.QUEUE_FLUSH, null, id)
    _state.update { it.copy(speakingMessageId = id) }
  }

  private fun notify(text: String) {
    _notices.trySend(text)
  }

  override fun onCleared() {
    generation++
    if (_state.value.sending) Thread { api.cancel() }.start()
    tts?.shutdown()
    super.onCleared()
  }
}
