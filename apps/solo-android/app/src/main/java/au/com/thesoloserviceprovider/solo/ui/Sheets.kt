package au.com.thesoloserviceprovider.solo.ui

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignInSheet(onDismiss: () -> Unit, onSignIn: suspend (String, String) -> String?) {
  val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  val scope = rememberCoroutineScope()
  var email by rememberSaveable { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var showPassword by remember { mutableStateOf(false) }
  var busy by remember { mutableStateOf(false) }
  var error by remember { mutableStateOf<String?>(null) }

  fun submit() {
    if (busy) return
    if (email.isBlank() || password.isEmpty()) { error = "Enter your email and password."; return }
    busy = true; error = null
    scope.launch {
      val problem = onSignIn(email, password)
      busy = false
      if (problem == null) { password = ""; onDismiss() } else error = problem
    }
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
          Text("Sign in to SOLO AI", style = MaterialTheme.typography.titleLarge, color = Solo.Text, modifier = Modifier.semantics { heading() })
          Text("Early access for invited accounts", style = MaterialTheme.typography.bodySmall, color = Solo.TextMuted)
        }
      }
      OutlinedTextField(
        value = email, onValueChange = { email = it }, label = { Text("Email") }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
        colors = fieldColors(), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().testTag("email"),
      )
      OutlinedTextField(
        value = password, onValueChange = { password = it }, label = { Text("Password") }, singleLine = true,
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
      error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Solo.Error) }
      Button(
        onClick = ::submit, enabled = !busy,
        colors = ButtonDefaults.buttonColors(containerColor = Solo.Gold, contentColor = Solo.OnGold),
        shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp).testTag("sign-in"),
      ) {
        if (busy) CircularProgressIndicator(color = Solo.OnGold, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        else Text("Sign in", style = MaterialTheme.typography.labelLarge)
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
