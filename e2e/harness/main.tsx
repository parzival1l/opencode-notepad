import { Index } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import { TaskRow } from "../../src/task-row"
import { SelectionBar, type SelectionAction } from "../../src/selection"
import css from "../../src/gui.css?inline"

declare global {
  interface Window {
    sent: string[]
    startStream(): void
    stopStream(): void
  }
}

window.sent = []

const style = document.createElement("style")
style.textContent = css
document.head.append(style)

const actions: SelectionAction[] = ["quote", "list", "notes"].map((id) => ({
  id,
  label: { quote: "Quote", list: "Add to list", notes: "Add to notes" }[id]!,
  run: (text) => window.sent.push(`${id}:${text}`),
}))

render(() => <SelectionBar actions={actions} />, document.getElementById("app")!)

// The real checklist row, wired to a local list instead of the server.
const [tasks, setTasks] = createStore<{ text: string; checked: boolean }[]>([
  { text: "Cancel", checked: false },
  { text: "Download", checked: false },
])
render(
  () => (
    <Index each={tasks}>
      {(task, i) => (
        <TaskRow
          task={task()}
          editLabel="Click to edit"
          onCheck={(checked) => {
            window.sent.push(`check:${i}:${checked}`)
            setTasks(i, "checked", checked)
          }}
          onRename={(text) => {
            window.sent.push(`rename:${i}:${text}`)
            setTasks(i, "text", text)
          }}
          remove={<button type="button">x</button>}
        />
      )}
    </Index>
  ),
  document.getElementById("tasks")!,
)

// Mimics a chat that is streaming: output grows and its box scrolls every 30 ms.
let timer: ReturnType<typeof setInterval> | undefined
window.startStream = () => {
  const box = document.getElementById("stream")!
  timer = setInterval(() => {
    const line = document.createElement("div")
    line.textContent = `streamed ${Date.now()}`
    box.append(line)
    box.scrollTop = box.scrollHeight
  }, 30)
}
window.stopStream = () => clearInterval(timer)
