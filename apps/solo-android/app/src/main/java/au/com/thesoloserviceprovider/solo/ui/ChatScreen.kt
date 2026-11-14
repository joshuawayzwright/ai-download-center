package au.com.thesoloserviceprovider.solo.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.speech.RecognizerIntent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import au.com.thesoloserviceprovider.solo.ChatMessage
import au.com.thesoloserviceprovider.solo.ChatViewModel
import au.com.thesoloserviceprovider.solo.Conversation
import au.com.thesoloserviceprovider.solo.MarkdownText
import au.com.thesoloserviceprovider.solo.Role
import au.com.thesoloserviceprovider.solo.ServiceState
import au.com.thesoloserviceprovider.solo.UiState
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

const val SITE = "https://thesoloserviceprovider.com.au"
const val INTEREST = "mailto:hello@thesoloserviceprovider.com.au?subject=SOLO%20AI%20early%20access"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SoloApp(vm: ChatViewModel) {
  val state by vm.state.collectAsState()
  val context = LocalContext.current
  val drawer = rememberDrawerState(DrawerValue.Closed)
  val scope = rememberCoroutineScope()
  val snackbar = remember { SnackbarHostState() }
  var showSettings by rememberSaveable { mutableStateOf(false) }
  var showSignIn by rememberSaveable { mutableStateOf(false) }
  var accountMode by rememberSaveable { mutableStateOf(AccountMode.SIGN_IN) }
  fun openAccount(mode: AccountMode) { accountMode = mode; showSignIn = true }
  var reportTarget by remember { mutableStateOf<ChatMessage?>(null) }

  LaunchedEffect(Unit) { vm.notices.collect { snackbar.showSnackbar(it) } }

  if (showSettings) {
    BackHandler { showSettings = false }
    SettingsScreen(
      state = state,
      onBack = { showSettings = false },
      onSignIn = { showSettings = false; openAccount(AccountMode.SIGN_IN) },
      onCreateAccount = { showSettings = false; openAccount(AccountMode.CREATE) },
      onSignOut = vm::signOut,
      onClearHistory = vm::clearAllHistory,
      onDeleteAccount = vm::deleteAccount,
    )
  } else {
    ModalNavigationDrawer(
      drawerState = drawer,
      drawerContent = {
        ConversationDrawer(
          state = state,
          onNew = { vm.newChat(); scope.launch { drawer.close() } },
          onOpen = { vm.openThread(it); scope.launch { drawer.close() } },
          onDelete = vm::deleteThread,
          onSettings = { showSettings = true; scope.launch { drawer.close() } },
        )
      },
    ) {
      ChatScaffold(
        state = state,
        snackbar = snackbar,
        onMenu = { scope.launch { drawer.open() } },
        onNewChat = vm::newChat,
        onSend = vm::send,
        onStop = vm::stopGenerating,
        onRetry = vm::retry,
        onRegenerate = vm::regenerate,
        onSpeak = vm::toggleSpeak,
        onReport = { reportTarget = it },
        onSignIn = { openAccount(AccountMode.SIGN_IN) },
        onCreateAccount = { openAccount(AccountMode.CREATE) },
        onRecheck = vm::checkService,
        onCopied = { copy(context, it); if (Build.VERSION.SDK_INT < 33) scope.launch { snackbar.showSnackbar("Copied") } },
      )
    }
  }

  if (showSignIn) SignInSheet(
    signupEnabled = state.signupEnabled,
    recoveryEnabled = state.recoveryEnabled,
    startMode = accountMode,
    onDismiss = { showSignIn = false; vm.clearPendingCredentials() },
    onSignIn = vm::signIn,
    onSignUp = vm::signUp,
    onVerify = vm::verifyEmail,
    onResendCode = vm::resendCode,
    onRequestReset = vm::requestReset,
    onResetPassword = vm::resetPassword,
  )
  reportTarget?.let { target ->
    ReportSheet(onDismiss = { reportTarget = null }, onSend = { reason, note -> vm.report(target, reason, note); reportTarget = null })
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatScaffold(
  state: UiState,
  snackbar: SnackbarHostState,
  onMenu: () -> Unit,
  onNewChat: () -> Unit,
  onSend: (String) -> Unit,
  onStop: () -> Unit,
  onRetry: (ChatMessage) -> Unit,
  onRegenerate: () -> Unit,
  onSpeak: (ChatMessage) -> Unit,
  onReport: (ChatMessage) -> Unit,
  onSignIn: () -> Unit,
  onCreateAccount: () -> Unit,
  onRecheck: () -> Unit,
  onCopied: (String) -> Unit,
) {
  val context = LocalContext.current
  val haptics = LocalHapticFeedback.current
  var draft by rememberSaveable { mutableStateOf("") }
  val listState = rememberLazyListState()
  val voice = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    val spoken = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.trim()
    if (!spoken.isNullOrEmpty()) draft = Conversation.truncate((draft.trim() + " " + spoken).trim(), Conversation.MAX_CHARS)
  }
  val itemCount = state.messages.size + if (state.sending) 1 else 0
  LaunchedEffect(itemCount, state.streamingText.length / 120) {
    if (itemCount > 0) listState.animateScrollToItem(itemCount - 1)
  }

  Scaffold(
    containerColor = Solo.Night,
    snackbarHost = { SnackbarHost(snackbar) },
    topBar = {
      CenterAlignedTopAppBar(
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = Solo.Night),
        navigationIcon = {
          IconButton(onClick = onMenu) { Icon(Icons.Outlined.Menu, contentDescription = "Conversations and settings", tint = Solo.Text) }
        },
        title = {
          Row(verticalAlignment = Alignment.CenterVertically) {
            SoloAvatar(28.dp, thinking = state.sending)
            Spacer(Modifier.width(10.dp))
            Column {
              Text("SOLO AI", style = MaterialTheme.typography.titleLarge, color = Solo.Gold, modifier = Modifier.semantics { heading() })
              Text(subtitle(state), style = MaterialTheme.typography.labelSmall, color = Solo.TextMuted)
            }
          }
        },
        actions = {
          IconButton(onClick = onNewChat, enabled = state.messages.isNotEmpty() || state.sending) {
            Icon(Icons.Outlined.EditNote, contentDescription = "New conversation", tint = Solo.Text)
          }
        },
      )
    },
    bottomBar = {
      Composer(
        state = state,
        draft = draft,
        onDraft = { draft = it },
        onSend = {
          haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
          onSend(draft); draft = ""
        },
        onStop = onStop,
        onMic = {
          voice.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-AU")
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "Ask SOLO AI"))
        },
      )
    },
  ) { padding ->
    Box(Modifier.fillMaxSize().padding(padding)) {
      if (state.messages.isEmpty() && !state.sending) {
        Welcome(state, onSuggestion = { onSend(it) }, onSignIn = onSignIn, onCreateAccount = onCreateAccount, onRecheck = onRecheck)
      } else {
        LazyColumn(
          state = listState,
          modifier = Modifier.fillMaxSize().testTag("messages"),
          contentPadding = PaddingValues(horizontal = 18.dp, vertical = 16.dp),
          verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
          items(state.messages, key = { it.id }) { m ->
            if (m.role == Role.USER) {
              UserMessage(m, onRetry = { onRetry(m) }, onCopy = { onCopied(m.text) })
            } else {
              SoloMessage(
                message = m,
                isLast = m.id == state.lastSoloMessageId && m.id == state.messages.last().id && !state.sending,
                speaking = state.speakingMessageId == m.id,
                canReport = m.requestId != null && state.signedIn,
                onCopy = { onCopied(MarkdownText.plain(m.text)) },
                onCopyCode = onCopied,
                onSpeak = { onSpeak(m) },
                onShare = { share(context, shareText(m)) },
                onOpenSource = { url -> openLink(context, url) },
                onRegenerate = onRegenerate,
                onReport = { onReport(m) },
              )
            }
          }
          if (state.sending) item(key = "streaming") { StreamingMessage(state.streamingText, onCopied) }
          if (!state.canChat && state.service != ServiceState.CHECKING) {
            item(key = "status") { StatusCard(state, onSignIn, onCreateAccount, onRecheck) }
          }
        }
      }
    }
  }
}

