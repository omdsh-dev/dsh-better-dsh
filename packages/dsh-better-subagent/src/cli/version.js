/**
 * CLI version preflight: turn "the CLI exists but the protocol/version is not
 * the one this bridge was built against" into an actionable failure BEFORE any
 * durable child identity is written. There is no silent fallback to the other
 * backend.
 *
 * The tested protocol baselines:
 * - codex-cli 0.162.1 (`codex exec --json`, root `-p/-s/-a/-C` before `exec`)
 * - Claude Code 2.1.300 (`claude --print --output-format stream-json --verbose`)
 *
 * Unknown/unparseable version output is rejected on purpose: guessing would
 * trade a clear diagnostic for a confusing failure mid-turn. The exact
 * executable path is named in the caller's wrapper error.
 */

import { execFile } from 'node:child_process'

/** Minimum supported version per CLI (the tested protocol baseline). */
export const CLI_MIN_VERSIONS = Object.freeze({
  codex: Object.freeze([0, 162, 1]),
  claude: Object.freeze([2, 1, 300]),
})

/** Bound for `<cli> --version`; a hung CLI must not block child creation. */
export const CLI_VERSION_TIMEOUT_MS = 5_000

/** Human-readable minimum for diagnostics. */
export const CLI_MIN_LABELS = Object.freeze({
  codex: '0.162.1',
  claude: '2.1.300',
})

/**
 * Extract the first `major.minor.patch` from version output.
 * @param {unknown} text - `--version` stdout/stderr.
 * @returns {[number, number, number] | undefined}
 */
export function parseCliVersion(text) {
  const match = /(?:^|[^\d])(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? ''))
  if (match === null) return undefined
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])]
  return parts.every((part) => Number.isSafeInteger(part) && part >= 0) ? parts : undefined
}

/** Compare two parsed versions. */
export function versionAtLeast(found, minimum) {
  for (let index = 0; index < 3; index += 1) {
    if (found[index] > minimum[index]) return true
    if (found[index] < minimum[index]) return false
  }
  return true
}

/**
 * Validate one CLI's version output against the tested baseline.
 * @param {'codex'|'claude'} cli - backend id.
 * @param {unknown} output - `--version` text.
 * @param {string} [executable] - resolved executable path for the diagnostic.
 * @returns {string} the detected version (for diagnostics/tests).
 * @throws {Error} unparseable or older than the supported minimum.
 */
export function assertCliVersion(cli, output, executable) {
  const where = typeof executable === 'string' && executable !== '' ? ` at ${executable}` : ''
  const minimum = CLI_MIN_VERSIONS[cli]
  if (minimum === undefined) throw new Error(`Better Subagent has no version baseline for CLI "${String(cli)}"`)
  const found = parseCliVersion(output)
  if (found === undefined) {
    throw new Error(`Better Subagent could not recognize the ${cli} version from \`${cli} --version\`${where}; install ${cli} ${CLI_MIN_LABELS[cli]} or newer and make sure the command works, or set its absolute path in Plugins → Better Subagent`)
  }
  if (!versionAtLeast(found, minimum)) {
    throw new Error(`Better Subagent requires ${cli} ${CLI_MIN_LABELS[cli]} or newer (found ${found.join('.')})${where}; update the executable or set a supported one in Plugins → Better Subagent`)
  }
  return found.join('.')
}

/**
 * Run `<executable> --version` without a shell.
 * @param {string} executable - resolved absolute executable path.
 * @param {{timeoutMs?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<string>} combined stdout/stderr (version parsers accept either).
 */
export function probeCliVersion(executable, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, ['--version'], {
      timeout: options.timeoutMs ?? CLI_VERSION_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: 64 * 1024,
      windowsHide: true,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(error)
        return
      }
      resolve(`${String(stdout ?? '')}\n${String(stderr ?? '')}`)
    })
  })
}
