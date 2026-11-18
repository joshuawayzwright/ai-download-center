package au.com.thesoloserviceprovider.solo

/** Where the SOLO service stands for this device. */
enum class ServiceState { CHECKING, READY, CLOSED, OFFLINE, SIGNED_OUT, UNVERIFIED }

enum class Role { USER, SOLO }

enum class MessageStatus {
  DONE,
  /** A user message that was not sent; it never joined the history. */
  FAILED,
  /** A reply stopped by the user; shown, but never part of the history. */
  STOPPED,
}

data class ChatMessage(
  val id: String,
  val role: Role,
  val text: String,
  val status: MessageStatus = MessageStatus.DONE,
  /** For replies to a signed-in account: the request that can be reported. */
  val requestId: String? = null,
  val truncated: Boolean = false,
  /** For FAILED user messages: the server's error text. */
  val error: String? = null,
  /** Web pages a reply drew on (Google Search). HTTPS only. */
  val sources: List<Source> = emptyList(),
  /** Connected apps read for this reply, e.g. "google_calendar". */
  val connectors: List<String> = emptyList(),
)

/** An app the account can connect in Settings → Connected apps. */
data class ConnectedApp(val provider: String, val name: String, val connected: Boolean)

/** What a reply's connector note says, e.g. "Checked your Google Calendar". */
object Connectors {
  @JvmStatic
  fun label(provider: String): String = when (provider) {
    "google_calendar" -> "Checked your Google Calendar"
    else -> "Checked a connected app"
  }
}

/** A web page a reply drew on. */
data class Source(val title: String, val url: String) {
  /**
   * The website to show. Google Search answers link through a Google redirect host, and their
   * title is then the real site (for example "rba.gov.au"), so the title is shown instead.
   */
  val site: String get() {
    val host = SoloApi.host(url)
    return if (host == REDIRECT_HOST || host.endsWith(".$REDIRECT_HOST")) title else host
  }

  private companion object { const val REDIRECT_HOST = "vertexaisearch.cloud.google.com" }
}

/** One saved conversation. [history] is exactly what the API contract allows to be resent. */
data class ChatThread(
  val id: String,
  val title: String,
  val updatedAt: Long,
  val messages: List<ChatMessage>,
  val history: List<Conversation.Message>,
)

data class ThreadSummary(val id: String, val title: String, val updatedAt: Long)

data class UiState(
  val service: ServiceState = ServiceState.CHECKING,
  val statusMessage: String? = null,
  /** True only when the server reports that app sign-in is switched on. */
  val accountsEnabled: Boolean = false,
  /** True when the server accepts new accounts from the app. */
  val signupEnabled: Boolean = false,
  /** True when "forgot password" (reset by emailed code) is available. */
  val recoveryEnabled: Boolean = false,
  /** "member" (early access) or "free"; null when unknown. */
  val tier: String? = null,
  val signedIn: Boolean = false,
  val email: String? = null,
  val remainingDaily: Int? = null,
  val dailyLimit: Int? = null,
  val threads: List<ThreadSummary> = emptyList(),
  val currentThreadId: String? = null,
  val messages: List<ChatMessage> = emptyList(),
  val sending: Boolean = false,
  /** Text streaming in for the reply being written right now. */
  val streamingText: String = "",
  val speakingMessageId: String? = null,
  val voiceAvailable: Boolean = false,
  /** True when the server offers connected apps to this signed-in account. */
  val connectorsAvailable: Boolean = false,
  /** SOLO AI Pro (or a tester during the closed test): may connect apps. */
  val connectorsPro: Boolean = false,
  val connectedApps: List<ConnectedApp> = emptyList(),
  /** The app being connected or disconnected right now. */
  val connectorBusy: String? = null,
  /** Shown while a reply is being written, e.g. "Checked your Google Calendar". */
  val toolNote: String? = null,
) {
  val canChat: Boolean get() = service == ServiceState.READY
  val lastSoloMessageId: String? get() = messages.lastOrNull { it.role == Role.SOLO && it.status == MessageStatus.DONE }?.id
}

/** Server responses that mean conversations are switched off, not a transient failure. */
object ServicePolicy {
  @JvmStatic
  fun meansClosed(r: SoloApi.Result): Boolean = when (r.status) {
    404, 410 -> true
    503 -> r.code == null || r.code == "customer_disabled" || r.code == "private_testing_disabled"
    403 -> r.code == "access_denied" || r.code == "member_expired" || r.code == "member_blocked"
    // 401 without a code is the owner-only private test gate.
    401 -> r.code == null
    else -> false
  }
}

/** Test hooks; always null in the shipped app. */
object SoloConfig {
  @JvmStatic @Volatile var endpointOverride: String? = null
}

/**
 * Outcome of an account step in the sign-in sheet. [error] is null on success.
 * [needsCode] means the address isn't verified yet: show the code step.
 */
data class AccountResult(val error: String? = null, val needsCode: Boolean = false) {
  companion object {
    val OK = AccountResult()
    fun fail(message: String?) = AccountResult(message ?: "Something went wrong. Please try again.")
  }
}
