/**
 * Where this plugin keeps its sidecar state.
 *
 * The running desktop app provides `profileContext.dir`, which is the only
 * authoritative answer — the process environment does not carry
 * `DSH_PROFILE_DIR`/`DSH_PROFILE` (those are seeded for tool subprocesses), so an
 * env-only lookup silently lands in `profiles/default`. That bug wrote real user
 * switches into a directory nobody would ever look at; the resolution order here
 * exists to make it impossible again.
 *
 * @module dsh-storyteller/paths
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Child path inside a profile directory. */
const RELATIVE = ['plugin-data', 'dsh-storyteller', 'state.json']

/** Trim a value to a non-empty string. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Profile directory from the harness home, for hosts without `profileContext`.
 *
 * @param {NodeJS.ProcessEnv} env - environment to read.
 * @param {NodeJS.Platform} platform - used only to pick a home directory.
 * @returns {string} absolute profile directory.
 */
export function profileDirFromEnv(env = process.env, platform = process.platform) {
  const explicit = text(env.DSH_PROFILE_DIR)
  if (explicit.length > 0) return explicit
  const homeRoot = text(env.DSH_HOME) || path.join(platform === 'win32' ? env.USERPROFILE ?? env.HOME ?? os.homedir() : env.HOME ?? os.homedir(), '.dsh')
  const profileName = text(env.DSH_PROFILE) || 'default'
  return path.join(homeRoot, 'profiles', profileName)
}

/**
 * Resolve the state file for a profile directory.
 *
 * @param {NodeJS.ProcessEnv} [env] - environment to read.
 * @param {NodeJS.Platform} [platform] - platform, for the home fallback.
 * @returns {string} absolute path to the store file.
 */
export function resolveStorePath(env = process.env, platform = process.platform) {
  return path.join(profileDirFromEnv(env, platform), ...RELATIVE)
}

/**
 * Resolve the state file the way the running host should.
 *
 * Order: an explicit `config.statePath` (composition), then the live
 * `profileContext.dir` (what the app actually booted), then the environment as a
 * last resort for headless runs.
 *
 * @param {{config?: {statePath?: string}, profileContext?: {dir?: string}, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform}} options - resolution inputs.
 * @returns {string} absolute path to the store file.
 */
export function resolveStatePath(options = {}) {
  const configured = text(options.config?.statePath)
  if (configured.length > 0) return path.resolve(configured)
  const live = text(options.profileContext?.dir)
  if (live.length > 0) return path.join(live, ...RELATIVE)
  return resolveStorePath(options.env ?? process.env, options.platform ?? process.platform)
}

/**
 * Copy a state file left behind in `profiles/default` to the live profile once.
 *
 * Best effort and never overwrites: the migration exists because 0.2.2 wrote to
 * the wrong profile, and a user's switches should survive the fix.
 *
 * @param {string} targetPath - the state file the host resolved.
 * @param {{env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform}} [options] - environment for locating the legacies.
 * @returns {boolean} whether a legacy file was copied.
 */
export function migrateLegacyState(targetPath, options = {}) {
  if (fs.existsSync(targetPath)) return false
  const env = options.env ?? process.env
  const homeRoot = text(env.DSH_HOME) || path.join(os.homedir(), '.dsh')
  const candidates = [path.join(homeRoot, 'profiles', 'default', ...RELATIVE)]
  for (const candidate of candidates) {
    if (candidate === targetPath) continue
    if (!fs.existsSync(candidate)) continue
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      fs.copyFileSync(candidate, targetPath)
      return true
    } catch {
      return false
    }
  }
  return false
}
