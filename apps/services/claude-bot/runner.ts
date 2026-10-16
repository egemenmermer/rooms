import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface RunInput {
  prompt: string;
  sessionId: string | null;
  cwd: string;
  model: string;
  systemPrompt: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onStep?: (step: string) => void;
  /** Injected for tests; defaults to the official `claude` CLI on PATH. */
  command?: string;
  env?: NodeJS.ProcessEnv;
}
export interface RunResult {
  sessionId: string | null;
  text: string;
  costUsd: number;
  turns: number;
  isError: boolean;
  stopped: 'timeout' | 'aborted' | null;
}

const short = (value: unknown, length = 90) => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

/** One readable progress line per tool call; never echoes file contents or tool output. */
export function describeToolUse(name: string, input: Record<string, unknown> = {}) {
  switch (name) {
    case 'Bash':
      return `$ ${short(input.command, 80)}`;
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return `${name} ${short(input.file_path ?? input.notebook_path, 70)}`;
    case 'Grep':
    case 'Glob':
      return `${name} ${short(input.pattern, 60)}`;
    case 'WebSearch':
      return `Web search: ${short(input.query, 70)}`;
    case 'WebFetch':
      return `Fetch ${short(input.url, 70)}`;
    case 'Task':
    case 'Agent':
      return `Subagent: ${short(input.description, 70)}`;
    case 'TodoWrite':
      return null;
    default:
      return name.startsWith('mcp__') ? `Tool ${short(name, 60)}` : name;
  }
}

/**
 * Run one turn of a conversation with the official Claude Code CLI in headless mode
 * (`claude -p --output-format stream-json`), resuming the conversation's session.
 */
export function runClaude(input: RunInput): Promise<RunResult> {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    input.model,
    '--permission-mode',
    'bypassPermissions',
    '--append-system-prompt',
    input.systemPrompt,
    ...(input.sessionId ? ['--resume', input.sessionId] : []),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(input.command ?? 'claude', args, {
      cwd: input.cwd,
      env: input.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let sessionId = input.sessionId;
    let text = '';
    let lastAssistantText = '';
    let costUsd = 0;
    let turns = 0;
    let isError = false;
    let stopped: RunResult['stopped'] = null;
    let stderr = '';
    const stop = (reason: 'timeout' | 'aborted') => {
      if (stopped) return;
      stopped = reason;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    };
    const timer = setTimeout(() => stop('timeout'), input.timeoutMs);
    const onAbort = () => stop('aborted');
    input.signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-4000);
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof event?.session_id === 'string') sessionId = event.session_id;
      if (event?.type === 'assistant' && Array.isArray(event.message?.content)) {
        const parts: string[] = [];
        for (const block of event.message.content) {
          if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
          if (block?.type === 'tool_use') {
            const step = describeToolUse(String(block.name ?? ''), block.input ?? {});
            if (step) input.onStep?.(step);
          }
        }
        if (parts.length) lastAssistantText = parts.join('\n');
      }
      if (event?.type === 'result') {
        text = typeof event.result === 'string' ? event.result : '';
        costUsd = Number(event.total_cost_usd) || 0;
        turns = Number(event.num_turns) || 0;
        isError = event.is_error === true || event.subtype !== 'success';
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', onAbort);
      if (!text) text = lastAssistantText;
      if (code !== 0 && !text && !stopped)
        return reject(new Error(`claude exited with code ${code}: ${short(stderr, 300)}`));
      resolve({ sessionId, text, costUsd, turns, isError: isError || code !== 0, stopped });
    });
    child.stdin.end(input.prompt);
  });
}
