# dsh-session-tools

English | [中文](./README.zh.md)

A DSH Web plugin for session management across conversations:

- `session_archive`: archive the calling session, or another session by exact ID.
- `session_read`: read DSH's bounded, untrusted text snapshot of another session by exact ID.
- **Pin / Unpin** and **Archive** buttons directly on populated session rows while hovered.
- `Copy session ID` in every populated session row's three-dot menu.
- `ID` header button: copy the exact ID of the currently open session.

Archiving is persistent but non-destructive: the session disappears from normal lists while its log remains stored. Cross-session reads reuse DSH's session-reference projection, so tool traces and model reasoning are not exposed and each reference keeps the host's configured byte limit.

## Requirements

- DSH `0.1.1-rc.2`
- A Web profile (`web` in the examples below)

## Install

```sh
dsh plugin --profile web add github:Unintendedz/dsh-session-tools#v0.2.0
```

Restart the running DSH Web service. Plugins are loaded when the service starts.

## Usage

Hover a populated session row to pin or archive it directly. Pinned sessions stay at the top of their current workspace group or flat list; click Pin again to unpin. Pin preferences are stored in the current browser and never enter session logs. Archive reuses DSH's native non-destructive archive action.

Use **Copy session ID** in a row's three-dot menu, or open a session and click **ID** in its header. Paste that ID into another conversation and ask it to call `session_read`, or ask it to call `session_archive` with that ID. Calling `session_archive` without `session_id` archives the current conversation.

The sidebar menu is repositioned after the copy action is injected, so all four rows remain inside the viewport even when the source conversation is near the bottom of the screen.

## Update

Install the desired tag, then restart DSH Web:

```sh
dsh plugin --profile web add github:Unintendedz/dsh-session-tools#v0.2.0
```

## Uninstall

```sh
dsh plugin --profile web remove dsh-session-tools
```

## Safety

- `session_read` uses DSH's native session-reference resolver. Returned text is bounded by the host and explicitly treated as untrusted context.
- Tool traces and model reasoning are excluded from cross-session snapshots.
- `session_archive` preserves the session log; it does not delete conversation data.
- Pin stores only session IDs and browser-side ordering preferences; it does not read or copy session content.
- Tool arguments accept only an exact, non-empty `session_id` and reject unknown fields.

## Development

```sh
npm install
npm test
```

The host entry point is `lib/index.js`; browser source lives in `src/client.jsx`. `npm test` rebuilds `lib/client.js` and runs the host and browser-bundle tests.
