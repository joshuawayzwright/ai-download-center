package au.com.thesoloserviceprovider.solo.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.StopCircle
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import au.com.thesoloserviceprovider.solo.ChatMessage
import au.com.thesoloserviceprovider.solo.MarkdownText
import au.com.thesoloserviceprovider.solo.MessageStatus
import au.com.thesoloserviceprovider.solo.R
import au.com.thesoloserviceprovider.solo.Role
import au.com.thesoloserviceprovider.solo.Source

/** The approved SOLO AI icon. While SOLO is thinking, an animated gold-and-blue aura turns around it. */
@Composable
fun SoloAvatar(size: Dp, thinking: Boolean = false, modifier: Modifier = Modifier) {
  Box(modifier.size(size), contentAlignment = Alignment.Center) {
    if (thinking) {
      val spin = rememberInfiniteTransition(label = "aura")
      val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(1600, easing = LinearEasing)), label = "angle")
      Box(Modifier.size(size).rotate(angle).clip(RoundedCornerShape(size * 0.28f)).background(Solo.AuraGradient))
    }
    Image(
      painter = painterResource(R.drawable.solo_avatar),
      contentDescription = null,
      modifier = Modifier.size(if (thinking) size - 4.dp else size).clip(RoundedCornerShape(size * 0.24f)),
    )
  }
}

// ---- Formatted replies -------------------------------------------------------------

private fun runsToAnnotated(runs: List<MarkdownText.Run>, linkColor: Color): AnnotatedString = buildAnnotatedString {
  for (r in runs) {
    when {
      r.url != null -> {
        pushStringAnnotation("URL", r.url)
        withStyle(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)) { append(r.text) }
        pop()
      }
      r.code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, background = Solo.CodeBg, color = Solo.CodeText, fontSize = 14.sp)) {
        append(" ${r.text} ")
      }
      else -> withStyle(SpanStyle(
        fontWeight = if (r.bold) FontWeight.SemiBold else null,
        fontStyle = if (r.italic) FontStyle.Italic else null,
        color = if (r.bold) Solo.Text else Color.Unspecified,
      )) { append(r.text) }
    }
  }
}

@Composable
private fun RichText(runs: List<MarkdownText.Run>, style: androidx.compose.ui.text.TextStyle, modifier: Modifier = Modifier) {
  val text = runsToAnnotated(runs, Solo.GoldBright)
  val uri = LocalUriHandler.current
  if (runs.any { it.url != null }) {
    @Suppress("DEPRECATION")
    ClickableText(text, modifier = modifier, style = style.copy(color = MaterialTheme.colorScheme.onSurface)) { offset ->
      text.getStringAnnotations("URL", offset, offset).firstOrNull()?.let { uri.openUri(it.item) }
    }
  } else {
    Text(text, modifier = modifier, style = style, color = MaterialTheme.colorScheme.onSurface)
  }
}

@Composable
fun MarkdownView(source: String, onCopyCode: (String) -> Unit, modifier: Modifier = Modifier) {
  val blocks = MarkdownText.parse(source)
  val body = MaterialTheme.typography.bodyLarge
  Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
    for (block in blocks) {
      when (block) {
        is MarkdownText.Block.Heading -> RichText(
          block.runs,
          when (block.level) {
            1 -> MaterialTheme.typography.headlineSmall
            2 -> MaterialTheme.typography.titleLarge
            else -> MaterialTheme.typography.titleMedium
          },
          Modifier.padding(top = 4.dp).semantics { heading() },
        )
        is MarkdownText.Block.Paragraph -> RichText(block.runs, body)
        is MarkdownText.Block.Bullet -> ListItemRow("•", block.depth) { RichText(block.runs, body) }
        is MarkdownText.Block.Numbered -> ListItemRow("${block.number}.", block.depth) { RichText(block.runs, body) }
        is MarkdownText.Block.Quote -> Row {
          Box(Modifier.width(3.dp).heightIn(min = 22.dp).background(Solo.Gold, RoundedCornerShape(2.dp)))
          Spacer(Modifier.width(12.dp))
          RichText(block.runs, body.copy(fontStyle = FontStyle.Italic))
        }
        is MarkdownText.Block.Code -> CodeBlock(block, onCopyCode)
      }
    }
  }
}

@Composable
private fun ListItemRow(marker: String, depth: Int, content: @Composable () -> Unit) {
  Row(Modifier.padding(start = (depth * 18).dp)) {
    Text(marker, style = MaterialTheme.typography.bodyLarge, color = Solo.Gold, modifier = Modifier.widthIn(min = 22.dp))
    Box(Modifier.weight(1f)) { content() }
  }
}

