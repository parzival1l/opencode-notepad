import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { addTasks } from "../src/note"
import { createStore, resolvePath } from "../src/store"

let dir: string | undefined

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

test("creates the file with a starter note on first read", async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "notepad-"))
  const file = path.join(dir, "nested", "notepad.md")
  const doc = await createStore(file, () => {}).read()
  expect(await readFile(file, "utf8")).toBe(doc)
  expect(doc.startsWith("- [ ] ")).toBe(true)
})

test("two plugin instances can create the file at the same time", async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "notepad-"))
  const file = path.join(dir, "notepad.md")
  const docs = await Promise.all(Array.from({ length: 4 }, () => createStore(file, () => {}).read()))
  expect(new Set(docs).size).toBe(1)
})

test("concurrent updates never lose an item", async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "notepad-"))
  const store = createStore(path.join(dir, "notepad.md"), () => {})
  await store.read()
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.update((doc) => addTasks(doc, [`item ${i}`]))))
  const text = await readFile(store.path, "utf8")
  for (let i = 0; i < 20; i++) expect(text).toContain(`- [ ] item ${i}\n`)
})

test("reports each write to the change listener", async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "notepad-"))
  const seen: string[] = []
  const store = createStore(path.join(dir, "notepad.md"), (doc) => seen.push(doc))
  await store.read()
  const after = await store.update((doc) => addTasks(doc, ["x"]))
  expect(seen).toEqual([after])
})

test("resolvePath expands ~ and falls back to the default", () => {
  expect(resolvePath("~/notes/pad.md")).toBe(path.join(os.homedir(), "notes", "pad.md"))
  expect(resolvePath(undefined)).toBe(path.join(os.homedir(), "Documents", "OpenCode", "notepad.md"))
})
