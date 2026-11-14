package au.com.thesoloserviceprovider.solo.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
  focusedBorderColor = Solo.Gold, unfocusedBorderColor = Solo.Outline, cursorColor = Solo.Gold,
  focusedLabelColor = Solo.Gold, unfocusedLabelColor = Solo.TextMuted,
  focusedTextColor = Solo.Text, unfocusedTextColor = Solo.Text,
)

/** What the account sheet is doing. */
enum class AccountMode { SIGN_IN, CREATE, RESET }

private const val MIN_PASSWORD = 8
private const val MAX_PASSWORD = 72
private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignInSheet(
  signupEnabled: Boolean,
  startMode: AccountMode = AccountMode.SIGN_IN,
  onDismiss: () -> Unit,
  onSignIn: suspend (String, String) -> String?,
  onSignUp: suspend (String, String) -> String? = { _, _ -> "Creating accounts isn't available yet." },
  onReset: suspend (String) -> String? = { "Password reset isn't available yet." },
) {
  val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  val scope = rememberCoroutineScope()
  var mode by rememberSaveable { mutableStateOf(if (startMode == AccountMode.CREATE && !signupEnabled) AccountMode.SIGN_IN else startMode) }
  var email by rememberSaveable { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var showPassword by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  /** Set after a successful create or reset request: the address the email went to. */
  var sentTo by rememberSaveable { mutableStateOf<String?>(null) }

  fun switchTo(next: AccountMode) {
    if (busy) return
    mode = next; error = null; password = ""; sentTo = null
  }

  fun submit() {
    if (busy) return
    val address = email.trim()
    if (!EMAIL.matches(address) || address.length > 254) { error = "Enter a valid email address."; return }
    when (mode) {
      AccountMode.SIGN_IN -> if (password.isEmpty()) { error = "Enter your password."; return }
      AccountMode.CREATE -> if (password.length < MIN_PASSWORD) { error = "Use at least $MIN_PASSWORD characters for your password."; return }
        else if (password.length > MAX_PASSWORD) { error = "Use no more than $MAX_PASSWORD characters for your password."; return }
      AccountMode.RESET -> Unit
    }
    busy = true; error = null
    scope.launch {
      val problem = when (mode) {
        AccountMode.SIGN_IN -> onSignIn(address, password)
        AccountMode.CREATE -> onSignUp(address, password)
        AccountMode.RESET -> onReset(address)
      }
      busy = false
      when {
        problem != null -> error = problem
        mode == AccountMode.SIGN_IN -> { password = ""; onDismiss() }
        else -> { password = ""; sentTo = address }
      }
    }
  }

  val title = when (mode) {
    AccountMode.SIGN_IN -> "Sign in to SOLO AI"
    AccountMode.CREATE -> "Create your free account"
    AccountMode.RESET -> "Reset your password"
  }
  val subtitle = when (mode) {
    AccountMode.SIGN_IN -> if (signupEnabled) "Welcome back" else "Early access for invited accounts"
    AccountMode.CREATE -> "Free daily messages with SOLO AI"
    AccountMode.RESET -> "We'll email you a link to choose a new password"
  }

  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Solo.Surface) {
    Column(
      Modifier.fillMaxWidth().padding(horizontal = 24.dp).navigationBarsPadding().imePadding().padding(bottom = 24.dp),
      verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        SoloAvatar(44.dp, thinking = busy)
        Spacer(Modifier.size(14.dp))
        Column {
          Text(title, style = MaterialTheme.typography.titleLarge, color = Solo.Text, modifier = Modifier.semantics { heading() })
          Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Solo.TextMuted)
        }
      }
      val sent = sentTo
      if (sent != null) {
        Column(
          Modifier.fillMaxWidth().background(Solo.SurfaceHigh, RoundedCornerShape(16.dp)).padding(16.dp).testTag("check-email"),
          verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          Text("Check your email", style = MaterialTheme.typography.titleMedium, color = Solo.Gold)
          Text(
            if (mode == AccountMode.CREATE)
              "We sent a confirmation link to $sent. Open it on this phone, then come back and sign in."
            else "If $sent has a SOLO AI account, we've sent it a link to choose a new password. Then sign in here.",
            style = MaterialTheme.typography.bodyMedium, color = Solo.Text,
          )
          Text("Can't see it? Check your spam or junk folder.", style = MaterialTheme.typography.bodySmall, color = Solo.TextMuted)
        }
        Button(
          onClick = { switchTo(AccountMode.SIGN_IN) },
          colors = ButtonDefaults.buttonColors(containerColor = Solo.Gold, contentColor = Solo.OnGold),
          shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp),
        ) { Text("Go to sign in", style = MaterialTheme.typography.labelLarge) }
        return@Column
      }
      OutlinedTextField(
        value = email, onValueChange = { if (it.length <= 254) email = it }, label = { Text("Email") }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email,
          imeAction = if (mode == AccountMode.RESET) ImeAction.Done else ImeAction.Next),
        keyboardActions = KeyboardActions(onDone = { submit() }),
        colors = fieldColors(), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().testTag("email"),
      )
      if (mode != AccountMode.RESET) {
        OutlinedTextField(
          value = password, onValueChange = { if (it.length <= 1024) password = it },
          label = { Text(if (mode == AccountMode.CREATE) "Choose a password" else "Password") }, singleLine = true,
          supportingText = if (mode == AccountMode.CREATE) {
            { Text("At least $MIN_PASSWORD characters", color = Solo.TextMuted) }
          } else null,
          visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
          keyboardActions = KeyboardActions(onDone = { submit() }),
          trailingIcon = {
            IconButton(onClick = { showPassword = !showPassword }) {
              Icon(if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                contentDescription = if (showPassword) "Hide password" else "Show password", tint = Solo.Steel)
            }
          },
          colors = fieldColors(), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().testTag("password"),
        )
      }
      error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Solo.Error, modifier = Modifier.testTag("account-error")) }
      if (mode == AccountMode.CREATE) {
        val terms = buildAnnotatedString {
          append("By creating an account you agree to the ")
          withLink(LinkAnnotation.Url("$SITE/terms.html", TextLinkStyles(SpanStyle(color = Solo.Gold, textDecoration = TextDecoration.Underline)))) { append("Terms") }
          append(" and ")
          withLink(LinkAnnotation.Url("$SITE/privacy.html#solo-ai", TextLinkStyles(SpanStyle(color = Solo.Gold, textDecoration = TextDecoration.Underline)))) { append("Privacy Policy") }
          append(".")
        }
        Text(terms, style = MaterialTheme.typography.bodySmall, color = Solo.TextMuted)
      }
      Button(
        onClick = ::submit, enabled = !busy,
        colors = ButtonDefaults.buttonColors(containerColor = Solo.Gold, contentColor = Solo.OnGold),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().height(52.dp).testTag(when (mode) {
          AccountMode.SIGN_IN -> "sign-in"
          AccountMode.CREATE -> "create-account"
          AccountMode.RESET -> "send-reset"
        }),
      ) {
        if (busy) CircularProgressIndicator(color = Solo.OnGold, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        else Text(when (mode) {
          AccountMode.SIGN_IN -> "Sign in"
          AccountMode.CREATE -> "Create account"
          AccountMode.RESET -> "Email me a reset link"
        }, style = MaterialTheme.typography.labelLarge)
      }
      Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        when (mode) {
          AccountMode.SIGN_IN -> {
            TextButton(onClick = { switchTo(AccountMode.RESET) }, modifier = Modifier.testTag("forgot-password")) {
              Text("Forgot password?", color = Solo.Gold)
            }
            if (signupEnabled) TextButton(onClick = { switchTo(AccountMode.CREATE) }, modifier = Modifier.testTag("to-create")) {
              Text("New to SOLO AI? Create a free account", color = Solo.Gold)
            }
          }
          AccountMode.CREATE, AccountMode.RESET ->
            TextButton(onClick = { switchTo(AccountMode.SIGN_IN) }, modifier = Modifier.testTag("to-sign-in")) {
              Text(if (mode == AccountMode.CREATE) "Already have an account? Sign in" else "Back to sign in", color = Solo.Gold)
            }
        }
      }
      Text("Your sign-in is encrypted on this phone and never backed up.", style = MaterialTheme.typography.bodySmall, color = Solo.Steel)
    }
  }
}

