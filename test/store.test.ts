import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { addTasks } from "../src/note"
import { createNotebook, fileFor, resolveDir } from "../src/store"

let dir: string | undefined

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
})

async function temp() {
  dir = await mkdtemp(path.join(os.tmpdir(), "notepad-"))
  return path.join(dir, "notes")
}

test("a chat without a note reads as empty and creates no file", async () => {
  const book = createNotebook(await temp(), () => {})
  expect(await book.read("ses_a")).toBe("")
  expect(stat(book.path("ses_a"))).rejects.toThrow()
})

test("each chat writes its own file", async () => {
  const notes = await temp()
  const book = createNotebook(notes, () => {})
  await book.update("ses_a", (doc) => addTasks(doc, ["for a"]))
  await book.update("ses_b", (doc) => addTasks(doc, ["for b"]))
  expect(await readFile(path.join(notes, "ses_a.md"), "utf8")).toBe("- [ ] for a\n")
  expect(await readFile(path.join(notes, "ses_b.md"), "utf8")).toBe("- [ ] for b\n")
})

test("concurrent updates to one chat never lose an item", async () => {
  const book = createNotebook(await temp(), () => {})
  await Promise.all(Array.from({ length: 20 }, (_, i) => book.update("ses_a", (doc) => addTasks(doc, [`item ${i}`]))))
  const text = await readFile(book.path("ses_a"), "utf8")
  for (let i = 0; i < 20; i++) expect(text).toContain(`- [ ] item ${i}\n`)
})

test("two notebooks on one folder can write the same chat at once", async () => {
  const notes = await temp()
  const books = [createNotebook(notes, () => {}), createNotebook(notes, () => {})]
  await Promise.all(books.map((book, i) => book.update("ses_a", (doc) => addTasks(doc, [`from ${i}`]))))
  expect(await readFile(path.join(notes, "ses_a.md"), "utf8")).toMatch(/^- \[ \] from \d\n/)
})

test("reports each write with its chat", async () => {
  const seen: [string, string][] = []
  const book = createNotebook(await temp(), (sessionID, doc) => seen.push([sessionID, doc]))
  await book.update("ses_a", (doc) => addTasks(doc, ["x"]))
  expect(seen).toEqual([["ses_a", "- [ ] x\n"]])
})

test("rejects session IDs that could escape the folder", () => {
  expect(() => fileFor("/notes", "../etc/passwd")).toThrow()
  expect(() => fileFor("/notes", undefined as unknown as string)).toThrow()
  expect(fileFor("/notes", "ses_2Ab-9")).toBe("/notes/ses_2Ab-9.md")
})

test("resolveDir expands ~ and falls back to the data folder", () => {
  expect(resolveDir("~/pads")).toBe(path.join(os.homedir(), "pads"))
  const data = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
  expect(resolveDir(undefined)).toBe(path.join(data, "opencode-notepad"))
})
