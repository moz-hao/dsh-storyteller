// Style probe: fetch four chapter-1 pages from the official mobile reading site,
// extract the body, and print the numbers that separate 起点 web fiction from
// literary fragments. Prints statistics only — never the text itself.
//
//   node tools/style-probe.mjs
//
// Numbers measured this way are recorded in docs/style-study.md.
import { pathToFileURL } from 'node:url'

const SOURCES = [
  ['凡人修仙传', 'https://mfanrenxiuxianzhuan.bookresource.qq.com/chapter/107580/4631519'],
  ['诡秘之主', 'https://mguimizhizhu.bookresource.qq.com/chapter/1010868264/402733549'],
  ['大奉打更人', 'https://mdafengdagengren.bookresource.qq.com/chapter/1019664125/523355436'],
  ['宿命之环', 'https://msumingzhihuan.bookresource.qq.com/chapter/1036370336/745977561'],
]

const SENTENCE_END = /[。！？…]+/g

/** Pull the chapter body out of the mobile reading page. */
function extract(html) {
  const heading = html.indexOf('# 第一章')
  const tail = html.indexOf('· 作家说')
  const body = html.slice(heading >= 0 ? heading : 0, tail > 0 ? tail : undefined)
  return body
    .replace(/<[^>]+>/g, '\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/上起点读书APP[\s\S]*?不限免/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#') && !line.startsWith('*'))
}

/** Measure one chapter. */
export function measure(paragraphs) {
  const text = paragraphs.join('')
  const chars = text.replace(/\s/g, '').length
  const lengths = paragraphs.map((p) => p.replace(/\s/g, '').length)
  const sorted = [...lengths].sort((a, b) => a - b)
  const sentences = paragraphs
    .flatMap((p) => p.split(SENTENCE_END).map((s) => s.trim()))
    .filter((s) => s.length > 0)
  const sentenceLengths = sentences.map((s) => s.replace(/[“”「」『』\s]/g, '').length)
  const singleSentenceParagraphs = paragraphs.filter((p) => (p.match(SENTENCE_END) ?? []).length <= 1).length
  const dialogue = paragraphs
    .map((p) => (p.match(/[「“"][^」”"]*[」”"]/g) ?? []).join(''))
    .join('')
    .replace(/\s/g, '').length

  return {
    chars,
    paragraphs: paragraphs.length,
    sentenceMean: Number((sentenceLengths.reduce((a, b) => a + b, 0) / (sentences.length || 1)).toFixed(1)),
    paragraphMedian: sorted[Math.floor(sorted.length / 2)] ?? 0,
    singleSentenceRatio: Number(((singleSentenceParagraphs / (paragraphs.length || 1)) * 100).toFixed(1)),
    dialogueRatio: Number(((dialogue / (chars || 1)) * 100).toFixed(1)),
    shortSentenceRatio: Number(((sentenceLengths.filter((n) => n <= 8).length / (sentences.length || 1)) * 100).toFixed(1)),
    longSentenceRatio: Number(((sentenceLengths.filter((n) => n > 40).length / (sentences.length || 1)) * 100).toFixed(1)),
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [title, url] of SOURCES) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } })
      const stats = measure(extract(await response.text()))
      console.log(title, JSON.stringify(stats))
    } catch (error) {
      console.log(title, 'FAILED', error.message)
    }
  }
}

