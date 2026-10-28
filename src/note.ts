// A note is one Markdown document. Its top section is the run of task lines at the very start
// ("- [ ] item"); everything after the first non-task line is free Markdown, the body.

export interface Task {
  readonly text: string
  readonly checked: boolean
}

export interface Note {
  readonly tasks: readonly Task[]
  readonly body: string
}

const TASK = /^\s*[-*+]\s+\[( |x|X)\]\s?(.*)$/

export function parse(doc: string): Note {
  const lines = doc.replace(/\r\n?/g, "\n").split("\n")
  const tasks: Task[] = []
  let i = 0
  for (; i < lines.length; i++) {
    const match = TASK.exec(lines[i]!)
    if (!match) break
    tasks.push({ checked: match[1] !== " ", text: match[2]!.trim() })
  }
  const rest = lines.slice(i)
  while (rest.length > 0 && rest[0]!.trim() === "") rest.shift()
  return { tasks, body: rest.join("\n").trimEnd() }
}

export function compose(note: Note): string {
  const tasks = note.tasks.map((task) => `- [${task.checked ? "x" : " "}] ${task.text}`).join("\n")
  const body = note.body.trimEnd()
  const doc = tasks && body ? `${tasks}\n\n${body}` : tasks || body
  return doc ? `${doc}\n` : ""
}

// Turns free text into one task line: drops a leading list or task marker, joins lines.
export function clean(item: string): string {
  return item
    .replace(/^\s*[-*+]\s+(\[( |x|X)\]\s*)?/, "")
    .replace(/\s*\n\s*/g, " ")
    .trim()
}

export function addTasks(doc: string, items: readonly string[]): string {
  const note = parse(doc)
  const added = items.map(clean).filter(Boolean).map((text) => ({ text, checked: false }))
  return compose({ ...note, tasks: [...note.tasks, ...added] })
}

export function setChecked(doc: string, index: number, checked: boolean): string {
  const note = parse(doc)
  if (!note.tasks[index]) throw new RangeError(`No task at index ${index}`)
  return compose({ ...note, tasks: note.tasks.map((task, i) => (i === index ? { ...task, checked } : task)) })
}

export function removeTask(doc: string, index: number): string {
  const note = parse(doc)
  if (!note.tasks[index]) throw new RangeError(`No task at index ${index}`)
  return compose({ ...note, tasks: note.tasks.filter((_, i) => i !== index) })
}

export function clearDone(doc: string): string {
  const note = parse(doc)
  return compose({ ...note, tasks: note.tasks.filter((task) => !task.checked) })
}

export function setBody(doc: string, body: string): string {
  return compose({ ...parse(doc), body })
}

// Indexes of tasks whose text contains the query, ignoring case.
export function findTasks(doc: string, query: string): number[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return parse(doc).tasks.flatMap((task, i) => (task.text.toLowerCase().includes(needle) ? [i] : []))
}
