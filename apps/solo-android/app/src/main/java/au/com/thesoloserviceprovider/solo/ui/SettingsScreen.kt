package au.com.thesoloserviceprovider.solo.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Login
import androidx.compose.material.icons.outlined.Mail
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.PersonRemove
import androidx.compose.material.icons.outlined.Policy
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import au.com.thesoloserviceprovider.solo.BuildConfig
import au.com.thesoloserviceprovider.solo.R
import au.com.thesoloserviceprovider.solo.UiState
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
  state: UiState,
  onBack: () -> Unit,
  onSignIn: () -> Unit,
  onSignOut: () -> Unit,
  onClearHistory: () -> Unit,
  onCreateAccount: () -> Unit = {},
  onDeleteAccount: suspend () -> String? = { null },
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  var confirmClear by remember { mutableStateOf(false) }
  var confirmDelete by remember { mutableStateOf(false) }
  var deleting by remember { mutableStateOf(false) }
  var deleteError by remember { mutableStateOf<String?>(null) }
  var showLicences by remember { mutableStateOf(false) }
  fun open(url: String) = context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))

  Scaffold(
    containerColor = Solo.Night,
    topBar = {
      TopAppBar(
        title = { Text("Settings", style = MaterialTheme.typography.titleLarge) },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back") } },
        colors = TopAppBarDefaults.topAppBarColors(containerColor = Solo.Night, titleContentColor = Solo.Text, navigationIconContentColor = Solo.Text),
      )
    },
  ) { padding ->
    Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp)) {
      Section("Account") {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
          SoloAvatar(44.dp)
          Spacer(Modifier.width(14.dp))
          Column {
            Text(if (state.signedIn) state.email ?: "Signed in" else "Not signed in", style = MaterialTheme.typography.titleSmall, color = Solo.Text)
            Text(
              when {
                state.signedIn && state.remainingDaily != null ->
                  "${plan(state.tier)}${state.remainingDaily} messages left today"
                state.signedIn && state.tier == "free" -> "Free account"
                state.signedIn -> "Early access member"
                state.signupEnabled -> "Create a free account or sign in"
                else -> "Sign in with your invited account"
              },
              style = MaterialTheme.typography.bodySmall, color = Solo.TextMuted,
            )
          }
        }
        if (state.signedIn) Item(Icons.AutoMirrored.Outlined.Logout, "Sign out", onClick = onSignOut)
        else if (state.accountsEnabled) {
          if (state.signupEnabled) Item(Icons.Outlined.PersonAdd, "Create a free account", onClick = onCreateAccount)
          Item(Icons.Outlined.Login, "Sign in", onClick = onSignIn)
        }
      }
      Section("Your data") {
        Item(Icons.Outlined.DeleteSweep, "Delete all conversations", "They're stored only on this phone") { confirmClear = true }
        if (state.signedIn) {
          Item(Icons.Outlined.PersonRemove, "Delete account", "Permanently delete your SOLO AI account", tag = "delete-account") {
            deleteError = null; confirmDelete = true
          }
        }
        Item(Icons.Outlined.Mail, "Request account deletion by email",
          if (state.signedIn) "If deleting in the app doesn't work" else "Email us from your account's address") {
          open("mailto:hello@thesoloserviceprovider.com.au?subject=Delete%20my%20SOLO%20AI%20account")
        }
      }
      Section("About") {
        Item(Icons.Outlined.Policy, "Privacy notice") { open("$SITE/privacy.html#solo-ai") }
        Item(Icons.Outlined.Policy, "Terms") { open("$SITE/terms.html") }
        Item(Icons.AutoMirrored.Outlined.OpenInNew, "Contact and support") { open("$SITE/contact.html") }
        Item(Icons.AutoMirrored.Outlined.OpenInNew, "AI Download Centre") { open("https://joshuawayzwright.github.io/ai-download-center/") }
        Item(Icons.Outlined.Policy, "Open-source licences", "Inter typeface (SIL Open Font License)") { showLicences = true }
      }
      Text("SOLO AI ${BuildConfig.VERSION_NAME} · The Solo Service Provider · Gold Coast, Queensland",
        style = MaterialTheme.typography.labelSmall, color = Solo.Steel, modifier = Modifier.padding(16.dp))
    }
  }

  if (confirmClear) {
    AlertDialog(
      onDismissRequest = { confirmClear = false },
      title = { Text("Delete all conversations?") },
      text = { Text("This removes every saved conversation from this phone. It can't be undone.") },
      confirmButton = { TextButton(onClick = { confirmClear = false; onClearHistory() }) { Text("Delete", color = Solo.Error) } },
      dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
      containerColor = Solo.Surface,
    )
  }
  if (confirmDelete) {
    AlertDialog(
      onDismissRequest = { if (!deleting) confirmDelete = false },
      title = { Text("Delete your SOLO AI account?") },
      text = {
        Column {
          Text("This permanently deletes your SOLO AI account${state.email?.let { " ($it)" } ?: ""} and signs you out. " +
            "The conversations saved on this phone are deleted too. This can't be undone.")
          deleteError?.let { Text(it, color = Solo.Error, modifier = Modifier.padding(top = 12.dp)) }
        }
      },
      confirmButton = {
        TextButton(
          enabled = !deleting,
          modifier = Modifier.testTag("confirm-delete-account"),
          onClick = {
            deleting = true; deleteError = null
            scope.launch {
              val problem = onDeleteAccount()
              deleting = false
              if (problem == null) { confirmDelete = false; onBack() } else deleteError = problem
            }
          },
        ) {
          if (deleting) CircularProgressIndicator(color = Solo.Error, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
          else Text("Delete account", color = Solo.Error)
        }
      },
      dismissButton = { TextButton(enabled = !deleting, onClick = { confirmDelete = false }) { Text("Cancel") } },
      containerColor = Solo.Surface,
    )
  }
  if (showLicences) {
    val text = remember { context.resources.openRawResource(R.raw.inter_license).bufferedReader().use { it.readText() } }
    AlertDialog(
      onDismissRequest = { showLicences = false },
      title = { Text("Open-source licences") },
      text = { Text(text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.verticalScroll(rememberScrollState())) },
      confirmButton = { TextButton(onClick = { showLicences = false }) { Text("Close") } },
      containerColor = Solo.Surface,
    )
  }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
  Text(title, style = MaterialTheme.typography.labelMedium, color = Solo.Gold, modifier = Modifier.padding(start = 8.dp, top = 12.dp, bottom = 8.dp))
  Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Solo.Surface)) { content() }
}

private fun plan(tier: String?) = when (tier) {
  "free" -> "Free account · "
  "member" -> "Early access · "
  else -> ""
}

@Composable
private fun Item(icon: ImageVector, title: String, detail: String? = null, tag: String? = null, onClick: () -> Unit) {
  Row(
    Modifier.then(if (tag != null) Modifier.testTag(tag) else Modifier).fillMaxWidth().heightIn(min = 56.dp).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Icon(icon, contentDescription = null, tint = Solo.TextMuted, modifier = Modifier.size(22.dp))
    Spacer(Modifier.width(16.dp))
    Column {
      Text(title, style = MaterialTheme.typography.bodyLarge, color = Solo.Text)
      detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Solo.TextMuted) }
    }
  }
}
