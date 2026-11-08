/**
 * A throwaway Anthropic-Messages-shaped SSE server.
 *
 * Purpose: prove that the plugin's two prompt sections actually reach a model
 * request, without needing a real API key. Point a scratch profile's
 * `llm-deepseek` row at it (`baseURL: http://127.0.0.1:18901`), export any
 * `DEEPSEEK_API_KEY`, and each request is logged with the system-prompt length
 * and the visible tool names — which is exactly the gating this plugin claims.
 *
 *   node tools/fake-llm.mjs
 *   FAKE_PORT=18901 FAKE_REPLY=收到 FAKE_DUMP_SYSTEM=1 node tools/fake-llm.mjs
 *
 * Not part of the installed plugin; it is a development fixture.
 */

import http from 'node:http'

const PORT = Number(process.env.FAKE_PORT ?? 18901)
const replyText = process.env.FAKE_REPLY ?? '收到'

/** Write one SSE frame. */
function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    if (process.env.FAKE_DUMP !== '0') {
      try {
        const parsed = JSON.parse(body || '{}')
        const system = JSON.stringify(parsed.system ?? null)
        const tools = (parsed.tools ?? []).map((tool) => tool.name)
        console.log(`[fake-llm] ${req.method} ${req.url} systemChars=${system.length} tools=${JSON.stringify(tools)}`)
        if (process.env.FAKE_DUMP_SYSTEM === '1') console.log(`[fake-llm] system=${system}`)
      } catch {
        console.log(`[fake-llm] ${req.method} ${req.url} (unparsed body ${body.length}b)`)
      }
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    sse(res, 'message_start', {
      type: 'message_start',
      message: {
        id: 'msg_fake_1',
        type: 'message',
        role: 'assistant',
        model: 'deepseek-flash',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 12, output_tokens: 0 },
      },
    })
    sse(res, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
    sse(res, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: replyText } })
    sse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
    sse(res, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 2 },
    })
    sse(res, 'message_stop', { type: 'message_stop' })
    res.end()
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fake-llm] listening on http://127.0.0.1:${PORT}`)
})
