import { Plugin } from "@opencode/plugin"
import * as Note from "./note"
import { Notepad } from "./rpc"
import { createStore, resolvePath } from "./store"

function listing(doc: string, file: string): string {
  const note = Note.parse(doc)
  const tasks = note.tasks.length
    ? note.tasks.map((task, i) => `${i}. [${task.checked ? "x" : " "}] ${task.text}`).join("\n")
    : "(no checklist items)"
  return `Notepad: ${file}\n\nChecklist (index. [state] text):\n${tasks}\n\nNotes:\n${note.body || "(empty)"}`
}

export default Plugin.define({
  id: "notepad",
  async setup(ctx) {
    let emit: (doc: string) => void = () => {}
    const store = createStore(resolvePath(ctx.options.path), (doc) => emit(doc))
    await store.read()

    const rpc = await ctx.rpc.register(Notepad, {
      read: async () => ({ doc: await store.read(), path: store.path }),
      add: async (input) => {
        const { items } = input as { items: string[] }
        return { doc: await store.update((doc) => Note.addTasks(doc, items)), path: store.path }
      },
      check: async (input) => {
        const { index, checked } = input as { index: number; checked: boolean }
        return { doc: await store.update((doc) => Note.setChecked(doc, index, checked)), path: store.path }
      },
      remove: async (input) => {
        const { index } = input as { index: number }
        return { doc: await store.update((doc) => Note.removeTask(doc, index)), path: store.path }
      },
      clearDone: async () => ({ doc: await store.update(Note.clearDone), path: store.path }),
      setBody: async (input) => {
        const { body } = input as { body: string }
        return { doc: await store.update((doc) => Note.setBody(doc, body)), path: store.path }
      },
    })
    emit = (doc) => void rpc.events.emit("updated", { doc, path: store.path }).catch(() => undefined)
    const unwatch = store.watch()

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "notepad",
        description:
          "The user's Notepad: a Markdown note in the OpenCode Desktop side panel. Its top section is a checklist. " +
          'When the user says "add this to the list", "put that on my list", or "note that down", call notepad.add.',
      })
      editor.add({
        name: "add",
        description:
          'Add one or more items to the top checklist of the user\'s Notepad. Use when the user says "add this to the ' +
          'list", "add to my notepad", "remind me to", or similar. Write each item as a short, self-contained line; ' +
          'resolve "this" or "that" from the conversation.',
        input: {
          type: "object",
          properties: {
            items: { type: "array", items: { type: "string" }, minItems: 1, description: "One checklist line each." },
          },
          required: ["items"],
          additionalProperties: false,
        },
        options: { namespace: "notepad", codemode: true, pinned: true },
        async execute(input) {
          const { items } = input as { items: string[] }
          const doc = await store.update((current) => Note.addTasks(current, items))
          const total = Note.parse(doc).tasks.length
          return { content: `Added ${items.length} item(s) to the Notepad checklist (${total} total).` }
        },
      })
      editor.add({
        name: "check",
        description:
          "Check off (or uncheck) Notepad checklist items. Match by `query` (case-insensitive text) or by `index` " +
          "from notepad.read. A query that matches several items checks all of them.",
        input: {
          type: "object",
          properties: {
            query: { type: "string" },
            index: { type: "integer", minimum: 0 },
            checked: { type: "boolean", default: true },
          },
          additionalProperties: false,
        },
        options: { namespace: "notepad", codemode: true },
        async execute(input) {
          const { query, index, checked = true } = input as { query?: string; index?: number; checked?: boolean }
          let matched: number[] = []
          const doc = await store.update((current) => {
            matched = index !== undefined ? [index] : Note.findTasks(current, query ?? "")
            return matched.reduce((next, i) => Note.setChecked(next, i, checked), current)
          })
          if (matched.length === 0) return { content: `No checklist item matches.\n\n${listing(doc, store.path)}` }
          const tasks = Note.parse(doc).tasks
          const names = matched.map((i) => `- ${tasks[i]!.text}`).join("\n")
          return { content: `${checked ? "Checked" : "Unchecked"} ${matched.length} item(s):\n${names}` }
        },
      })
      editor.add({
        name: "read",
        description: "Read the user's Notepad: the numbered checklist and the free Markdown notes below it.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { namespace: "notepad", codemode: true },
        async execute() {
          return { content: listing(await store.read(), store.path) }
        },
      })
      editor.add({
        name: "append_note",
        description:
          "Append Markdown to the free-form notes section of the Notepad, below the checklist. Use for longer notes; " +
          "use notepad.add for checklist items.",
        input: {
          type: "object",
          properties: { markdown: { type: "string" } },
          required: ["markdown"],
          additionalProperties: false,
        },
        options: { namespace: "notepad", codemode: true },
        async execute(input) {
          const { markdown } = input as { markdown: string }
          await store.update((doc) => {
            const body = Note.parse(doc).body
            return Note.setBody(doc, body ? `${body}\n\n${markdown.trim()}` : markdown.trim())
          })
          return { content: "Appended to the Notepad notes." }
        },
      })
    })

    return async () => {
      unwatch()
      await rpc.dispose()
    }
  },
})