private fun subtitle(state: UiState): String = when (state.service) {
  ServiceState.CHECKING -> "Connecting…"
  ServiceState.READY -> state.remainingDaily?.let { if (it == 1) "1 message left today" else "$it messages left today" }
    ?: "Your AI guide. Always on."
  ServiceState.SIGNED_OUT -> if (state.signupEnabled) "Create a free account to start" else "Sign in to start"
  ServiceState.OFFLINE -> "Offline"
  ServiceState.UNVERIFIED -> "Reconnecting…"
  ServiceState.CLOSED -> "Early access"
}

private fun greeting(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
  in 5..11 -> "Good morning"
  in 12..17 -> "Good afternoon"
  else -> "Good evening"
}

private data class Suggestion(val icon: androidx.compose.ui.graphics.vector.ImageVector, val title: String, val prompt: String)

private val SUGGESTIONS = listOf(
  Suggestion(Icons.Outlined.CalendarMonth, "Plan my week", "Help me plan my week around my client work."),
  Suggestion(Icons.AutoMirrored.Outlined.Chat, "Write a follow-up", "Write a short, friendly follow-up email to a client about a quote."),
  Suggestion(Icons.Outlined.Lightbulb, "Grow my business", "Give me three practical ways to win more work as a solo operator."),
  Suggestion(Icons.Outlined.AutoAwesome, "Find AI tools", "Which AI tools suit a solo business, and what would I use each for?"),
)