@Composable
private fun CodeBlock(block: MarkdownText.Block.Code, onCopy: (String) -> Unit) {
  Column(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Solo.CodeBg)
      .border(1.dp, Solo.Outline, RoundedCornerShape(14.dp)),
  ) {
    Row(Modifier.fillMaxWidth().background(Solo.Surface).padding(start = 14.dp), verticalAlignment = Alignment.CenterVertically) {
      Text(block.language.ifEmpty { "code" }, style = MaterialTheme.typography.labelMedium, color = Solo.Steel, modifier = Modifier.weight(1f))
      if (block.closed) {
        TextButton(onClick = { onCopy(block.text) }) {
          Icon(Icons.Outlined.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp), tint = Solo.Gold)
          Spacer(Modifier.width(6.dp))
          Text("Copy code", style = MaterialTheme.typography.labelMedium, color = Solo.Gold)
        }
      } else Spacer(Modifier.size(40.dp))
    }
    SelectionContainer {
      Text(
        block.text, fontFamily = FontFamily.Monospace, fontSize = 13.5.sp, lineHeight = 20.sp, color = Solo.CodeText,
        modifier = Modifier.horizontalScroll(rememberScrollState()).padding(14.dp),
      )
    }
  }
}

// ---- Message rows -----------------------------------------------------------------

@Composable
fun UserMessage(message: ChatMessage, onRetry: () -> Unit, onCopy: () -> Unit) {
  val failed = message.status == MessageStatus.FAILED
  Column(Modifier.fillMaxWidth().padding(start = 56.dp), horizontalAlignment = Alignment.End) {
    SelectionContainer {
      Text(
        message.text,
        style = MaterialTheme.typography.bodyLarge,
        color = Solo.OnGold,
        modifier = Modifier
          .alpha(if (failed) 0.55f else 1f)
          .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp, bottomStart = 22.dp, bottomEnd = 6.dp))
          .background(Solo.GoldGradient)
          .padding(horizontal = 16.dp, vertical = 11.dp)
          .semantics { contentDescription = (if (failed) "Not sent: " else "You said: ") + message.text },
      )
    }
    if (failed) {
      Text(message.error ?: "Not sent.", style = MaterialTheme.typography.bodySmall, color = Solo.Error,
        modifier = Modifier.padding(top = 6.dp, end = 4.dp))
      Row {
        TextButton(onClick = onCopy) { Text("Copy", color = Solo.Steel) }
        TextButton(onClick = onRetry) { Text("Retry", color = Solo.Gold) }
      }
    }
  }
}

@Composable
fun SoloMessage(
  message: ChatMessage,
  isLast: Boolean,
  speaking: Boolean,
  canReport: Boolean,
  onCopy: () -> Unit,
  onCopyCode: (String) -> Unit,
  onSpeak: () -> Unit,
  onShare: () -> Unit,
  onRegenerate: () -> Unit,
  onReport: () -> Unit,
  onOpenSource: (String) -> Unit = {},
) {
  Row(Modifier.fillMaxWidth()) {
    SoloAvatar(30.dp)
    Spacer(Modifier.width(12.dp))
    Column(Modifier.weight(1f)) {
      Text(
        if (message.status == MessageStatus.STOPPED) "SOLO AI · Stopped" else "SOLO AI",
        style = MaterialTheme.typography.labelMedium, color = Solo.Gold, modifier = Modifier.padding(top = 5.dp, bottom = 6.dp),
      )
      SelectionContainer(Modifier.semantics { contentDescription = "SOLO AI said: " + MarkdownText.plain(message.text) }) {
        MarkdownView(message.text, onCopyCode)
      }
      if (message.truncated) {
        Text("SOLO reached its length limit. Ask it to continue.", style = MaterialTheme.typography.bodySmall,
          color = Solo.Steel, modifier = Modifier.padding(top = 8.dp))
      }
      if (message.sources.isNotEmpty()) SourcesRow(message.sources, onOpenSource)
      Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        ActionIcon(Icons.Outlined.ContentCopy, "Copy reply", onCopy)
        ActionIcon(if (speaking) Icons.Outlined.StopCircle else Icons.AutoMirrored.Outlined.VolumeUp,
          if (speaking) "Stop reading" else "Read aloud", onSpeak, active = speaking)
        ActionIcon(Icons.Outlined.Share, "Share reply", onShare)
        if (isLast && message.status == MessageStatus.DONE) ActionIcon(Icons.Outlined.Refresh, "Regenerate reply", onRegenerate)
        if (canReport) ActionIcon(Icons.Outlined.Flag, "Report this reply", onReport)
      }
    }
  }
}

