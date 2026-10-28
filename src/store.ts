import { randomUUID } from "node:crypto"
import { watch } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export const DEFAULT_PATH = path.join(os.homedir(), "Documents", "OpenCode", "notepad.md")

export function resolvePath(option: unknown): string {
  if (typeof option !== "string" || !option.trim()) return DEFAULT_PATH
  const value = option.trim()
  return path.resolve(value === "~" ? os.homedir() : value.replace(/^~(?=\/)/, os.homedir()))
}

const STARTER = "- [ ] Try: ask the agent to \"add this to the list\"\n\n## Notes\n\nFree Markdown goes here.\n"

// Owns the note file. Mutations run one at a time, so a GUI click and an agent tool call never
// overwrite each other. `changed` fires after every write, and after edits made by other apps.
export function createStore(file: string, changed: (doc: string) => void) {
  let last: string | undefined
  let queue: Promise<unknown> = Promise.resolve()

  async function load(): Promise<string> {
    try {
      return await readFile(file, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      // The server runs one plugin instance per project, so another instance may create the file first.
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, STARTER, { encoding: "utf8", flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error
      })
      return await readFile(file, "utf8")
    }
  }

  async function save(doc: string) {
    await mkdir(path.dirname(file), { recursive: true })
    const temp = `${file}.${randomUUID()}.tmp`
    await writeFile(temp, doc, "utf8")
    await rename(temp, file)
    last = doc
  }

  function run<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task)
    queue = next.catch(() => undefined)
    return next
  }

  return {
    path: file,
    read: () => run(async () => (last = await load())),
    update: (edit: (doc: string) => string) =>
      run(async () => {
        const before = await load()
        const after = edit(before)
        if (after !== before) await save(after)
        changed(after)
        return after
      }),
    // Watches the folder, not the file: editors that save by rename replace the file's inode.
    watch(): () => void {
      let timer: ReturnType<typeof setTimeout> | undefined
      const watcher = watch(path.dirname(file), (_event, name) => {
        if (name && name.toString() !== path.basename(file)) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          void run(async () => {
            const doc = await load()
            if (doc === last) return
            last = doc
            changed(doc)
          }).catch(() => undefined)
        }, 150)
      })
      return () => {
        clearTimeout(timer)
        watcher.close()
      }
    },
  }
}
