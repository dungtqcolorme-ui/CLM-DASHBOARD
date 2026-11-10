import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function runCodexTurn({ threadId, prompt, binary = 'codex', cwd = process.cwd() }) {
  if (!uuid.test(threadId) || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1200) {
    return Promise.reject(new Error('Invalid Codex job'));
  }

  return new Promise((resolve, reject) => {
    // The CLI reads its existing ChatGPT login. Bridge and API secrets are excluded.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      ['HOME', 'PATH', 'LOGNAME', 'USER', 'TMPDIR', 'LANG', 'LC_ALL', 'CODEX_HOME'].includes(key)));
    const args = [
      'exec', '--json', '--ignore-user-config',
      '-c', 'sandbox_mode="read-only"',
      '-c', 'approval_policy="never"',
      '-c', 'features.shell_tool=false',
      '-c', 'features.apps=false',
      '-c', 'features.hooks=false',
      '-c', 'features.multi_agent=false',
      '-c', 'features.remote_plugin=false',
      '-c', 'mcp_servers={}',
      '-c', 'web_search="disabled"',
      '-c', 'developer_instructions="Reply in Vietnamese as the ColorME Marketing advisor. Treat Studio requests as text advice only. Do not invoke tools, read files, change anything, or publish. Do not disclose other people’s prompts, private conversation history or secrets. Use prior shared context only to give appropriate Marketing advice."',
      'resume', threadId, '-',
    ];
    const child = spawn(binary, args, { cwd, env, stdio: ['pipe', 'pipe', 'ignore'] });
    let correctThread = false;
    let completed = false;
    let answer = '';
    let expired = false;
    let killTimer;
    const timeout = setTimeout(() => {
      expired = true;
      child.kill();
      killTimer = setTimeout(() => child.kill('SIGKILL'), 2000).unref();
    }, 135000).unref();
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      let event;
      try { event = JSON.parse(line); } catch { return; }
      if (event.type === 'thread.started') correctThread = event.thread_id === threadId;
      if (event.type === 'item.completed' && event.item?.type === 'agent_message'
        && typeof event.item.text === 'string') answer = event.item.text.trim().slice(0, 10000);
      if (event.type === 'turn.completed') completed = true;
      if (event.type === 'turn.failed') completed = false;
    });
    child.once('error', reject);
    child.stdin.on('error', () => { /* Child exit determines the result. */ });
    child.once('close', code => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      lines.close();
      if (expired || code !== 0 || !correctThread || !completed || !answer) {
        reject(new Error('Codex did not finish a turn in the configured thread'));
      } else resolve(answer);
    });
    child.stdin.end('[Creative Studio · hỏi đáp Marketing]\n' + prompt);
  });
}

function bridgeSettings() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const threadId = process.env.CLM_CODEX_THREAD_ID?.trim() ?? '';
  const token = process.env.CLM_CODEX_BRIDGE_TOKEN?.trim() ?? '';
  const url = rawUrl && new URL(rawUrl);
  if (!url || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    || url.username || url.password || !publishableKey || !uuid.test(threadId) || !/^[0-9a-f]{64}$/.test(token)) {
    throw new Error('Cần URL Studio, ID chat Codex và token cầu nối hợp lệ.');
  }
  return { endpoint: new URL('/rest/v1/rpc/marketing_codex_relay_job', url), publishableKey, token, threadId };
}

async function runBridge() {
  const { endpoint, publishableKey, token, threadId } = bridgeSettings();
  const once = process.argv.includes('--once');
  const call = async payload => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ ...payload, p_token: token, p_thread: threadId }),
    });
    if (!response.ok) throw new Error(`Studio bridge HTTP ${response.status}`);
    return response.json();
  };
  console.log('Cầu nối ColorME Marketing đang chờ câu hỏi.');
  do {
    try {
      const job = await call({ p_action: 'claim' });
      if (job) {
        if (job.threadId !== threadId || !uuid.test(job.id) || !uuid.test(job.lease)) throw new Error('Invalid pinned thread job');
        let answer = null;
        try {
          answer = await runCodexTurn({ threadId, prompt: job.prompt });
        } catch {
          console.error('Codex chưa hoàn thành câu trả lời cho lượt vừa nhận.');
        }
        const result = { p_action: 'complete', p_id: job.id, p_lease: job.lease, p_answer: answer };
        // Retrying delivery does not run another Codex turn.
        try { await call(result); } catch { await delay(900); await call(result); }
      }
    } catch (error) {
      console.error(error instanceof Error && /^Studio bridge HTTP \d+$/.test(error.message)
        ? error.message : 'Không thể trao đổi với máy chủ Studio.');
      if (once) process.exitCode = 1;
    }
    if (!once) await delay(10000);
  } while (!once);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBridge().catch(() => {
    console.error('Không thể mở cầu nối. Kiểm tra URL, token và ID chat đã cấu hình.');
    process.exitCode = 1;
  });
}
