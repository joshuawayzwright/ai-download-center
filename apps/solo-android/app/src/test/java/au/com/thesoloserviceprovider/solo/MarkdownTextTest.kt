package au.com.thesoloserviceprovider.solo

import au.com.thesoloserviceprovider.solo.MarkdownText.Block
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkdownTextTest {
  @Test fun inlineStylesLoseTheirMarkers() {
    val runs = MarkdownText.inline("Use **bold**, *italic* and `code`.")
    assertEquals("Use bold, italic and code.", runs.joinToString("") { it.text })
    assertTrue(runs.single { it.text == "bold" }.bold)
    assertTrue(runs.single { it.text == "italic" }.italic)
    assertTrue(runs.single { it.text == "code" }.code)
  }

  @Test fun headingsListsQuotesAndParagraphs() {
    val blocks = MarkdownText.parse("## Plan\n- First\n  - Nested\n1. Step one\n2) Step two\n> Note\n\nA paragraph\nthat wraps.")
    assertEquals(Block.Heading::class, blocks[0]::class)
    assertEquals(2, (blocks[0] as Block.Heading).level)
    assertEquals(0, (blocks[1] as Block.Bullet).depth)
    assertEquals(1, (blocks[2] as Block.Bullet).depth)
    assertEquals(2, (blocks[4] as Block.Numbered).number)
    assertTrue(blocks[5] is Block.Quote)
    assertEquals("A paragraph\nthat wraps.", (blocks[6] as Block.Paragraph).runs.joinToString("") { it.text })
  }

  @Test fun codeBlocksKeepContentVerbatimAndReportOpenFences() {
    val closed = MarkdownText.parse("Run:\n```bash\nls -la **not bold**\n```\nDone.")
    val code = closed[1] as Block.Code
    assertEquals("bash", code.language)
    assertEquals("ls -la **not bold**", code.text)
    assertTrue(code.closed)
    val streaming = MarkdownText.parse("```kotlin\nval x = 1") .single() as Block.Code
    assertFalse("a still-streaming fence has no Copy button yet", streaming.closed)
  }

  @Test fun unclosedMarkersWhileStreamingStayAsText() {
    assertEquals("Half **bo", MarkdownText.inline("Half **bo").joinToString("") { it.text })
  }

  @Test fun onlyHttpsLinksBecomeLinks() {
    val runs = MarkdownText.inline("[Site](https://example.test/a) and [bad](javascript:alert(1))")
    assertEquals(listOf("https://example.test/a"), runs.mapNotNull { it.url })
    assertTrue(runs.joinToString("") { it.text }.contains("[bad](javascript:alert(1))"))
  }

  @Test fun snakeCaseIsNotItalic() {
    assertEquals(listOf(MarkdownText.Run("snake_case_name")), MarkdownText.inline("snake_case_name"))
  }

  @Test fun plainTextForReadAloudAndSharing() {
    assertEquals("Plan\n\nMonday: rest\n\n1. Call Sam", MarkdownText.plain("# Plan\n- **Monday**: rest\n1. Call Sam"))
  }
}
