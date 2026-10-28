import { createSignal, Show, type JSX } from "solid-js"
import { clean, type Task } from "./note"

// Only the checkbox ticks an item. Clicking its text edits it: Enter or clicking away saves, Escape cancels.
export function TaskRow(props: {
  readonly task: Task
  readonly editLabel: string
  readonly onCheck: (checked: boolean) => void
  readonly onRename: (text: string) => void
  readonly remove: JSX.Element
}) {
  const [editing, setEditing] = createSignal(false)
  let field: HTMLInputElement | undefined
  let cancelled = false

  function finish() {
    if (!editing()) return
    const text = field?.value ?? ""
    setEditing(false)
    if (cancelled) {
      cancelled = false
      return
    }
    if (clean(text) && clean(text) !== props.task.text) props.onRename(text)
  }

  return (
    <li class="notepad-task" classList={{ "is-done": props.task.checked, "is-editing": editing() }}>
      <input
        type="checkbox"
        checked={props.task.checked}
        aria-label={props.task.text}
        onChange={(event) => props.onCheck(event.currentTarget.checked)}
      />
      <Show
        when={editing()}
        fallback={
          <span
            class="notepad-task-text"
            role="button"
            tabIndex={0}
            title={props.editLabel}
            onClick={() => setEditing(true)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              setEditing(true)
            }}
          >
            {props.task.text}
          </span>
        }
      >
        <input
          ref={(el) => {
            field = el
            queueMicrotask(() => {
              el.focus()
              el.select()
            })
          }}
          class="notepad-task-edit"
          value={props.task.text}
          aria-label={props.editLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              finish()
            } else if (event.key === "Escape") {
              event.preventDefault()
              cancelled = true
              finish()
            }
          }}
          onBlur={finish}
        />
      </Show>
      {props.remove}
    </li>
  )
}
