package au.com.thesoloserviceprovider.solo

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import au.com.thesoloserviceprovider.solo.ui.SoloApp
import au.com.thesoloserviceprovider.solo.ui.SoloTheme

/** SOLO AI. The UI is Jetpack Compose; all logic lives in [ChatViewModel]. */
class MainActivity : ComponentActivity() {
  // Built with this activity's own Application (not the default factory's process-wide
  // cached one), so the view model always uses the current app's storage.
  private val vm: ChatViewModel by viewModels { viewModelFactory { initializer { ChatViewModel(application) } } }

  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    setContent { SoloTheme { SoloApp(vm) } }
  }

  // Back from connecting an app in the browser: soloai://connected (or the user just
  // switched back). Re-read connected apps either way.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (intent.data?.scheme == "soloai") vm.refreshConnections(announce = true)
  }

  override fun onRestart() {
    super.onRestart()
    vm.refreshConnections()
  }
}
