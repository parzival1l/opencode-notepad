import { createSignal, For, onCleanup, Show } from "solid-js"
import {
  Command,
  ComposerPill,
  createKeyed,
  MenuItem,
  Panel,
  Plugin,
  Style,
  type PanelTab,
} from "@opencode/plugin/gui"
import * as Note from "./note"
import { Notepad, type State } from "./rpc"
import css from "./gui.css?inline"

export default Plugin.define({
  i18n: {
    en: {
      title: "Notepad",
      "command.toggle": "Toggle Notepad",
      "add.label": "Add a checklist item",
      "add.placeholder": "Add an item and press Enter",
      "remove": "Remove item",
      "clearDone": "Clear done",
      "notes": "Notes",
      "notes.empty": "No notes yet. Select Edit to write Markdown.",
      "edit": "Edit",
      "done": "Done",
      "openPreview": "Open in Markdown Preview",
      "openFile": "Open file in default app",
      "copyPath": "Copy file path",
      "pill": "{{count}} open",
      "pill.title": "Notepad checklist",
      "pill.open": "Open Notepad",
      "error": "Notepad: {{message}}",
    },
  },
  setup(ctx) {
    const ui = ctx.ui
    const key = `${ctx.id}:main`
    const [state, setState] = createSignal<State>()
    const note = () => Note.parse(state()?.doc ?? "")

    // One run per server client: load the note, then follow every change the server reports.
    createKeyed(
      () => ctx.servers.get("sidecar")?.client,
      (client) => {
        const pad = client.rpc(Notepad)
        void pad.read({}).then((value) => setState(value as State), fail)
        onCleanup(
          pad.events.on("updated", (event) => {
            setState(event.data as unknown as State)
          }),
        )
      },
    )

    function fail(error: unknown) {
      ctx.toast.show({ title: ctx.t("error", { message: error instanceof Error ? error.message : String(error) }) })
    }

    function call(run: (pad: ReturnType<typeof ctx.client.rpc<typeof Notepad>>) => Promise<unknown>) {
      run(ctx.client.rpc(Notepad)).then((value) => setState(value as State), fail)
    }

    function toggle() {
      const session = ctx.sessions.current()
      if (session) ctx.layout.toggle(key, session)
    }

    const tab: PanelTab = {
      id: "main",
      get title() {
        return ctx.t("title")
      },
      closable: "compact",
      fallback: true,
    }

    ctx.add(Style, css)

    ctx.add(Panel, {
      id: "main",
      region: "side",
      mobile: {
        get title() {
          return ctx.t("title")
        },
        order: 60,
        kind: "menu",
        icon: "checklist",
      },
      list: (input) => (input.open.includes("main") ? [tab] : []),
      enter: () => document.querySelector<HTMLInputElement>(".notepad-add input")?.focus(),
      render: () => <NotepadView />,
    })

    ctx.add(
      Command,
      (): Command => ({
        id: "toggle",
        title: ctx.t("command.toggle"),
        keywords: "notepad todo checklist notes markdown",
        bind: "mod+alt+n",
        enabled: !!ctx.sessions.current(),
        run: toggle,
      }),
    )

    ctx.add(MenuItem, (): MenuItem => {
      const session = ctx.sessions.current()
      return {
        menu: "session.panel",
        id: "open",
        title: ctx.t("title"),
        icon: "checklist",
        keybind: `${ctx.id}.toggle`,
        opened: !!session && ctx.layout.state(key, session) !== "closed",
        run: () => {
          if (session) ctx.layout.open(key, session)
        },
      }
    })

    ctx.add(ComposerPill, {
      id: "open",
      show: (input) => {
        const open = note().tasks.filter((task) => !task.checked)
        if (open.length === 0) return undefined
        return {
          icon: "checklist",
          label: ctx.t("pill", { count: open.length }),
          title: ctx.t("pill.title"),
          rows: [
            ...open.slice(0, 8).map((task, i) => ({ id: `task-${i}`, label: task.text })),
            {
              id: "open",
              label: ctx.t("pill.open"),
              icon: "checklist" as const,
              run: () => ctx.layout.open(key, input.session),
            },
          ],
        }
      },
    })

    function NotepadView() {
      const [draft, setDraft] = createSignal("")
      const [editing, setEditing] = createSignal(false)
      const [body, setBody] = createSignal("")
      let timer: ReturnType<typeof setTimeout> | undefined

      function add(value: string) {
        if (!Note.clean(value)) return
        setDraft("")
        call((pad) => pad.add({ items: [value] }))
      }

      function startEdit() {
        setBody(note().body)
        setEditing(true)
      }

      function saveBody() {
        clearTimeout(timer)
        if (body() !== note().body) call((pad) => pad.setBody({ body: body() }))
      }

      function finishEdit() {
        saveBody()
        setEditing(false)
      }

      onCleanup(() => {
        if (editing()) saveBody()
      })

      const path = () => state()?.path ?? ""

      return (
        <div class="notepad">
          <div class="notepad-toolbar">
            <span class="notepad-path" title={path()}>
              {path().split("/").pop()}
            </span>
            <ui.Tooltip value={ctx.t("openPreview")}>
              <ui.IconButton
                icon="square-arrow-top-right"
                label={ctx.t("openPreview")}
                variant="ghost"
                size="small"
                onClick={() => ctx.system.openExternal(`md-preview://file${encodeURI(path())}`)}
              />
            </ui.Tooltip>
            <ui.Menu
              label={ctx.t("title")}
              icon="outline-dots"
              placement="bottom-end"
              items={[
                { label: ctx.t("openFile"), icon: "open-file", onSelect: () => ctx.system.openExternal(`file://${encodeURI(path())}`) },
                { label: ctx.t("copyPath"), icon: "copy", onSelect: () => void ctx.system.copy(path()) },
              ]}
            />
          </div>

          <div class="notepad-add">
            <ui.TextInput
              label={ctx.t("add.label")}
              placeholder={ctx.t("add.placeholder")}
              value={draft()}
              onInput={setDraft}
              onSubmit={add}
            />
          </div>

          <ul class="notepad-tasks">
            <For each={note().tasks}>
              {(task, i) => (
                <li class="notepad-task" classList={{ "is-done": task.checked }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={task.checked}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked
                        call((pad) => pad.check({ index: i(), checked }))
                      }}
                    />
                    <span>{task.text}</span>
                  </label>
                  <ui.IconButton
                    icon="xmark-small"
                    label={ctx.t("remove")}
                    variant="ghost-muted"
                    size="small"
                    class="notepad-remove"
                    onClick={() => call((pad) => pad.remove({ index: i() }))}
                  />
                </li>
              )}
            </For>
          </ul>
          <Show when={note().tasks.some((task) => task.checked)}>
            <div class="notepad-clear">
              <ui.Button variant="ghost-muted" size="small" onClick={() => call((pad) => pad.clearDone({}))}>
                {ctx.t("clearDone")}
              </ui.Button>
            </div>
          </Show>

          <div class="notepad-notes-header">
            <span>{ctx.t("notes")}</span>
            <ui.Button variant="ghost" size="small" icon={editing() ? "check" : "pencil-line"} onClick={() => (editing() ? finishEdit() : startEdit())}>
              {editing() ? ctx.t("done") : ctx.t("edit")}
            </ui.Button>
          </div>
          <Show
            when={editing()}
            fallback={
              <Show when={note().body} fallback={<p class="notepad-empty">{ctx.t("notes.empty")}</p>}>
                <div class="notepad-body" onDblClick={startEdit}>
                  <ui.Markdown text={note().body} />
                </div>
              </Show>
            }
          >
            <textarea
              class="notepad-editor"
              value={body()}
              spellcheck={true}
              autofocus
              onInput={(event) => {
                setBody(event.currentTarget.value)
                clearTimeout(timer)
                timer = setTimeout(saveBody, 600)
              }}
              onBlur={saveBody}
              onKeyDown={(event) => {
                if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
                  event.preventDefault()
                  finishEdit()
                }
              }}
            />
          </Show>
        </div>
      )
    }
  },
})
