import { Rpc } from "@opencode/plugin/rpc"

const state = {
  type: "object",
  properties: { doc: { type: "string" }, path: { type: "string" } },
  required: ["doc", "path"],
  additionalProperties: false,
} as const

const index = { type: "integer", minimum: 0 } as const

const empty = { type: "object", properties: {}, additionalProperties: false } as const

export interface State {
  readonly doc: string
  readonly path: string
}

export const Notepad = Rpc.define({
  id: "notepad",
  methods: {
    read: { input: empty, output: state },
    add: {
      input: {
        type: "object",
        properties: { items: { type: "array", items: { type: "string" } } },
        required: ["items"],
        additionalProperties: false,
      },
      output: state,
    },
    check: {
      input: {
        type: "object",
        properties: { index, checked: { type: "boolean" } },
        required: ["index", "checked"],
        additionalProperties: false,
      },
      output: state,
    },
    remove: {
      input: { type: "object", properties: { index }, required: ["index"], additionalProperties: false },
      output: state,
    },
    clearDone: { input: empty, output: state },
    setBody: {
      input: {
        type: "object",
        properties: { body: { type: "string" } },
        required: ["body"],
        additionalProperties: false,
      },
      output: state,
    },
  },
  events: {
    updated: { schema: state },
  },
})
