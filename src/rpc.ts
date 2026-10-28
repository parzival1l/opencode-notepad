import { Rpc } from "@opencode/plugin/rpc"

// Every call names the chat it works on. The server stores a subagent's notes in its parent chat.
const sessionID = { type: "string", minLength: 1 } as const

const state = {
  type: "object",
  properties: { sessionID, doc: { type: "string" }, path: { type: "string" } },
  required: ["sessionID", "doc", "path"],
  additionalProperties: false,
} as const

const index = { type: "integer", minimum: 0 } as const

function input<P extends Record<string, unknown>>(properties: P) {
  return {
    type: "object",
    properties: { sessionID, ...properties },
    required: ["sessionID", ...Object.keys(properties)],
    additionalProperties: false,
  } as const
}

// `sessionID` in a reply or event is the chat that owns the note, which may be the caller's parent.
export interface State {
  readonly sessionID: string
  readonly doc: string
  readonly path: string
}

export const Notepad = Rpc.define({
  id: "notepad",
  methods: {
    read: { input: input({}), output: state },
    add: { input: input({ items: { type: "array", items: { type: "string" } } }), output: state },
    check: { input: input({ index, checked: { type: "boolean" } }), output: state },
    rename: { input: input({ index, text: { type: "string" } }), output: state },
    remove: { input: input({ index }), output: state },
    clearDone: { input: input({}), output: state },
    appendNote: { input: input({ markdown: { type: "string" } }), output: state },
    setBody: { input: input({ body: { type: "string" } }), output: state },
  },
  events: {
    updated: { schema: state },
  },
})
