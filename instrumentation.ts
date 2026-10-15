/** Next.js calls this once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.REEFER_RUNTIME !== 'off') {
    const { startRuntime } = await import('./lib/server/runtime');
    await startRuntime();
  }
}