private val REASON_LABELS = listOf("Harmful or dangerous", "Hateful or harassing", "Sexual content", "Misleading or false", "Something else")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportSheet(onDismiss: () -> Unit, onSend: (Int, String) -> Unit) {
  var reason by remember { mutableIntStateOf(0) }
  var note by remember { mutableStateOf("") }
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Solo.Surface) {
    Column(
      Modifier.fillMaxWidth().padding(horizontal = 24.dp).navigationBarsPadding().imePadding().padding(bottom = 24.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text("Report this reply", style = MaterialTheme.typography.titleLarge, color = Solo.Text, modifier = Modifier.semantics { heading() })
      Column(Modifier.selectableGroup()) {
        REASON_LABELS.forEachIndexed { i, label ->
          Row(
            Modifier.fillMaxWidth().height(48.dp).selectable(selected = reason == i, onClick = { reason = i }, role = Role.RadioButton),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            RadioButton(selected = reason == i, onClick = null, colors = RadioButtonDefaults.colors(selectedColor = Solo.Gold))
            Spacer(Modifier.size(12.dp))
            Text(label, style = MaterialTheme.typography.bodyLarge, color = Solo.Text)
          }
        }
      }
      OutlinedTextField(
        value = note, onValueChange = { if (it.length <= 500) note = it }, label = { Text("Add details (optional)") },
        colors = fieldColors(), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth(), maxLines = 4,
      )
      Text("The reply, the reason and your note are sent to The Solo Service Provider for review. Your messages to SOLO are not included.",
        style = MaterialTheme.typography.bodySmall, color = Solo.TextMuted)
      Button(
        onClick = { onSend(reason, note) },
        colors = ButtonDefaults.buttonColors(containerColor = Solo.Gold, contentColor = Solo.OnGold),
        shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp),
      ) { Text("Send report", style = MaterialTheme.typography.labelLarge) }
    }
  }
}