@Composable
private fun Welcome(state: UiState, onSuggestion: (String) -> Unit, onSignIn: () -> Unit, onCreateAccount: () -> Unit, onRecheck: () -> Unit) {
  LazyColumn(
    Modifier.fillMaxSize(),
    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    item {
      Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(top = 18.dp)) {
        Box(Modifier.size(170.dp).background(
          Brush.radialGradient(listOf(Solo.Blue.copy(alpha = 0.35f), Color.Transparent)), RoundedCornerShape(85.dp)))
        SoloAvatar(118.dp, thinking = state.service == ServiceState.CHECKING)
      }
    }
    item {
      Text(greeting(), style = MaterialTheme.typography.displaySmall, color = Solo.Text, textAlign = TextAlign.Center,
        modifier = Modifier.semantics { heading() })
    }
    item {
      Text("I'm SOLO AI, your guide for planning, writing and getting more done.",
        style = MaterialTheme.typography.bodyLarge, color = Solo.TextMuted, textAlign = TextAlign.Center,
        modifier = Modifier.padding(horizontal = 12.dp))
    }
    if (state.canChat) {
      item { Spacer(Modifier.height(8.dp)) }
      items(SUGGESTIONS.chunked(2)) { pair ->
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
          for (s in pair) SuggestionCard(s, Modifier.weight(1f)) { onSuggestion(s.prompt) }
        }
      }
    } else if (state.service != ServiceState.CHECKING) {
      item { StatusCard(state, onSignIn, onCreateAccount, onRecheck) }
    } else {
      item { CircularProgressIndicator(color = Solo.Gold, strokeWidth = 2.dp, modifier = Modifier.padding(24.dp).size(28.dp)) }
    }
  }
}

@Composable
private fun SuggestionCard(s: Suggestion, modifier: Modifier, onClick: () -> Unit) {
  Column(
    modifier.clip(RoundedCornerShape(20.dp)).background(Solo.Surface)
      .border(1.dp, Solo.Outline, RoundedCornerShape(20.dp)).clickable(onClick = onClick)
      .heightIn(min = 104.dp).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    Icon(s.icon, contentDescription = null, tint = Solo.Gold, modifier = Modifier.size(22.dp))
    Text(s.title, style = MaterialTheme.typography.titleSmall, color = Solo.Text)
  }
}

