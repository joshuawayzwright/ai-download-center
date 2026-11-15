package au.com.thesoloserviceprovider.solo.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import au.com.thesoloserviceprovider.solo.R

/** SOLO brand lock palette: charcoal, weathered steel, burnished gold, electric blue. */
object Solo {
  val Charcoal = Color(0xFF0A0A0A)
  val Night = Color(0xFF05080C)
  val Surface = Color(0xFF11161C)
  val SurfaceHigh = Color(0xFF19202A)
  val Outline = Color(0xFF26303B)
  val Gold = Color(0xFFD4AF37)
  val GoldBright = Color(0xFFF2CF6A)
  val GoldDeep = Color(0xFF9C7420)
  val Blue = Color(0xFF0087FF)
  val BlueGlow = Color(0xFF39A7FF)
  val Steel = Color(0xFF8A8F98)
  val Text = Color(0xFFF2F3F5)
  val TextMuted = Color(0xFFA9AEB6)
  val OnGold = Color(0xFF141004)
  val Error = Color(0xFFFF8A80)
  val CodeBg = Color(0xFF0B1016)
  val CodeText = Color(0xFFE8C766)

  val GoldGradient = Brush.linearGradient(listOf(GoldBright, Gold, GoldDeep))
  val AuraGradient = Brush.sweepGradient(listOf(Blue, Gold, BlueGlow, GoldBright, Blue))
}

val Inter = FontFamily(
  Font(R.font.inter_regular, FontWeight.Normal),
  Font(R.font.inter_medium, FontWeight.Medium),
  Font(R.font.inter_semibold, FontWeight.SemiBold),
  Font(R.font.inter_display_bold, FontWeight.Bold),
)

private val SoloTypography = Typography(
  displaySmall = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 34.sp, lineHeight = 40.sp, letterSpacing = (-0.5).sp),
  headlineSmall = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 30.sp),
  titleLarge = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 26.sp, letterSpacing = 0.6.sp),
  titleMedium = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 24.sp),
  titleSmall = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
  bodyLarge = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 25.sp),
  bodyMedium = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 21.sp),
  bodySmall = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 17.sp),
  labelLarge = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp, letterSpacing = 0.2.sp),
  labelMedium = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.4.sp),
  labelSmall = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 15.sp, letterSpacing = 0.5.sp),
)

private val SoloColors = darkColorScheme(
  primary = Solo.Gold,
  onPrimary = Solo.OnGold,
  primaryContainer = Solo.GoldDeep,
  onPrimaryContainer = Solo.Text,
  secondary = Solo.Blue,
  onSecondary = Color.White,
  tertiary = Solo.BlueGlow,
  background = Solo.Night,
  onBackground = Solo.Text,
  surface = Solo.Night,
  onSurface = Solo.Text,
  surfaceVariant = Solo.SurfaceHigh,
  onSurfaceVariant = Solo.TextMuted,
  surfaceContainer = Solo.Surface,
  surfaceContainerHigh = Solo.SurfaceHigh,
  surfaceContainerHighest = Solo.SurfaceHigh,
  surfaceContainerLow = Solo.Surface,
  outline = Solo.Outline,
  outlineVariant = Solo.Outline,
  error = Solo.Error,
)

@Composable
fun SoloTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = SoloColors, typography = SoloTypography, content = content)
}
