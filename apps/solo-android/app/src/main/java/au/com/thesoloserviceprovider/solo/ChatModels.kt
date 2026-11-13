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
)

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
