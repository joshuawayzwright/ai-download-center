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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.contentDescription
import au.com.thesoloserviceprovider.solo.AccountResult

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
  focusedBorderColor = Solo.Gold, unfocusedBorderColor = Solo.Outline, cursorColor = Solo.Gold,
  focusedLabelColor = Solo.Gold, unfocusedLabelColor = Solo.TextMuted,
  focusedTextColor = Solo.Text, unfocusedTextColor = Solo.Text,
)

/** Where the account sheet opens. */
enum class AccountMode { SIGN_IN, CREATE, RESET }

/** Every screen of the account sheet, including the emailed-code steps. */
private enum class Step { SIGN_IN, CREATE, VERIFY, RESET, RESET_CODE }

private const val MIN_PASSWORD = 12
private const val MAX_PASSWORD = 128
private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
private val CODE = Regex("^[0-9]{6,10}$")

/** The server's password rules for new passwords: 12–128 characters, not blank, no control characters. */
internal fun newPasswordProblem(password: String): String? {
  val length = password.codePointCount(0, password.length)
  return when {
    length < MIN_PASSWORD -> "Use at least $MIN_PASSWORD characters for your password."
    length > MAX_PASSWORD -> "Use no more than $MAX_PASSWORD characters for your password."
    password.isBlank() -> "Your password can't be only spaces."
    password.any { it.code < 0x20 || it.code == 0x7f } -> "Your password contains characters that can't be used."
    else -> null
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignInSheet(
  signupEnabled: Boolean,
  recoveryEnabled: Boolean = false,
  startMode: AccountMode = AccountMode.SIGN_IN,
  onDismiss: () -> Unit,
  onSignIn: suspend (String, String) -> AccountResult,
  onSignUp: suspend (String, String) -> AccountResult = { _, _ -> AccountResult.fail("Creating accounts isn't available yet.") },
  onVerify: suspend (String, String) -> AccountResult = { _, _ -> AccountResult.fail("Email verification isn't available yet.") },
  onResendCode: suspend (String) -> AccountResult = { AccountResult.fail("A new code can't be sent right now.") },
  onRequestReset: suspend (String) -> AccountResult = { AccountResult.fail("Password reset isn't available yet.") },
  onResetPassword: suspend (String, String, String) -> AccountResult = { _, _, _ -> AccountResult.fail("Password reset isn't available yet.") },
) {
  val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  val scope = rememberCoroutineScope()
  val initial = when {
    startMode == AccountMode.CREATE && signupEnabled -> Step.CREATE
    startMode == AccountMode.RESET && recoveryEnabled -> Step.RESET
    else -> Step.SIGN_IN
  }
  var step by rememberSaveable { mutableStateOf(initial) }
  var email by rememberSaveable { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var code by remember { mutableStateOf("") }
  var agreed by rememberSaveable { mutableStateOf(false) }
  var showPassword by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }
  var notice by remember { mutableStateOf<String?>(null) }

  fun go(next: Step) {
    if (busy) return
    step = next; error = null; notice = null; code = ""
    if (next != Step.VERIFY) password = ""
  }

  fun run(action: suspend () -> AccountResult, onOk: () -> Unit) {
    busy = true; error = null; notice = null
    scope.launch {
      val result = action()
      busy = false
      when {
        result.needsCode -> { step = Step.VERIFY; code = ""; password = ""; notice = result.error }
        result.error != null -> error = result.error
        else -> onOk()
      }
    }
  }

  fun submit() {
    if (busy) return
    val address = email.trim()
    if (step != Step.VERIFY && step != Step.RESET_CODE && (!EMAIL.matches(address) || address.length > 254)) {
      error = "Enter a valid email address."; return
    }
    when (step) {
      Step.SIGN_IN -> {
        if (password.isEmpty()) { error = "Enter your password."; return }
        run({ onSignIn(address, password) }) { password = ""; onDismiss() }
      }
      Step.CREATE -> {
        newPasswordProblem(password)?.let { error = it; return }
        if (!agreed) { error = "Tick the box to agree to the Terms and Privacy Policy."; return }
        run({ onSignUp(address, password) }) { step = Step.VERIFY; code = ""; password = "" }
      }
      Step.VERIFY -> {
        if (!CODE.matches(code)) { error = "Enter the 8-digit code from the email."; return }
        run({ onVerify(address, code) }) { password = ""; code = ""; onDismiss() }
      }
      Step.RESET -> run({ onRequestReset(address) }) { step = Step.RESET_CODE; code = ""; password = "" }
      Step.RESET_CODE -> {
        if (!CODE.matches(code)) { error = "Enter the 8-digit code from the email."; return }
        newPasswordProblem(password)?.let { error = it; return }
        run({ onResetPassword(address, code, password) }) { password = ""; code = ""; onDismiss() }
      }
    }
  }

  fun resend() {
    if (busy) return
    val address = email.trim()
    val action: suspend () -> AccountResult = if (step == Step.RESET_CODE) ({ onRequestReset(address) }) else ({ onResendCode(address) })
    run(action) { notice = "We sent a new code to $address. Use the newest one." }
  }

  val title = when (step) {
    Step.SIGN_IN -> "Sign in to SOLO AI"
    Step.CREATE -> "Create your free account"
    Step.VERIFY -> "Check your email"
    Step.RESET -> "Reset your password"
    Step.RESET_CODE -> "Choose a new password"
  }
  val subtitle = when (step) {
    Step.SIGN_IN -> if (signupEnabled) "Welcome back" else "Early access for invited accounts"
    Step.CREATE -> "Free daily messages with SOLO AI"
    Step.VERIFY -> "One more step to confirm it's you"
    Step.RESET -> "We'll email you a code"
    Step.RESET_CODE -> "Enter the code we emailed you"
  }
  val codeSent = "We emailed an 8-digit code to ${email.trim()}. It can take a minute; check spam if it doesn't arrive."

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
      if (step == Step.VERIFY || step == Step.RESET_CODE) {
        Text(
          if (step == Step.RESET_CODE) "If ${email.trim()} has a SOLO AI account, we emailed it an 8-digit code. It can take a minute; check spam if it doesn't arrive."
          else codeSent,
          style = MaterialTheme.typography.bodyMedium, color = Solo.Text, modifier = Modifier.testTag("code-sent"),
        )
        OutlinedTextField(
          value = code, onValueChange = { v -> val digits = v.filter(Char::isDigit); if (digits.length <= 10) code = digits },
          label = { Text("8-digit code") }, singleLine = true,
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number,
            imeAction = if (step == Step.VERIFY) ImeAction.Done else ImeAction.Next),
          keyboardActions = KeyboardActions(onDone = { submit() }),
          colors = fieldColors(), shape = RoundedCornerShape(14.dp),
          modifier = Modifier.fillMaxWidth().testTag("code").semantics { contentType = ContentType.SmsOtpCode },
        )
      } else {
        OutlinedTextField(
          value = email, onValueChange = { if (it.length <= 254) email = it }, label = { Text("Email") }, singleLine = true,
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email,
            imeAction = if (step == Step.RESET) ImeAction.Done else ImeAction.Next),
          keyboardActions = KeyboardActions(onDone = { submit() }),
          colors = fieldColors(), shape = RoundedCornerShape(14.dp),
          modifier = Modifier.fillMaxWidth().testTag("email").semantics { contentType = ContentType.EmailAddress },
        )
      }
      if (step == Step.SIGN_IN || step == Step.CREATE || step == Step.RESET_CODE) {
        val creating = step != Step.SIGN_IN
        OutlinedTextField(
          value = password, onValueChange = { if (it.length <= 1024) password = it },
          label = { Text(when (step) { Step.CREATE -> "Choose a password"; Step.RESET_CODE -> "New password"; else -> "Password" }) },
          singleLine = true,
          supportingText = if (creating) { { Text("At least $MIN_PASSWORD characters", color = Solo.TextMuted) } } else null,
          visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
          keyboardActions = KeyboardActions(onDone = { submit() }),
          trailingIcon = {
            IconButton(onClick = { showPassword = !showPassword }) {
              Icon(if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                contentDescription = if (showPassword) "Hide password" else "Show password", tint = Solo.Steel)
            }
          },
          colors = fieldColors(), shape = RoundedCornerShape(14.dp),
          modifier = Modifier.fillMaxWidth().testTag(if (step == Step.RESET_CODE) "new-password" else "password")
            .semantics { contentType = if (creating) ContentType.NewPassword else ContentType.Password },
        )
      }
      if (step == Step.CREATE) {
        val terms = buildAnnotatedString {
          append("I agree to the ")
          withLink(LinkAnnotation.Url("$SITE/terms.html", TextLinkStyles(SpanStyle(color = Solo.Gold, textDecoration = TextDecoration.Underline)))) { append("Terms") }
          append(" and ")
          withLink(LinkAnnotation.Url("$SITE/privacy.html#solo-ai", TextLinkStyles(SpanStyle(color = Solo.Gold, textDecoration = TextDecoration.Underline)))) { append("Privacy Policy") }
        }
        // The checkbox toggles on its own, so tapping a link opens it rather than ticking the box.
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
          Checkbox(
            checked = agreed, onCheckedChange = { agreed = it },
            colors = CheckboxDefaults.colors(checkedColor = Solo.Gold, checkmarkColor = Solo.OnGold),
            modifier = Modifier.testTag("agree-terms").semantics { contentDescription = "I agree to the Terms and Privacy Policy" },
          )
          Spacer(Modifier.size(4.dp))
          Text(terms, style = MaterialTheme.typography.bodySmall, color = Solo.Text)
        }
      }
      notice?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Solo.Gold, modifier = Modifier.testTag("account-notice")) }
      error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Solo.Error, modifier = Modifier.testTag("account-error")) }
      Button(
        onClick = ::submit, enabled = !busy && (step != Step.CREATE || agreed),
        colors = ButtonDefaults.buttonColors(containerColor = Solo.Gold, contentColor = Solo.OnGold),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().height(52.dp).testTag(when (step) {
          Step.SIGN_IN -> "sign-in"
          Step.CREATE -> "create-account"
          Step.VERIFY -> "verify-code"
          Step.RESET -> "send-reset"
          Step.RESET_CODE -> "save-password"
        }),
      ) {
        if (busy) CircularProgressIndicator(color = Solo.OnGold, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        else Text(when (step) {
          Step.SIGN_IN -> "Sign in"
          Step.CREATE -> "Create account"
          Step.VERIFY -> "Verify and sign in"
          Step.RESET -> "Email me a code"
          Step.RESET_CODE -> "Save and sign in"
        }, style = MaterialTheme.typography.labelLarge)
      }
      Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        when (step) {
          Step.SIGN_IN -> {
            if (recoveryEnabled) TextButton(onClick = { go(Step.RESET) }, modifier = Modifier.testTag("forgot-password")) {
              Text("Forgot password?", color = Solo.Gold)
            }
            if (signupEnabled) TextButton(onClick = { go(Step.CREATE) }, modifier = Modifier.testTag("to-create")) {
              Text("New to SOLO AI? Create a free account", color = Solo.Gold)
            }
          }
          Step.VERIFY, Step.RESET_CODE -> {
            TextButton(onClick = ::resend, enabled = !busy, modifier = Modifier.testTag("resend-code")) {
              Text("Send a new code", color = Solo.Gold)
            }
            TextButton(onClick = { go(if (step == Step.VERIFY) Step.SIGN_IN else Step.RESET) }, modifier = Modifier.testTag("change-email")) {
              Text(if (step == Step.VERIFY) "Back to sign in" else "Use a different email", color = Solo.Gold)
            }
          }
          Step.CREATE, Step.RESET ->
            TextButton(onClick = { go(Step.SIGN_IN) }, modifier = Modifier.testTag("to-sign-in")) {
              Text(if (step == Step.CREATE) "Already have an account? Sign in" else "Back to sign in", color = Solo.Gold)
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
