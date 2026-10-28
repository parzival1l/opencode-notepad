import { describe, expect, test } from "bun:test"
import * as Note from "../src/note"

const doc = "- [ ] buy milk\n- [x] ship PR\n\n## Notes\n\nSome *markdown*.\n"

describe("parse", () => {
  test("splits the leading task run from the body", () => {
    expect(Note.parse(doc)).toEqual({
      tasks: [
        { text: "buy milk", checked: false },
        { text: "ship PR", checked: true },
      ],
      body: "## Notes\n\nSome *markdown*.",
    })
  })

  test("task lines after the body starts stay in the body", () => {
    const note = Note.parse("intro\n- [ ] not a top task\n")
    expect(note.tasks).toEqual([])
    expect(note.body).toBe("intro\n- [ ] not a top task")
  })

  test("accepts * markers and uppercase X", () => {
    expect(Note.parse("* [X] done\n").tasks).toEqual([{ text: "done", checked: true }])
  })
})

describe("addTasks", () => {
  test("appends unchecked items after the last top task, before the body", () => {
    expect(Note.addTasks(doc, ["call Sam"])).toBe(
      "- [ ] buy milk\n- [x] ship PR\n- [ ] call Sam\n\n## Notes\n\nSome *markdown*.\n",
    )
  })

  test("creates the checklist above an existing body", () => {
    expect(Note.addTasks("# Title\n", ["first"])).toBe("- [ ] first\n\n# Title\n")
  })

  test("strips list markers, joins lines, and skips blanks", () => {
    expect(Note.addTasks("", ["- [ ] already a task", "two\nlines", "   "])).toBe(
      "- [ ] already a task\n- [ ] two lines\n",
    )
  })
})

describe("edits by index", () => {
  test("setChecked toggles only the indexed task", () => {
    expect(Note.setChecked(doc, 0, true)).toBe("- [x] buy milk\n- [x] ship PR\n\n## Notes\n\nSome *markdown*.\n")
  })

  test("setChecked rejects a missing index", () => {
    expect(() => Note.setChecked(doc, 5, true)).toThrow(RangeError)
  })

  test("removeTask drops the line", () => {
    expect(Note.removeTask(doc, 0)).toBe("- [x] ship PR\n\n## Notes\n\nSome *markdown*.\n")
  })

  test("clearDone keeps open tasks and the body", () => {
    expect(Note.clearDone(doc)).toBe("- [ ] buy milk\n\n## Notes\n\nSome *markdown*.\n")
  })

  test("clearing every task leaves only the body", () => {
    expect(Note.clearDone("- [x] a\n\nbody\n")).toBe("body\n")
  })
})

test("setBody keeps the checklist", () => {
  expect(Note.setBody(doc, "new body")).toBe("- [ ] buy milk\n- [x] ship PR\n\nnew body\n")
})

test("findTasks matches substrings regardless of case", () => {
  expect(Note.findTasks(doc, "MILK")).toEqual([0])
  expect(Note.findTasks(doc, "zzz")).toEqual([])
  expect(Note.findTasks(doc, "  ")).toEqual([])
})

describe("selection helpers", () => {
  test("toItems turns each selected line into an item, dropping list markers and blanks", () => {
    expect(Note.toItems("1. Fix the parser\n\n- Add tests\n• Ship it\n")).toEqual(["Fix the parser", "Add tests", "Ship it"])
  })

  test("quote prefixes every line and keeps paragraph breaks", () => {
    expect(Note.quote("  first line\n\nsecond  \n")).toBe("> first line\n>\n> second")
  })

  test("appendBody adds a paragraph after the notes and keeps the checklist", () => {
    expect(Note.appendBody("- [ ] a\n\nold\n", "> new")).toBe("- [ ] a\n\nold\n\n> new\n")
    expect(Note.appendBody("- [ ] a\n", "first")).toBe("- [ ] a\n\nfirst\n")
  })
})