@Composable
fun StatusCard(state: UiState, onSignIn: () -> Unit, onCreateAccount: () -> Unit, onRecheck: () -> Unit) {
  val context = LocalContext.current
  val freeSignup = state.service == ServiceState.SIGNED_OUT && state.signupEnabled
  val (title, body, action) = when {
    freeSignup -> Triple("Create a free account to start",
      state.statusMessage ?: "Get free messages with SOLO AI every day. Nothing is sent until you sign in.", "Create account")
    else -> when (state.service) {
    ServiceState.SIGNED_OUT -> Triple("Sign in to chat with SOLO AI",
      state.statusMessage ?: "SOLO AI is in early access for invited accounts. Nothing is sent until you sign in.", "Sign in")
    ServiceState.OFFLINE -> Triple("Can't reach SOLO AI", "Check your connection, then try again.", "Try again")
    ServiceState.UNVERIFIED -> Triple("Can't confirm your sign-in",
      "SOLO AI couldn't check your account just now. You're still signed in.", "Try again")
    else -> Triple("SOLO AI chat isn't open yet",
      state.statusMessage ?: "Conversations open when early access reaches your account.", "Express interest")
    }
  }
  Column(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Solo.Surface)
      .border(1.dp, Solo.GoldDeep.copy(alpha = 0.6f), RoundedCornerShape(22.dp)).padding(20.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    if (state.service == ServiceState.OFFLINE) Icon(Icons.Outlined.WifiOff, contentDescription = null, tint = Solo.Gold)
    Text(title, style = MaterialTheme.typography.titleMedium, color = Solo.Gold, modifier = Modifier.testTag("status-title"))
    Text(body, style = MaterialTheme.typography.bodyMedium, color = Solo.TextMuted)
    Button(
      onClick = {
        when {
          freeSignup -> onCreateAccount()
          else -> when (state.service) {
          ServiceState.SIGNED_OUT -> onSignIn()
          ServiceState.OFFLINE, ServiceState.UNVERIFIED -> onRecheck()
          else -> context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(INTEREST)))
          }
        }
      },
      colors = ButtonDefaults.buttonColors(containerColor = Solo.Gold, contentColor = Solo.OnGold),
      shape = RoundedCornerShape(14.dp),
      modifier = Modifier.testTag("status-action"),
    ) { Text(action, style = MaterialTheme.typography.labelLarge) }
    if (freeSignup) {
      TextButton(onClick = onSignIn, modifier = Modifier.testTag("status-sign-in")) {
        Text("I already have an account. Sign in", color = Solo.Gold)
      }
    }
  }
}

@Composable
private fun Composer(state: UiState, draft: String, onDraft: (String) -> Unit, onSend: () -> Unit, onStop: () -> Unit, onMic: () -> Unit) {
  Column(Modifier.fillMaxWidth().background(Solo.Night).navigationBarsPadding().imePadding().padding(horizontal = 12.dp, vertical = 8.dp)) {
    Row(
      Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Solo.Surface)
        .border(1.dp, Solo.Outline, RoundedCornerShape(28.dp)).padding(start = 6.dp, end = 4.dp),
      verticalAlignment = Alignment.Bottom,
    ) {
      TextField(
        value = draft,
        onValueChange = { if (it.length <= Conversation.MAX_CHARS) onDraft(it) },
        enabled = state.canChat,
        placeholder = { Text(if (state.canChat) "Message SOLO AI" else "Chat opens when SOLO is ready", color = Solo.Steel) },
        maxLines = 6,
        textStyle = MaterialTheme.typography.bodyLarge,
        colors = TextFieldDefaults.colors(
          focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent,
          disabledContainerColor = Color.Transparent, focusedIndicatorColor = Color.Transparent,
          unfocusedIndicatorColor = Color.Transparent, disabledIndicatorColor = Color.Transparent,
          cursorColor = Solo.Gold, focusedTextColor = Solo.Text, unfocusedTextColor = Solo.Text,
        ),
        modifier = Modifier.weight(1f).testTag("composer"),
      )
      Box(Modifier.padding(bottom = 4.dp)) {
        SendButton(
          sending = state.sending,
          canSend = state.canChat && Conversation.validateDraft(draft) == null,
          showMic = state.canChat && draft.isBlank() && state.voiceAvailable,
          onSend = onSend, onStop = onStop, onMic = onMic,
        )
      }
    }
    AnimatedVisibility(draft.length > 1000, enter = fadeIn(), exit = fadeOut()) {
      Text("${draft.length} / 1200", style = MaterialTheme.typography.labelSmall, color = Solo.Steel,
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp, end = 12.dp), textAlign = TextAlign.End)
    }
    Text("SOLO AI can make mistakes. Don't share passwords, payment or private details.",
      style = MaterialTheme.typography.labelSmall, color = Solo.Steel, textAlign = TextAlign.Center,
      modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
  }
}

