package au.com.thesoloserviceprovider.solo

/**
 * Parses the Markdown subset SOLO is asked to use into blocks and inline runs. Pure Kotlin,
 * so it is unit-testable and safe on partial text while a reply streams in (an unclosed
 * fence or marker simply stays as text). Raw HTML is never interpreted, and only https
 * links become links.
 */
object MarkdownText {
  data class Run(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val code: Boolean = false,
    val url: String? = null,
  )

  sealed class Block {
    data class Heading(val level: Int, val runs: List<Run>) : Block()
    data class Paragraph(val runs: List<Run>) : Block()
    data class Bullet(val depth: Int, val runs: List<Run>) : Block()
    data class Numbered(val number: Int, val depth: Int, val runs: List<Run>) : Block()
    data class Quote(val runs: List<Run>) : Block()
    data class Code(val language: String, val text: String, val closed: Boolean) : Block()
  }

  private val HEADING = Regex("^(#{1,3})\\s+(.*)$")
  private val BULLET = Regex("^(\\s*)[-*•]\\s+(.*)$")
  private val NUMBERED = Regex("^(\\s*)(\\d{1,3})[.)]\\s+(.*)$")
  private val QUOTE = Regex("^>\\s?(.*)$")
  private val INLINE = Regex(
    "(\\*\\*|__)(.+?)\\1" +
      "|(?<![*\\w])[*_](?![*\\s])(.+?)(?<![\\s*])[*_](?![*\\w])" +
      "|`([^`\\n]+)`" +
      "|\\[([^\\]\\n]+)]\\((https://[^)\\s]+)\\)"
  )

  fun parse(source: String): List<Block> {
    val blocks = ArrayList<Block>()
    val paragraph = StringBuilder()
    fun flush() {
      if (paragraph.isNotBlank()) blocks += Block.Paragraph(inline(paragraph.toString().trim()))
      paragraph.setLength(0)
    }
    val lines = source.replace("\r\n", "\n").split("\n")
    var i = 0
    while (i < lines.size) {
      val line = lines[i]
      val trimmed = line.trim()
      if (trimmed.startsWith("```")) {
        flush()
        val language = trimmed.removePrefix("```").trim()
        val code = StringBuilder()
        var j = i + 1
        var closed = false
        while (j < lines.size) {
          if (lines[j].trim().startsWith("```")) { closed = true; break }
          if (code.isNotEmpty()) code.append('\n')
          code.append(lines[j])
          j++
        }
        blocks += Block.Code(language, code.toString(), closed)
        i = if (closed) j + 1 else lines.size
        continue
      }
      val heading = HEADING.matchEntire(line)
      val bullet = BULLET.matchEntire(line)
      val numbered = NUMBERED.matchEntire(line)
      val quote = QUOTE.matchEntire(line)
      when {
        trimmed.isEmpty() -> flush()
        heading != null -> { flush(); blocks += Block.Heading(heading.groupValues[1].length, inline(heading.groupValues[2])) }
        bullet != null -> { flush(); blocks += Block.Bullet(depth(bullet.groupValues[1]), inline(bullet.groupValues[2])) }
        numbered != null -> {
          flush()
          blocks += Block.Numbered(numbered.groupValues[2].toInt(), depth(numbered.groupValues[1]), inline(numbered.groupValues[3]))
        }
        quote != null -> { flush(); blocks += Block.Quote(inline(quote.groupValues[1])) }
        else -> {
          if (paragraph.isNotEmpty()) paragraph.append('\n')
          paragraph.append(line)
        }
      }
      i++
    }
    flush()
    return blocks
  }

  private fun depth(indent: String) = minOf(3, indent.replace("\t", "    ").length / 2)

  fun inline(text: String): List<Run> {
    val runs = ArrayList<Run>()
    var last = 0
    for (m in INLINE.findAll(text)) {
      if (m.range.first > last) runs += Run(text.substring(last, m.range.first))
      val g = m.groups
      runs += when {
        g[2] != null -> Run(g[2]!!.value, bold = true)
        g[3] != null -> Run(g[3]!!.value, italic = true)
        g[4] != null -> Run(g[4]!!.value, code = true)
        else -> Run(g[5]!!.value, url = g[6]!!.value)
      }
      last = m.range.last + 1
    }
    if (last < text.length) runs += Run(text.substring(last))
    return runs
  }

  /** Plain text for read-aloud and sharing: Markdown markers removed. */
  fun plain(source: String): String = parse(source).joinToString("\n\n") { block ->
    when (block) {
      is Block.Heading -> block.runs.joinToString("") { it.text }
      is Block.Paragraph -> block.runs.joinToString("") { it.text }
      is Block.Bullet -> block.runs.joinToString("") { it.text }
      is Block.Numbered -> "${block.number}. " + block.runs.joinToString("") { it.text }
      is Block.Quote -> block.runs.joinToString("") { it.text }
      is Block.Code -> block.text
    }
  }
}
