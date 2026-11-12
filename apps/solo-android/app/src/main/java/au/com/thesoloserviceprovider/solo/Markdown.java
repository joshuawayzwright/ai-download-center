package au.com.thesoloserviceprovider.solo;

import android.graphics.Typeface;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.BackgroundColorSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.LeadingMarginSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.text.style.TypefaceSpan;
import android.text.style.URLSpan;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Renders the Markdown subset SOLO is asked to use: headings, paragraphs, bullet and
 * numbered lists, **bold**, *italic*, `inline code`, fenced code blocks and https links.
 * Safe for partial text while a reply is still streaming (an unclosed fence or marker is
 * shown as plain text until it closes). Raw HTML is never interpreted.
 */
final class Markdown {
  private static final Pattern HEADING = Pattern.compile("^(#{1,3})\\s+(.*)$");
  private static final Pattern BULLET = Pattern.compile("^(\\s*)[-*•]\\s+(.*)$");
  private static final Pattern NUMBERED = Pattern.compile("^(\\s*)(\\d{1,3})[.)]\\s+(.*)$");
  private static final Pattern INLINE = Pattern.compile(
      "(\\*\\*|__)(.+?)\\1"                 // bold
      + "|(?<![*\\w])[*_](?![*\\s])(.+?)(?<![\\s*])[*_](?![*\\w])" // italic
      + "|`([^`\\n]+)`"                      // inline code
      + "|\\[([^\\]\\n]+)]\\((https://[^)\\s]+)\\)"); // https link

  private final int codeBackground;
  private final int codeText;
  private final int indentPx;

  Markdown(int codeBackground, int codeText, int indentPx) {
    this.codeBackground = codeBackground;
    this.codeText = codeText;
    this.indentPx = indentPx;
  }

  CharSequence render(String source) {
    SpannableStringBuilder out = new SpannableStringBuilder();
    String[] lines = source.replace("\r\n", "\n").split("\n", -1);
    boolean inCode = false;
    int codeStart = 0;
    for (int i = 0; i < lines.length; i++) {
      String line = lines[i];
      if (line.trim().startsWith("```")) {
        if (!inCode) {
          inCode = true;
          newline(out);
          codeStart = out.length();
        } else {
          inCode = false;
          trimTrailingNewline(out);
          styleCode(out, codeStart, out.length());
          out.append('\n');
        }
        continue;
      }
      if (inCode) {
        out.append(line).append('\n');
        continue;
      }
      Matcher m;
      if ((m = HEADING.matcher(line)).matches()) {
        newline(out);
        int start = out.length();
        inline(out, m.group(2));
        float size = m.group(1).length() == 1 ? 1.25f : m.group(1).length() == 2 ? 1.15f : 1.05f;
        out.setSpan(new StyleSpan(Typeface.BOLD), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        out.setSpan(new RelativeSizeSpan(size), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        out.append('\n');
      } else if ((m = BULLET.matcher(line)).matches()) {
        listItem(out, "•  ", m.group(2), level(m.group(1)));
      } else if ((m = NUMBERED.matcher(line)).matches()) {
        listItem(out, m.group(2) + ".  ", m.group(3), level(m.group(1)));
      } else {
        inline(out, line);
        out.append('\n');
      }
    }
    if (inCode) {
      // Still streaming: show the open block as code so far.
      trimTrailingNewline(out);
      styleCode(out, codeStart, out.length());
    }
    // Collapse 3+ newlines and trim the end.
    String text = out.toString();
    for (int i = text.length() - 1; i >= 2; i--) {
      if (text.charAt(i) == '\n' && text.charAt(i - 1) == '\n' && text.charAt(i - 2) == '\n') {
        out.delete(i, i + 1);
      }
    }
    trimTrailingNewline(out);
    trimTrailingNewline(out);
    return out;
  }

  private static int level(String indent) {
    return Math.min(3, indent.replace("\t", "    ").length() / 2);
  }

  private void listItem(SpannableStringBuilder out, String marker, String text, int level) {
    int start = out.length();
    out.append(marker);
    inline(out, text);
    int margin = indentPx * (level + 1);
    out.setSpan(new LeadingMarginSpan.Standard(margin - indentPx / 2, margin + indentPx / 2),
        start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    out.append('\n');
  }

  private void inline(SpannableStringBuilder out, String text) {
    Matcher m = INLINE.matcher(text);
    int last = 0;
    while (m.find()) {
      out.append(text, last, m.start());
      int start = out.length();
      if (m.group(2) != null) {
        out.append(m.group(2));
        out.setSpan(new StyleSpan(Typeface.BOLD), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
      } else if (m.group(3) != null) {
        out.append(m.group(3));
        out.setSpan(new StyleSpan(Typeface.ITALIC), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
      } else if (m.group(4) != null) {
        out.append(m.group(4));
        styleCode(out, start, out.length());
      } else {
        out.append(m.group(5));
        out.setSpan(new URLSpan(m.group(6)), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
      }
      last = m.end();
    }
    out.append(text, last, text.length());
  }

  private void styleCode(SpannableStringBuilder out, int start, int end) {
    if (end <= start) return;
    out.setSpan(new TypefaceSpan("monospace"), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    out.setSpan(new BackgroundColorSpan(codeBackground), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    out.setSpan(new ForegroundColorSpan(codeText), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
  }

  private static void newline(SpannableStringBuilder out) {
    if (out.length() > 0 && out.charAt(out.length() - 1) != '\n') out.append('\n');
  }

  private static void trimTrailingNewline(SpannableStringBuilder out) {
    if (out.length() > 0 && out.charAt(out.length() - 1) == '\n') out.delete(out.length() - 1, out.length());
  }
}
