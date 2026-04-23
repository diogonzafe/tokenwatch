import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getDashboardData, getFingerprint } from './data.js'
import { getHtml } from './html.js'
import type { IStorage } from '../types/index.js'

export function startDashboardServer(storage: IStorage, port: number): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(getHtml(port))
      return
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      const filter = url.searchParams.get('filter') ?? '24h'

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders()

      let lastFingerprint = ''

      async function sendData(): Promise<void> {
        try {
          const data = await getDashboardData(storage, filter)
          const fp = getFingerprint(data)
          if (fp !== lastFingerprint) {
            lastFingerprint = fp
            res.write(`data: ${JSON.stringify(data)}\n\n`)
          }
        } catch {
          // best-effort — storage errors must not crash the server
        }
      }

      // Send immediately on connect
      void sendData()

      const timer = setInterval(() => { void sendData() }, 3000)

      res.on('close', () => {
        clearInterval(timer)
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[tokenwatch] Port ${port} is already in use. Try: tokenwatch dashboard --port <other>`)
      process.exit(1)
    }
    throw err
  })

  server.listen(port, () => {
    console.log(`tokenwatch dashboard → http://localhost:${port}`)
  })
}
