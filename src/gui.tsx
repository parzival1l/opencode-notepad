import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import {
  Command,
  ComposerPill,
  createKeyed,
  MenuItem,
  Panel,
  Plugin,
  Slot,
  Style,
  type MountedSession,
  type PanelTab,
} from "@opencode/plugin/gui"
import * as Note from "./note"
import { Notepad, type State } from "./rpc"
import { readSelection, SelectionBar, type SelectionAction } from "./selection"
import css from "./gui.css?inline"

export default Plugin.define({
  i18n: {
    en: {
      title: "Notepad",
      "command.toggle": "Toggle Notepad",
      "add.label": "Add a checklist item",
      "add.placeholder": "Add an item and press Enter",
      remove: "Remove item",
      clearDone: "Clear done",
      notes: "Notes",
      "notes.empty": "No notes yet. Select Edit to write Markdown.",
      edit: "Edit",
      done: "Done",
      openPreview: "Open in Markdown Preview",
      openFile: "Open file in default app",
      copyPath: "Copy file path",
      pill: "{{count}} open",
      "pill.title": "Notepad checklist",
      "pill.open": "Open Notepad",
      error: "Notepad: {{message}}",
      "selection.quote": "Quote",
      "selection.list": "Add to list",
      "selection.notes": "Add to notes",
      "command.selectionList": "Add selection to Notepad list",
      "command.selectionNotes": "Add selection to Notepad notes",
      "added.list": "Added {{count}} item(s) to the Notepad list",
      "added.notes": "Added the selection to Notepad notes",
      "quote.source": "Conversation",
      "quote.unavailable": "This chat can't take a quote right now",
      "noChat": "Open a chat first",
    },
  },
  setup(ctx) {
    const ui = ctx.ui
    const key = `${ctx.id}:main`

    // Notes by the session ID the window asked for. A subagent's entry holds its parent chat's note.
    const [docs, setDocs] = createStore<Record<string, State>>({})
    const loading = new Set<string>()

    const noteOf = (sessionID: string | undefined) => Note.parse((sessionID && docs[sessionID]?.doc) || "")

    function put(requested: string, state: State) {
      setDocs(requested, state)
    }

    function load(sessionID: string) {
      if (docs[sessionID] || loading.has(sessionID)) return
      loading.add(sessionID)
      ctx.client
        .rpc(Notepad)
        .read({ sessionID })
        .then((value) => put(sessionID, value as State), fail)
        .finally(() => loading.delete(sessionID))
    }

    // One run per server client: reload what this window shows, then follow every change the server reports.
    createKeyed(
      () => ctx.servers.get("sidecar")?.client,
      (client) => {
        const pad = client.rpc(Notepad)
        for (const sessionID of Object.keys(docs)) {
          void pad.read({ sessionID }).then((value) => put(sessionID, value as State), fail)
        }
        onCleanup(
          pad.events.on("updated", (event) => {
            const state = event.data as unknown as State
            for (const [requested, current] of Object.entries(docs)) {
              if (current.sessionID === state.sessionID) put(requested, state)
            }
            if (!docs[state.sessionID]) put(state.sessionID, state)
          }),
        )
      },
    )

    function fail(error: unknown) {
      ctx.toast.show({
        title: ctx.t("error", { message: error instanceof Error ? error.message : String(error) }),
        variant: "error",
      })
    }

    type Pad = ReturnType<typeof ctx.client.rpc<typeof Notepad>>

    function call(sessionID: string, run: (pad: Pad) => Promise<unknown>, done?: () => void) {
      run(ctx.client.rpc(Notepad)).then((value) => {
        put(sessionID, value as State)
        done?.()
      }, fail)
    }

    function currentChat(): MountedSession | undefined {
      const session = ctx.sessions.current()
      if (!session) ctx.toast.show({ title: ctx.t("noChat") })
      return session
    }

    function selectionToList(text: string) {
      const session = currentChat()
      const items = Note.toItems(text)
      if (!session || items.length === 0) return
      call(
        session.id,
        (pad) => pad.add({ sessionID: session.id, items }),
        () => ctx.toast.show({ title: ctx.t("added.list", { count: items.length }), variant: "success", duration: 2000 }),
      )
    }

    function selectionToNotes(text: string) {
      const session = currentChat()
      if (!session) return
      call(
        session.id,
        (pad) => pad.appendNote({ sessionID: session.id, markdown: Note.quote(text) }),
        () => ctx.toast.show({ title: ctx.t("added.notes"), variant: "success", duration: 2000 }),
      )
    }

    // Attaches the selection to the next prompt as a quote and opens its comment box: one step.
    function selectionToQuote(text: string) {
      const composer = ctx.screen.current()?.composer
      if (!composer?.quotable()) {
        ctx.toast.show({ title: ctx.t("quote.unavailable") })
        return
      }
      const commentID = crypto.randomUUID()
      composer.attach({
        type: "quote",
        commentID,
        text: text.trim(),
        source: { label: ctx.t("quote.source"), icon: "speech-bubble", subject: "this conversation" },
      })
      composer.focus(commentID)
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
      render: (props) => <NotepadView session={props.session} />,
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

    // Highlight text anywhere in the window (outside inputs) to get a floating bar: Quote, Add to list, Add to notes.
    const actions: SelectionAction[] = [
      {
        id: "quote",
        get label() {
          return ctx.t("selection.quote")
        },
        run: selectionToQuote,
      },
      {
        id: "list",
        get label() {
          return ctx.t("selection.list")
        },
        run: selectionToList,
      },
      {
        id: "notes",
        get label() {
          return ctx.t("selection.notes")
        },
        run: selectionToNotes,
      },
    ]
    ctx.add(Slot, { at: "window.bottom", render: () => <SelectionBar actions={actions} /> })

    for (const [id, bind, send] of [
      ["selection-list", "mod+alt+l", selectionToList],
      ["selection-notes", "mod+alt+k", selectionToNotes],
    ] as const) {
      ctx.add(
        Command,
        (): Command => ({
          id,
          title: ctx.t(id === "selection-list" ? "command.selectionList" : "command.selectionNotes"),
          keywords: "notepad selection highlight quote",
          bind,
          run: () => {
            const picked = readSelection()
            if (!picked) return false
            window.getSelection()?.removeAllRanges()
            send(picked.text)
          },
        }),
      )
    }

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

    // Load the routed chat's note so its pill shows without opening the panel.
    createKeyed(
      () => ctx.sessions.current()?.id,
      (sessionID) => load(sessionID),
    )

    ctx.add(ComposerPill, {
      id: "open",
      show: (input) => {
        const open = noteOf(input.session.id).tasks.filter((task) => !task.checked)
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

    function NotepadView(props: { readonly session: MountedSession }) {
      const [draft, setDraft] = createSignal("")
      const [editing, setEditing] = createSignal(false)
      const [body, setBody] = createSignal("")
      let timer: ReturnType<typeof setTimeout> | undefined

      const id = () => props.session.id
      const note = () => noteOf(id())
      const path = () => docs[id()]?.path ?? ""

      createEffect(() => load(id()))

      // Switching chats while editing saves the old chat's draft first.
      createKeyed(id, (sessionID) => {
        onCleanup(() => {
          if (editing()) save(sessionID)
          setEditing(false)
        })
      })

      function add(value: string) {
        if (!Note.clean(value)) return
        setDraft("")
        const sessionID = id()
        call(sessionID, (pad) => pad.add({ sessionID, items: [value] }))
      }

      function startEdit() {
        setBody(note().body)
        setEditing(true)
      }

      function save(sessionID = id()) {
        clearTimeout(timer)
        if (body() !== noteOf(sessionID).body) call(sessionID, (pad) => pad.setBody({ sessionID, body: body() }))
      }

      function finishEdit() {
        save()
        setEditing(false)
      }

      return (
        <div class="notepad">
          <div class="notepad-toolbar">
            <span class="notepad-path" title={path()}>
              {ctx.t("title")}
            </span>
            <ui.Tooltip value={ctx.t("openPreview")}>
              <ui.IconButton
                icon="square-arrow-top-right"
                label={ctx.t("openPreview")}
                variant="ghost"
                size="small"
                disabled={!path()}
                onClick={() => ctx.system.openExternal(`md-preview://file${encodeURI(path())}`)}
              />
            </ui.Tooltip>
            <ui.Menu
              label={ctx.t("title")}
              icon="outline-dots"
              placement="bottom-end"
              items={[
                {
                  label: ctx.t("openFile"),
                  icon: "open-file",
                  onSelect: () => ctx.system.openExternal(`file://${encodeURI(path())}`),
                },
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
                        const sessionID = id()
                        call(sessionID, (pad) => pad.check({ sessionID, index: i(), checked }))
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
                    onClick={() => {
                      const sessionID = id()
                      call(sessionID, (pad) => pad.remove({ sessionID, index: i() }))
                    }}
                  />
                </li>
              )}
            </For>
          </ul>
          <Show when={note().tasks.some((task) => task.checked)}>
            <div class="notepad-clear">
              <ui.Button
                variant="ghost-muted"
                size="small"
                onClick={() => {
                  const sessionID = id()
                  call(sessionID, (pad) => pad.clearDone({ sessionID }))
                }}
              >
                {ctx.t("clearDone")}
              </ui.Button>
            </div>
          </Show>

          <div class="notepad-notes-header">
            <span>{ctx.t("notes")}</span>
            <ui.Button
              variant="ghost"
              size="small"
              icon={editing() ? "check" : "pencil-line"}
              onClick={() => (editing() ? finishEdit() : startEdit())}
            >
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
                timer = setTimeout(save, 600)
              }}
              onBlur={() => save()}
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
