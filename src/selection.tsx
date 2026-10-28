import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"

// Places a selection is editable or belongs to the notepad itself; the bar stays hidden there.
const IGNORE = "input, textarea, select, [contenteditable=''], [contenteditable='true'], .notepad, .notepad-selection"

export interface Picked {
  readonly text: string
  readonly top: number
  readonly left: number
}

export interface SelectionAction {
  readonly id: string
  readonly label: string
  run(text: string): void
}

// The window's current text selection, when it is worth acting on.
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

export function SelectionBar(props: { readonly actions: readonly SelectionAction[] }) {
  const [picked, setPicked] = createSignal<Picked>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let frame: number | undefined

  const refresh = () => {
    clearTimeout(timer)
    timer = setTimeout(() => setPicked(readSelection()), 120)
  }
  // A streaming chat scrolls all the time. Follow the selection instead of hiding, so the bar never
  // vanishes under the pointer.
  const follow = () => {
    if (!picked() || frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      setPicked(readSelection())
    })
  }
  const hide = () => setPicked(undefined)

  onMount(() => {
    document.addEventListener("selectionchange", refresh)
    window.addEventListener("scroll", follow, true)
    window.addEventListener("resize", follow)
  })
  onCleanup(() => {
    clearTimeout(timer)
    if (frame !== undefined) cancelAnimationFrame(frame)
    document.removeEventListener("selectionchange", refresh)
    window.removeEventListener("scroll", follow, true)
    window.removeEventListener("resize", follow)
  })

  function send(action: SelectionAction) {
    const current = picked()
    if (!current) return
    window.getSelection()?.removeAllRanges()
    hide()
    action.run(current.text)
  }

  return (
    <Show when={picked()}>
      {(at) => (
        <Portal>
          <div
            class="notepad-selection"
            style={{
              top: `${at().top < 48 ? at().top + 28 : at().top - 40}px`,
              left: `${Math.min(Math.max(at().left, 160), window.innerWidth - 160)}px`,
            }}
            // Keep the selection alive while the user clicks a button.
            onMouseDown={(event) => event.preventDefault()}
          >
            <For each={props.actions}>
              {(action, i) => (
                <>
                  <Show when={i() > 0}>
                    <span class="notepad-selection-divider" />
                  </Show>
                  {/* Act on press, not release: a redraw between the two would drop the click. */}
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      if (event.button === 0) send(action)
                    }}
                    onClick={(event) => {
                      if (event.detail === 0) send(action)
                    }}
                  >
                    {action.label}
                  </button>
                </>
              )}
            </For>
          </div>
        </Portal>
      )}
    </Show>
  )
}