@Composable
private fun ConversationDrawer(state: UiState, onNew: () -> Unit, onOpen: (String) -> Unit, onDelete: (String) -> Unit, onSettings: () -> Unit) {
  ModalDrawerSheet(drawerContainerColor = Solo.Surface, drawerShape = RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp)) {
    Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
      SoloAvatar(36.dp)
      Spacer(Modifier.width(12.dp))
      Column {
        Text("SOLO AI", style = MaterialTheme.typography.titleLarge, color = Solo.Gold)
        Text(state.email ?: "Your AI guide. Always on.", style = MaterialTheme.typography.bodySmall, color = Solo.TextMuted,
          maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
    OutlinedButton(
      onClick = onNew, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
      shape = RoundedCornerShape(14.dp),
    ) {
      Icon(Icons.Rounded.Add, contentDescription = null, tint = Solo.Gold)
      Spacer(Modifier.width(8.dp))
      Text("New conversation", color = Solo.Gold)
    }
    Text("Recent", style = MaterialTheme.typography.labelMedium, color = Solo.Steel, modifier = Modifier.padding(start = 24.dp, top = 20.dp, bottom = 6.dp))
    LazyColumn(Modifier.weight(1f)) {
      if (state.threads.isEmpty()) {
        item {
          Text("Your conversations are saved on this phone and appear here.", style = MaterialTheme.typography.bodySmall,
            color = Solo.TextMuted, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
        }
      }
      items(state.threads, key = { it.id }) { t ->
        NavigationDrawerItem(
          label = {
            Column {
              Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
              Text(DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(t.updatedAt)),
                style = MaterialTheme.typography.labelSmall, color = Solo.Steel)
            }
          },
          selected = t.id == state.currentThreadId,
          onClick = { onOpen(t.id) },
          badge = {
            IconButton(onClick = { onDelete(t.id) }) {
              Icon(Icons.Outlined.Delete, contentDescription = "Delete ${t.title}", tint = Solo.Steel, modifier = Modifier.size(18.dp))
            }
          },
          colors = NavigationDrawerItemDefaults.colors(
            selectedContainerColor = Solo.SurfaceHigh, unselectedContainerColor = Color.Transparent,
            selectedTextColor = Solo.Text, unselectedTextColor = Solo.Text,
          ),
          modifier = Modifier.padding(horizontal = 12.dp),
        )
      }
    }
    HorizontalDivider(color = Solo.Outline)
    NavigationDrawerItem(
      icon = { Icon(Icons.Outlined.Settings, contentDescription = null, tint = Solo.TextMuted) },
      label = { Text("Settings and account") },
      selected = false, onClick = onSettings,
      colors = NavigationDrawerItemDefaults.colors(unselectedContainerColor = Color.Transparent, unselectedTextColor = Solo.Text),
      modifier = Modifier.padding(12.dp),
    )
  }
}

fun copy(context: Context, text: String) {
  val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
  clipboard.setPrimaryClip(ClipData.newPlainText("SOLO AI", text))
}

/** The reply as plain text, followed by its source links. */
fun shareText(m: ChatMessage): String {
  val body = MarkdownText.plain(m.text)
  if (m.sources.isEmpty()) return body
  return body + "\n\nSources:\n" + m.sources.joinToString("\n") { it.url }
}

/** Opens an https link in the browser. Anything else is ignored. */
fun openLink(context: Context, url: String) {
  if (!url.startsWith("https://")) return
  try {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  } catch (e: android.content.ActivityNotFoundException) { /* no browser installed */ }
}

fun share(context: Context, text: String) {
  val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
  context.startActivity(Intent.createChooser(send, "Share SOLO AI reply"))
}
