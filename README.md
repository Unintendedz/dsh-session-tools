# dsh-session-tools

English | [中文](./README.zh.md)

A DSH Web plugin for session management across conversations:

- `session_archive`: archive the calling session, or another session by exact ID.
- `session_read`: read DSH's bounded, untrusted text snapshot of another session by exact ID.
- `session_send`: send a message to another ordinary session and receive a durable request ID.
- `session_wait`: wait for, or poll, the exact reply associated with a `session_send` request.
- `Copy session ID` in every populated session row's three-dot menu.
- `ID` header button: copy the exact ID of the currently open session.

`session_send` places one durable user message in the target's next ordinary turn. DSH's native agent resolver can resume an inactive ordinary session with its recorded context before delivery. `session_wait` correlates the request ID with that exact target turn and returns only its visible assistant text; it does not expose reasoning or tool traces.

Archiving is persistent but non-destructive: the session disappears from normal lists while its log remains stored. Cross-session reads reuse DSH's session-reference projection, so each reference keeps the host's configured byte limit.

## Requirements

- DSH `0.1.1-rc.2` / `0.1.2-rc.1`
- A Web profile (`web` in the examples below)

Version `0.2.2` reads live event snapshots on DSH `0.1.2-rc.1` and retains the legacy event-array path for DSH `0.1.1-rc.2`. Polling sees newly committed replies and terminal status without reusing an older snapshot.

## Install

```sh
dsh plugin --profile web add github:Unintendedz/dsh-session-tools#v0.2.2
```

Restart the running DSH Web service. Plugins are loaded when the service starts.

## Usage

Use **Copy session ID** in a row's three-dot menu, or open a session and click **ID** in its header.

To ask another ordinary session to do work, call `session_send`:

```json
{
  "session_id": "session-target-id",
  "message": "Check the test results and summarize any failures."
}
```

The tool returns immediately with a `request_id`. Pass both IDs to `session_wait`:

```json
{
  "session_id": "session-target-id",
  "request_id": "request-id-from-session-send",
  "timeout_seconds": 60
}
```

`session_wait` returns `completed`, `running`, or `failed`. Its wait defaults to 60 seconds and accepts 0–600 seconds; use `0` to poll. A `running` result is safe to wait on again with the same IDs because waiting never resends the message or cancels the target.

You can also paste a copied ID into another conversation and ask it to call `session_read`, or ask it to call `session_archive` with that ID. Calling `session_archive` without `session_id` archives the current conversation.

The sidebar menu is repositioned after the copy action is injected, so all four rows remain inside the viewport even when the source conversation is near the bottom of the screen.

## Update

Install the desired tag, then restart DSH Web:

```sh
dsh plugin --profile web add github:Unintendedz/dsh-session-tools#v0.2.2
```

## Uninstall

```sh
dsh plugin --profile web remove dsh-session-tools
```

## Safety

- `session_read` uses DSH's native session-reference resolver. Returned text is bounded by the host and explicitly treated as untrusted context.
- `session_send` and `session_wait` require two different ordinary sessions. Self-targeting is rejected; subagent sessions must use DSH's built-in `send_message` tool.
- Only the session that created a request may wait for its result.
- `session_wait` returns only visible assistant text from the request's exact turn. Reasoning and tool traces are excluded, and returned UTF-8 text is bounded to 65,536 bytes.
- A wait timeout returns `running`; it does not resend the request or cancel the target. Cross-session wait cycles are rejected.
- `session_archive` preserves the session log; it does not delete conversation data.
- Tool arguments require exact, non-empty IDs and reject unknown fields.

## Development

```sh
npm install
npm test
```

Set `DSH_NATIVE_ROOT` to the installed DSH package root containing its `node_modules`, and use a fresh temporary `DSH_HOME`, to include the native Session polling regression. It uses synthetic data and does not boot a profile.

The host entry point is `lib/index.js`; browser source lives in `src/client.jsx`. `npm test` rebuilds `lib/client.js` and runs the host and browser-bundle tests.

## Request lifecycle and native output

`session_wait` associates an inbox claim with its active turn. If that turn is aborted, errors, or is blocked before the user message is recorded, waiting returns `failed` with that reason. A claim whose turn is still active remains `running`; ownership and queued-request cancellation checks still apply. Native tool output always includes the request status and any terminal reason, followed by the available reply text bounded to 64 KiB of UTF-8. A partial reply therefore remains visibly failed or running.
