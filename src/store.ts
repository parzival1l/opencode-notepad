import { randomUUID } from "node:crypto"
import { watch } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const home = os.homedir()

// One Markdown file per chat lives here, beside OpenCode's own data, not in a user folder.
export const DEFAULT_DIR = path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "opencode-notepad")

export function resolveDir(option: unknown): string {
  if (typeof option !== "string" || !option.trim()) return DEFAULT_DIR
  const value = option.trim()
  return path.resolve(value === "~" ? home : value.replace(/^~(?=\/)/, home))
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/

// `typeof` first: a missing ID would otherwise pass the pattern as the text "undefined".
export function fileFor(dir: string, sessionID: string): string {
  if (typeof sessionID !== "string" || !SAFE_ID.test(sessionID)) throw new Error(`Invalid session ID: ${sessionID}`)
  return path.join(dir, `${sessionID}.md`)
}

// Owns the notepad files of every chat. Edits to one file run one at a time, so a GUI click and an
// agent tool call never overwrite each other. `changed` fires after every write, and after edits
// made by other apps.
export function createNotebook(dir: string, changed: (sessionID: string, doc: string) => void) {
  const last = new Map<string, string>()
  const queues = new Map<string, Promise<unknown>>()

  async function load(sessionID: string): Promise<string> {
    try {
      return await readFile(fileFor(dir, sessionID), "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""
      throw error
    }
  }

  async function save(sessionID: string, doc: string) {
    const file = fileFor(dir, sessionID)
    await mkdir(dir, { recursive: true })
    const temp = `${file}.${randomUUID()}.tmp`
    await writeFile(temp, doc, "utf8")
    await rename(temp, file)
    last.set(sessionID, doc)
  }

  function run<T>(sessionID: string, task: () => Promise<T>): Promise<T> {
    const next = (queues.get(sessionID) ?? Promise.resolve()).then(task, task)
    queues.set(
      sessionID,
      next.catch(() => undefined),
    )
    return next
  }

  return {
    dir,
    path: (sessionID: string) => fileFor(dir, sessionID),
    read: (sessionID: string) =>
      run(sessionID, async () => {
        const doc = await load(sessionID)
        last.set(sessionID, doc)
        return doc
      }),
    update: (sessionID: string, edit: (doc: string) => string) =>
      run(sessionID, async () => {
        const before = await load(sessionID)
        const after = edit(before)
        if (after !== before) await save(sessionID, after)
        changed(sessionID, after)
        return after
      }),
    // Watches the folder, not each file: editors that save by rename replace the file's inode.
    async watch(): Promise<() => void> {
      await mkdir(dir, { recursive: true })
      const timers = new Map<string, ReturnType<typeof setTimeout>>()
      const watcher = watch(dir, (_event, name) => {
        const match = name ? /^([A-Za-z0-9_-]+)\.md$/.exec(name.toString()) : null
        if (!match) return
        const sessionID = match[1]!
        clearTimeout(timers.get(sessionID))
        timers.set(
          sessionID,
          setTimeout(() => {
            void run(sessionID, async () => {
              const doc = await load(sessionID)
              if (doc === last.get(sessionID)) return
              last.set(sessionID, doc)
              changed(sessionID, doc)
            }).catch(() => undefined)
          }, 150),
        )
      })
      return () => {
        for (const timer of timers.values()) clearTimeout(timer)
        watcher.close()
      }
    },
  }
}
