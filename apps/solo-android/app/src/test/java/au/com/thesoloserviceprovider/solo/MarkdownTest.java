package au.com.thesoloserviceprovider.solo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.graphics.Typeface;
import android.text.Spanned;
import android.text.style.LeadingMarginSpan;
import android.text.style.StyleSpan;
import android.text.style.TypefaceSpan;
import android.text.style.URLSpan;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 36)
public class MarkdownTest {
  private final Markdown md = new Markdown(0xff000000, 0xffffffff, 20);

  private Spanned render(String s) {
    return (Spanned) md.render(s);
  }

  private static boolean hasStyle(Spanned s, String word, int style) {
    int start = s.toString().indexOf(word);
    for (StyleSpan span : s.getSpans(start, start + word.length(), StyleSpan.class)) {
      if (span.getStyle() == style && s.getSpanStart(span) <= start && s.getSpanEnd(span) >= start + word.length()) return true;
    }
    return false;
  }

  @Test public void boldItalicAndCodeLoseTheirMarkers() {
    Spanned s = render("Use **bold**, *italic* and `code`.");
    assertEquals("Use bold, italic and code.", s.toString());
    assertTrue(hasStyle(s, "bold", Typeface.BOLD));
    assertTrue(hasStyle(s, "italic", Typeface.ITALIC));
    int c = s.toString().indexOf("code");
    assertTrue(s.getSpans(c, c + 4, TypefaceSpan.class).length > 0);
  }

  @Test public void headingsAndListsAreFormatted() {
    Spanned s = render("## Plan\n- First\n- Second\n1. Step one\n2) Step two");
    assertEquals("Plan\n•  First\n•  Second\n1.  Step one\n2.  Step two", s.toString());
    assertTrue(hasStyle(s, "Plan", Typeface.BOLD));
    assertTrue(s.getSpans(0, s.length(), LeadingMarginSpan.class).length >= 4);
  }

  @Test public void fencedCodeBlocksKeepContentVerbatim() {
    Spanned s = render("Run:\n```bash\nls -la **not bold**\n```\nDone.");
    assertTrue(s.toString().contains("ls -la **not bold**"));
    assertFalse(s.toString().contains("```"));
  }

  @Test public void unclosedMarkersWhileStreamingStayAsText() {
    assertEquals("Half **bo", render("Half **bo").toString());
    Spanned open = render("```\npartial code");
    assertEquals("partial code", open.toString().trim());
  }

  @Test public void onlyHttpsLinksBecomeLinks() {
    Spanned s = render("[Site](https://example.test/a) and [bad](javascript:alert(1))");
    URLSpan[] links = s.getSpans(0, s.length(), URLSpan.class);
    assertEquals(1, links.length);
    assertEquals("https://example.test/a", links[0].getURL());
    assertTrue(s.toString().startsWith("Site and [bad]"));
  }

  @Test public void underscoresInsideWordsAreNotItalic() {
    assertEquals("snake_case_name", render("snake_case_name").toString());
  }
}