/** The web pages a reply drew on, as compact chips that open in the browser. */
@Composable
private fun SourcesRow(sources: List<Source>, onOpen: (String) -> Unit) {
  Column(Modifier.padding(top = 12.dp).testTag("sources")) {
    Text("Sources", style = MaterialTheme.typography.labelMedium, color = Solo.TextMuted,
      modifier = Modifier.padding(bottom = 6.dp).semantics { heading() })
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      sources.forEachIndexed { i, src ->
        Row(
          Modifier.widthIn(max = 240.dp).heightIn(min = 48.dp).clip(RoundedCornerShape(14.dp))
            .background(Solo.Surface).border(1.dp, Solo.Outline, RoundedCornerShape(14.dp))
            .clickable(onClickLabel = "Open in browser") { onOpen(src.url) }
            .semantics(mergeDescendants = true) { contentDescription = "Source ${i + 1}: ${src.title}, from ${src.site}" }
            .padding(horizontal = 12.dp, vertical = 8.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text("${i + 1}", style = MaterialTheme.typography.labelMedium, color = Solo.Gold)
          Spacer(Modifier.width(8.dp))
          Column {
            Text(src.site, style = MaterialTheme.typography.labelSmall, color = Solo.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(src.title, style = MaterialTheme.typography.bodySmall, color = Solo.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
        }
      }
    }
  }
}

@Composable
private fun ActionIcon(icon: ImageVector, description: String, onClick: () -> Unit, active: Boolean = false) {
  IconButton(onClick = onClick) {
    Icon(icon, contentDescription = description, tint = if (active) Solo.Gold else Solo.Steel, modifier = Modifier.size(19.dp))
  }
}

/** The reply being written right now: the aura spins until text arrives, then the text flows in. */
@Composable
fun StreamingMessage(text: String, onCopyCode: (String) -> Unit) {
  Row(Modifier.fillMaxWidth()) {
    SoloAvatar(30.dp, thinking = true)
    Spacer(Modifier.width(12.dp))
    Column(Modifier.weight(1f)) {
      Text("SOLO AI", style = MaterialTheme.typography.labelMedium, color = Solo.Gold, modifier = Modifier.padding(top = 5.dp, bottom = 6.dp))
      if (text.isEmpty()) {
        val pulse = rememberInfiniteTransition(label = "thinking")
        val a by pulse.animateFloat(0.35f, 1f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "alpha")
        Text("Thinking…", style = MaterialTheme.typography.bodyLarge, color = Solo.TextMuted, modifier = Modifier.alpha(a)
          .semantics { contentDescription = "SOLO is thinking" })
      } else {
        // Live text is not announced word by word; the finished reply is announced once.
        Box(Modifier.semantics { contentDescription = "SOLO is replying" }) { MarkdownView(text, onCopyCode) }
      }
    }
  }
}

// ---- Composer ---------------------------------------------------------------------

@Composable
fun SendButton(sending: Boolean, canSend: Boolean, showMic: Boolean, onSend: () -> Unit, onStop: () -> Unit, onMic: () -> Unit) {
  val mode = when { sending -> 2; showMic -> 1; else -> 0 }
  AnimatedContent(mode, transitionSpec = { (scaleIn() + fadeIn()) togetherWith (scaleOut() + fadeOut()) }, label = "send") { m ->
    when (m) {
      2 -> RoundAction(Icons.Rounded.Stop, "Stop", Solo.GoldGradient, enabled = true, onClick = onStop)
      1 -> IconButton(onClick = onMic, modifier = Modifier.size(48.dp)) {
        Icon(Icons.Outlined.Mic, contentDescription = "Speak your message", tint = Solo.Gold)
      }
      else -> RoundAction(Icons.Rounded.ArrowUpward, "Send", Solo.GoldGradient, enabled = canSend, onClick = onSend)
    }
  }
}

@Composable
private fun RoundAction(icon: ImageVector, description: String, brush: androidx.compose.ui.graphics.Brush, enabled: Boolean, onClick: () -> Unit) {
  IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(48.dp)) {
    Box(
      Modifier.size(40.dp).clip(CircleShape)
        .background(if (enabled) brush else androidx.compose.ui.graphics.SolidColor(Solo.SurfaceHigh)),
      contentAlignment = Alignment.Center,
    ) {
      Icon(icon, contentDescription = description, tint = if (enabled) Solo.OnGold else Solo.Steel)
    }
  }
}
