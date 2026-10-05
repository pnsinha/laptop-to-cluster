import { createServer } from 'node:http';

export interface FixtureFile { body: string | Buffer; type?: string; status?: number }

/** A throwaway HTTP server for synthetic pages, so the browser checks can be proven on a good page and a bad page before they meet real pages. */
export async function serveFixtures(files: Record<string, FixtureFile>): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const file = files[pathname];
    if (!file) { response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    response.writeHead(file.status ?? 200, { 'Content-Type': file.type ?? 'text/html; charset=utf-8' }).end(file.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server did not start');
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
