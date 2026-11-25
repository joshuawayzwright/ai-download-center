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
    const val NO_VOICE = "Read aloud needs a voice on your phone. Open Settings, search for \"Text-to-speech\", " +
      "choose Speech Recognition and Synthesis from Google, and install English (Australia)."
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

  init {
    viewModelScope.launch(Dispatchers.IO) {
      threads = store.load().sortedByDescending { it.updatedAt }.toMutableList()
      val voice = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        .resolveActivity(app.packageManager) != null
      _state.update { it.copy(threads = summaries(), voiceAvailable = voice) }
    }
    checkService()
    startTts()
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
          signupEnabled = st?.enabled == true && st.signupEnabled,
          recoveryEnabled = st?.enabled == true && st.recoveryEnabled,
          signedIn = session.hasSession(),
          email = st?.email ?: session.email(),
          tier = if (st?.authenticated == true) st.tier else it.tier.takeIf { session.hasSession() },
          remainingDaily = (if (st?.authenticated == true) st.remainingDaily else null) ?: it.remainingDaily.takeIf { session.hasSession() },
          dailyLimit = (if (st?.authenticated == true) st.dailyLimit else null) ?: it.dailyLimit.takeIf { session.hasSession() },
        )
      }
      if (st?.authenticated == true) loadConnections() else clearConnections()
    }
  }

  // ---- Connected apps --------------------------------------------------------------

  private fun clearConnections() {
    _state.update { it.copy(connectorsAvailable = false, connectorsPro = false, connectedApps = emptyList(), connectorBusy = null) }
  }

  private fun applyConnections(c: AccountApi.Connections) {
    if (c.httpStatus != 200) {
      // Switched off on the server: hide the section. A temporary failure keeps what is shown.
      if (!c.available) clearConnections()
      return
    }
    _state.update {
      it.copy(connectorsAvailable = true, connectorsPro = c.pro,
        connectedApps = c.apps.map { a -> ConnectedApp(a.provider, a.name, a.connected, a.access, a.builtin) })
    }
  }

  /** Reads which apps are connected. IO thread only. */
  private fun loadConnections() {
    val token = currentAccessToken() ?: return
    applyConnections(account.connections(token))
  }

  /** Re-reads connected apps, e.g. on return from the browser. [announce]: say what changed. */
  fun refreshConnections(announce: Boolean = false) {
    if (!session.hasSession()) return
    val before = _state.value.connectedApps.filter { it.connected }.map { it.provider }.toSet()
    viewModelScope.launch(Dispatchers.IO) {
      loadConnections()
      if (!announce) return@launch
      val now = _state.value.connectedApps.filter { it.connected }
      now.firstOrNull { it.provider !in before }?.let { notify("${it.name} is connected") }
    }
  }

  /** Starts connecting [provider]. Returns the link to open in the browser, or null after a notice. */
  suspend fun connect(provider: String): String? = withContext(Dispatchers.IO) {
    _state.update { it.copy(connectorBusy = provider) }
    try {
      val token = currentAccessToken() ?: run { notify("Sign in again to connect apps."); return@withContext null }
      val start = account.connect(token, provider)
      if (start.url == null) notify(start.error ?: "Couldn't start connecting. Please try again.")
      start.url
    } finally {
      _state.update { it.copy(connectorBusy = null) }
    }
  }

  /** Opens Google's file picker so the user chooses which Drive files SOLO may open. */
  suspend fun pickDriveFiles(): String? = withContext(Dispatchers.IO) {
    _state.update { it.copy(connectorBusy = "google_drive") }
    try {
      val token = currentAccessToken() ?: run { notify("Sign in again to pick files."); return@withContext null }
      val start = account.pick(token, "google_drive")
      if (start.url == null) notify(start.error ?: "Couldn't open Google Drive. Please try again.")
      start.url
    } finally {
      _state.update { it.copy(connectorBusy = null) }
    }
  }

  // ---- Confirm cards ---------------------------------------------------------------

  private fun updateAction(messageId: String, token: String, change: (ActionCard) -> ActionCard) {
    _state.update { s ->
      s.copy(messages = s.messages.map { m ->
        if (m.id != messageId) m else m.copy(actions = m.actions.map { if (it.token == token) change(it) else it })
      })
    }
  }

  /** The user tapped Confirm: ask the server to make the change (it runs each card once). */
  fun confirmAction(messageId: String, token: String) {
    val card = _state.value.messages.firstOrNull { it.id == messageId }?.actions?.firstOrNull { it.token == token } ?: return
    if (card.state != ActionState.PENDING) return
    updateAction(messageId, token) { it.copy(state = ActionState.RUNNING) }
    viewModelScope.launch(Dispatchers.IO) {
      val access = currentAccessToken()
      val result = if (access == null) AccountApi.ActionResult(false, "Sign in again, then tap Confirm.", null)
        else account.execute(access, token)
      updateAction(messageId, token) {
        it.copy(state = if (result.ok) ActionState.DONE else if (access == null) ActionState.PENDING else ActionState.FAILED,
          result = result.message, url = result.url)
      }
      withContext(Dispatchers.Main) { saveCurrent(_state.value.messages) }
    }
  }

  fun cancelAction(messageId: String, token: String) {
    updateAction(messageId, token) { if (it.state == ActionState.PENDING) it.copy(state = ActionState.CANCELLED) else it }
    saveCurrent(_state.value.messages)
  }

  fun disconnect(provider: String) {
    val name = _state.value.connectedApps.firstOrNull { it.provider == provider }?.name ?: "The app"
    _state.update { it.copy(connectorBusy = provider) }
    viewModelScope.launch(Dispatchers.IO) {
      try {
        val token = currentAccessToken() ?: run { notify("Sign in again to disconnect apps."); return@launch }
        val result = account.disconnect(token, provider)
        if (result.httpStatus == 200) {
          applyConnections(result)
          notify("$name is disconnected")
        } else notify(result.error ?: "Couldn't disconnect. Please try again.")
      } finally {
        _state.update { it.copy(connectorBusy = null) }
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

  /**
   * The email and password from the current create-account or sign-in attempt, kept only in
   * memory so the app can sign in straight after the code is verified (the server returns no
   * session) or send a new code. Never persisted; cleared after sign-in or when the sheet closes.
   */
  private var pendingEmail: String? = null
  private var pendingPassword: String? = null

  private fun rememberCredentials(email: String, password: String) {
    pendingEmail = email.trim(); pendingPassword = password
  }

  fun clearPendingCredentials() {
    pendingEmail = null; pendingPassword = null
  }

  /** Signs in. An unverified address returns [AccountResult.needsCode]. */
  suspend fun signIn(email: String, password: String): AccountResult = withContext(Dispatchers.IO) {
    val result = account.login(email, password)
    if (!result.ok()) {
      if (result.status.code == "email_not_confirmed") {
        rememberCredentials(email, password)
        return@withContext AccountResult(result.status.error, needsCode = true)
      }
      return@withContext AccountResult.fail(result.status.error ?: "Sign-in failed.")
    }
    clearPendingCredentials()
    session.save(result.accessToken, result.refreshToken, result.expiresIn, result.status.email ?: email.trim())
    withContext(Dispatchers.Main) { checkService() }
    AccountResult.OK
  }

  /** Creates an account; on success an 8-digit code is on its way to [email]. */
  suspend fun signUp(email: String, password: String): AccountResult = withContext(Dispatchers.IO) {
    val result = account.signup(email, password)
    if (!result.ok) return@withContext AccountResult.fail(result.message)
    rememberCredentials(email, password)
    AccountResult.OK
  }

  /** Sends a new code for an unverified address (sign-up again, which the server answers neutrally). */
  suspend fun resendCode(email: String): AccountResult = withContext(Dispatchers.IO) {
    val password = pendingPassword
    if (password == null || pendingEmail != email.trim()) {
      return@withContext AccountResult.fail("Go back and enter your email and password again to get a new code.")
    }
    val result = account.signup(email, password)
    if (result.ok) AccountResult.OK else AccountResult.fail(result.message)
  }

  /** Verifies the address with the emailed code, then signs in with the remembered password. */
  suspend fun verifyEmail(email: String, code: String): AccountResult = withContext(Dispatchers.IO) {
    val result = account.verifyEmail(email, code)
    if (!result.ok) return@withContext AccountResult.fail(result.message)
    val password = pendingPassword
    if (password == null || pendingEmail != email.trim()) {
      return@withContext AccountResult.fail("Your email is confirmed. Sign in with your password to continue.")
    }
    signIn(email, password)
  }

  /** Asks for a password reset code. */
  suspend fun requestReset(email: String): AccountResult = withContext(Dispatchers.IO) {
    val result = account.requestReset(email)
    if (result.ok) AccountResult.OK else AccountResult.fail(result.message)
  }

  /** Sets a new password with the emailed code, then signs in with it. */
  suspend fun resetPassword(email: String, code: String, password: String): AccountResult = withContext(Dispatchers.IO) {
    val result = account.resetPassword(email, code, password)
    if (!result.ok) return@withContext AccountResult.fail(result.message)
    signIn(email, password)
  }

  /**
   * Permanently deletes the signed-in account on the server, then signs out and clears the
   * conversations saved on this phone. Returns null on success, or the error to show.
   */
  suspend fun deleteAccount(): String? = withContext(Dispatchers.IO) {
    var token = currentAccessToken()
      ?: return@withContext if (session.hasSession()) "Couldn't confirm your sign-in. Check your connection and try again."
      else "Sign in again to delete your account."
    var result = account.deleteAccount(token)
    if (result.httpStatus == 401 && session.refreshToken() != null) {
      // An expired access token: refresh once and try again.
      session.invalidateAccess()
      token = currentAccessToken() ?: return@withContext "Sign in again to delete your account."
      result = account.deleteAccount(token)
    }
    if (!result.ok) return@withContext result.message
    session.clear()
    withContext(Dispatchers.Main) {
      stopGenerating()
      threads.clear()
      newChat()
      _state.update { it.copy(threads = emptyList(), signedIn = false, email = null, tier = null,
        remainingDaily = null, dailyLimit = null) }
      clearConnections()
      notify("Your SOLO AI account was deleted")
      checkService()
    }
    store.clear()
    null
  }

  fun signOut() {
    val access = session.accessToken()
    val refresh = session.refreshToken()
    session.clear()
    stopGenerating()
    _state.update { it.copy(signedIn = false, email = null, tier = null, remainingDaily = null, dailyLimit = null) }
    clearConnections()
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
    conversation.setConnectors(if (s.connectorsPro) s.connectedApps.filter { it.connected }.map { it.provider } else emptyList())
    val request = try {
      conversation.prepare(text, UUID.randomUUID().toString())
    } catch (e: Exception) {
      notify("That message is too long to send.")
      return
    }
    val base = s.messages.filterNot { it.role == Role.USER && it.status == MessageStatus.FAILED }
    val userMessage = ChatMessage(UUID.randomUUID().toString(), Role.USER, text)
    _state.update { it.copy(messages = base + userMessage, sending = true, streamingText = "", toolNote = null) }
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
      val listener = object : SoloApi.DeltaListener {
        override fun onDelta(text: String) { synchronized(live) { live.append(text) } }
        override fun onTool(provider: String, label: String) {
          if (gen == generation) _state.update { it.copy(toolNote = label) }
        }
      }
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
        requestId = if (signedIn) sent.requestId else null, truncated = r.truncated,
        sources = r.sources.map { Source(it.title, it.url) }, connectors = r.connectors.toList(),
        actions = r.actions.map { ActionCard(it.token, it.provider, it.title, it.lines.toList(), it.confirmLabel) })
      val messages = current + reply
      _state.update {
        it.copy(messages = messages, sending = false, streamingText = "", toolNote = null,
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
      _state.update { it.copy(messages = messages, sending = false, streamingText = "", toolNote = null) }
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
    _state.update { it.copy(messages = current.dropLast(1) + failed, sending = false, streamingText = "", toolNote = null) }
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
  // The phone's own text-to-speech engine reads replies on the device. It is started
  // when the app opens, so the first tap on the speaker speaks straight away.

  private enum class Tts { OFF, STARTING, READY, FAILED }
  private var ttsStatus = Tts.OFF
  /** A reply tapped while the engine was still starting: (message id, text). */
  private var pendingSpeech: Pair<String, String>? = null

  private fun startTts() {
    if (tts != null && ttsStatus != Tts.FAILED) return
    tts?.shutdown()
    ttsStatus = Tts.STARTING
    tts = try {
      TextToSpeech(getApplication()) { status -> onTtsReady(status) }
    } catch (e: Exception) {
      ttsStatus = Tts.FAILED
      null
    }
  }

  private fun onTtsReady(status: Int) {
    val engine = tts
    if (status != TextToSpeech.SUCCESS || engine == null || !chooseVoice(engine)) {
      ttsStatus = Tts.FAILED
      if (pendingSpeech != null) {
        pendingSpeech = null
        _state.update { it.copy(speakingMessageId = null) }
        notify(NO_VOICE)
      }
      return
    }
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(id: String?) {}
      override fun onDone(id: String?) { _state.update { if (it.speakingMessageId == id) it.copy(speakingMessageId = null) else it } }
      @Deprecated("Deprecated in Java") override fun onError(id: String?) { onDone(id) }
      override fun onError(id: String?, errorCode: Int) {
        onDone(id)
        notify("Read aloud stopped. Check your phone's text-to-speech voice and media volume.")
      }
    })
    ttsStatus = Tts.READY
    pendingSpeech?.let { (id, text) -> pendingSpeech = null; speakNow(engine, id, text) }
  }

  /** Australian English if the phone has it, otherwise any English voice. */
  private fun chooseVoice(engine: TextToSpeech): Boolean {
    for (locale in listOf(Locale("en", "AU"), Locale.UK, Locale.US, Locale.ENGLISH)) {
      val result = try { engine.setLanguage(locale) } catch (e: Exception) { TextToSpeech.LANG_NOT_SUPPORTED }
      if (result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED) return true
    }
    return false
  }

  fun toggleSpeak(message: ChatMessage) {
    if (_state.value.speakingMessageId == message.id) {
      pendingSpeech = null
      tts?.stop()
      _state.update { it.copy(speakingMessageId = null) }
      return
    }
    val speakText = MarkdownText.plain(message.text)
    // Show the stop button at once, even while the engine finishes starting.
    _state.update { it.copy(speakingMessageId = message.id) }
    if (mediaVolumeOff()) notify("Your media volume is off. Turn it up to hear SOLO.")
    val engine = tts
    when {
      engine != null && ttsStatus == Tts.READY -> speakNow(engine, message.id, speakText)
      else -> { pendingSpeech = message.id to speakText; startTts() }
    }
  }

  private fun mediaVolumeOff(): Boolean = try {
    val audio = getApplication<Application>().getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
    audio.getStreamVolume(android.media.AudioManager.STREAM_MUSIC) == 0
  } catch (e: Exception) { false }

  private fun speakNow(engine: TextToSpeech, id: String, text: String) {
    val result = engine.speak(text.take(TextToSpeech.getMaxSpeechInputLength() - 1), TextToSpeech.QUEUE_FLUSH, null, id)
    if (result == TextToSpeech.ERROR) {
      _state.update { if (it.speakingMessageId == id) it.copy(speakingMessageId = null) else it }
      notify(NO_VOICE)
    } else {
      _state.update { it.copy(speakingMessageId = id) }
    }
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
