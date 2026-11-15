package au.com.thesoloserviceprovider.solo

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
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
    // Draw edge to edge on every Android version (Android 15+ enforces it). The UI is always
    // dark, so both bars use light icons on a transparent background; Compose pads the
    // content with WindowInsets instead of the deprecated window bar colours.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    setContent { SoloTheme { SoloApp(vm) } }
  }
}
