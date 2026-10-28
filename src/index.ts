import { Plugin } from "@opencode/plugin"
import * as Note from "./note"
import { Notepad, type State } from "./rpc"
import { createNotebook, resolveDir } from "./store"

function listing(doc: string, file: string): string {
  const note = Note.parse(doc)
  const tasks = note.tasks.length
    ? note.tasks.map((task, i) => `${i}. [${task.checked ? "x" : " "}] ${task.text}`).join("\n")
    : "(no checklist items)"
  return `Notepad for this chat: ${file}\n\nChecklist (index. [state] text):\n${tasks}\n\nNotes:\n${note.body || "(empty)"}`
}

export default Plugin.define({
  id: "notepad",
  async setup(ctx) {
    let emit: (state: State) => void = () => {}
    const book = createNotebook(resolveDir(ctx.options.dir), (sessionID, doc) =>
      emit({ sessionID, doc, path: book.path(sessionID) }),
    )

    // A chat and its subagents share one notepad: the top-level session's.
    const roots = new Map<string, string>()
    async function root(sessionID: string): Promise<string> {
      const known = roots.get(sessionID)
      if (known) return known
      let current = sessionID
      for (let depth = 0; depth < 16; depth++) {
        const info = await ctx.session.get({ sessionID: current }).catch(() => undefined)
        if (!info?.parentID) break
        current = info.parentID
      }
      roots.set(sessionID, current)
      return current
    }

    async function edit(sessionID: string, change: (doc: string) => string): Promise<State> {
      const id = await root(sessionID)
      return { sessionID: id, doc: await book.update(id, change), path: book.path(id) }
    }

    const rpc = await ctx.rpc.register(Notepad, {
      read: async (input) => {
        const id = await root((input as { sessionID: string }).sessionID)
        return { sessionID: id, doc: await book.read(id), path: book.path(id) }
      },
      add: async (input) => {
        const { sessionID, items } = input as { sessionID: string; items: string[] }
        return edit(sessionID, (doc) => Note.addTasks(doc, items))
      },
      check: async (input) => {
        const { sessionID, index, checked } = input as { sessionID: string; index: number; checked: boolean }
        return edit(sessionID, (doc) => Note.setChecked(doc, index, checked))
      },
      remove: async (input) => {
        const { sessionID, index } = input as { sessionID: string; index: number }
        return edit(sessionID, (doc) => Note.removeTask(doc, index))
      },
      clearDone: async (input) => edit((input as { sessionID: string }).sessionID, Note.clearDone),
      appendNote: async (input) => {
        const { sessionID, markdown } = input as { sessionID: string; markdown: string }
        return edit(sessionID, (doc) => Note.appendBody(doc, markdown))
      },
      setBody: async (input) => {
        const { sessionID, body } = input as { sessionID: string; body: string }
        return edit(sessionID, (doc) => Note.setBody(doc, body))
      },
    })
    emit = (state) => void rpc.events.emit("updated", { ...state }).catch(() => undefined)
    const unwatch = await book.watch()

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "notepad",
        description:
          "This chat's Notepad: a Markdown note in the OpenCode Desktop side panel, one per chat. Its top section is a " +
          'checklist. When the user says "add this to the list", "put that on my list", or "note that down", call notepad.add.',
      })
      editor.add({
        name: "add",
        description:
          "Add one or more items to the top checklist of this chat's Notepad. Use when the user says \"add this to the " +
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
        async execute(input, context) {
          const { items } = input as { items: string[] }
          const state = await edit(context.sessionID, (doc) => Note.addTasks(doc, items))
          const total = Note.parse(state.doc).tasks.length
          return { content: `Added ${items.length} item(s) to this chat's Notepad checklist (${total} total).` }
        },
      })
      editor.add({
        name: "check",
        description:
          "Check off (or uncheck) items in this chat's Notepad checklist. Match by `query` (case-insensitive text) or " +
          "by `index` from notepad.read. A query that matches several items checks all of them.",
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
        async execute(input, context) {
          const { query, index, checked = true } = input as { query?: string; index?: number; checked?: boolean }
          let matched: number[] = []
          const state = await edit(context.sessionID, (current) => {
            matched = index !== undefined ? [index] : Note.findTasks(current, query ?? "")
            return matched.reduce((next, i) => Note.setChecked(next, i, checked), current)
          })
          if (matched.length === 0) return { content: `No checklist item matches.\n\n${listing(state.doc, state.path)}` }
          const tasks = Note.parse(state.doc).tasks
          const names = matched.map((i) => `- ${tasks[i]!.text}`).join("\n")
          return { content: `${checked ? "Checked" : "Unchecked"} ${matched.length} item(s):\n${names}` }
        },
      })
      editor.add({
        name: "read",
        description: "Read this chat's Notepad: the numbered checklist and the free Markdown notes below it.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { namespace: "notepad", codemode: true },
        async execute(_input, context) {
          const id = await root(context.sessionID)
          return { content: listing(await book.read(id), book.path(id)) }
        },
      })
      editor.add({
        name: "append_note",
        description:
          "Append Markdown to the free-form notes section of this chat's Notepad, below the checklist. Use for longer " +
          "notes; use notepad.add for checklist items.",
        input: {
          type: "object",
          properties: { markdown: { type: "string" } },
          required: ["markdown"],
          additionalProperties: false,
        },
        options: { namespace: "notepad", codemode: true },
        async execute(input, context) {
          const { markdown } = input as { markdown: string }
          await edit(context.sessionID, (doc) => Note.appendBody(doc, markdown))
          return { content: "Appended to this chat's Notepad notes." }
        },
      })
    })

    return async () => {
      unwatch()
      await rpc.dispose()
    }
  },
})
