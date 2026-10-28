import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"

// Places a selection is editable or belongs to the notepad itself; the bar stays hidden there.
const IGNORE = "input, textarea, select, [contenteditable=''], [contenteditable='true'], .notepad, .notepad-selection"

export interface Picked {
  readonly text: string
  readonly top: number
  readonly left: number
}

// The window's current text selection, when it is worth sending to the notepad.
export function readSelection(): Picked | undefined {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined
  const text = selection.toString()
  if (!text.trim()) return undefined
  const node = selection.anchorNode
  const element = node instanceof Element ? node : node?.parentElement
  if (element?.closest(IGNORE)) return undefined
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return undefined
  return { text, top: rect.top, left: rect.left + rect.width / 2 }
}

export function SelectionBar(props: {
  readonly listLabel: string
  readonly notesLabel: string
  readonly onList: (text: string) => void
  readonly onNotes: (text: string) => void
}) {
  const [picked, setPicked] = createSignal<Picked>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const refresh = () => {
    clearTimeout(timer)
    timer = setTimeout(() => setPicked(readSelection()), 120)
  }
  const hide = () => setPicked(undefined)

  onMount(() => {
    document.addEventListener("selectionchange", refresh)
    window.addEventListener("scroll", hide, true)
    window.addEventListener("resize", hide)
  })
  onCleanup(() => {
    clearTimeout(timer)
    document.removeEventListener("selectionchange", refresh)
    window.removeEventListener("scroll", hide, true)
    window.removeEventListener("resize", hide)
  })

  function send(action: (text: string) => void) {
    const current = picked()
    if (!current) return
    action(current.text)
    window.getSelection()?.removeAllRanges()
    hide()
  }

  return (
    <Show when={picked()}>
      {(at) => (
        <Portal>
          <div
            class="notepad-selection"
            classList={{ "is-below": at().top < 48 }}
            style={{
              top: `${at().top < 48 ? at().top + 28 : at().top - 40}px`,
              left: `${Math.min(Math.max(at().left, 110), window.innerWidth - 110)}px`,
            }}
            // Keep the selection alive while the user clicks a button.
            onMouseDown={(event) => event.preventDefault()}
          >
            <button type="button" onClick={() => send(props.onList)}>
              {props.listLabel}
            </button>
            <span class="notepad-selection-divider" />
            <button type="button" onClick={() => send(props.onNotes)}>
              {props.notesLabel}
            </button>
          </div>
        </Portal>
      )}
    </Show>
  )
}
