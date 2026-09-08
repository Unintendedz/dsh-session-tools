# dsh-session-tools

[English](./README.md) | 中文

一个用于跨对话管理会话的 DSH Web 插件：

- `session_archive`：归档当前会话，或按精确 ID 归档另一个会话。
- `session_read`：按精确 ID 读取另一个会话经过 DSH 限长处理的不可信文本快照。
- `session_send`：向另一个普通会话发送消息，并取得一个持久的请求 ID。
- `session_wait`：等待或轮询某次 `session_send` 请求所对应的精确回复。
- 每个已有内容的会话行都在“三个点”菜单中提供 **复制会话 ID**。
- 当前已打开会话的顶部提供 **ID** 按钮，可复制其精确 ID。

`session_send` 会把一条持久的用户消息放入目标会话的下一个普通 turn。目标普通会话即使没有运行，DSH 原生 agent resolver 也可以先按它记录的上下文恢复，再进行投递。`session_wait` 用请求 ID 精确关联目标 turn，只返回其中对用户可见的 assistant 文本，不暴露推理或工具轨迹。

归档是持久但非破坏性的：会话会从普通列表中消失，但日志仍然保留。跨会话读取复用 DSH 的会话引用投影，并继续遵守宿主配置的字节上限。

## 要求

- DSH `0.1.1-rc.2` / `0.1.2-rc.1`
- Web profile（下面以 `web` 为例）

`0.2.2` 在 DSH `0.1.2-rc.1` 上读取实时事件快照，同时保留 DSH `0.1.1-rc.2` 的旧事件数组读取方式。每次轮询均能获取新提交的回复和终态，不会复用旧快照。

## 安装

```sh
dsh plugin --profile web add github:Unintendedz/dsh-session-tools#v0.2.2
```

随后重启正在运行的 DSH Web 服务。插件只会在服务启动时装载。

## 使用

在会话行的“三个点”菜单中选择 **复制会话 ID**，也可以打开会话后点击顶部的 **ID**。

要让另一个普通会话处理任务，先调用 `session_send`：

```json
{
  "session_id": "session-target-id",
  "message": "检查测试结果，并汇总所有失败项。"
}
```

工具会立即返回一个 `request_id`。把两个 ID 一起传给 `session_wait`：

```json
{
  "session_id": "session-target-id",
  "request_id": "request-id-from-session-send",
  "timeout_seconds": 60
}
```

`session_wait` 会返回 `completed`、`running` 或 `failed`。默认等待 60 秒，允许范围是 0–600 秒；传 `0` 表示只轮询。收到 `running` 后可以继续用相同的两个 ID 等待，因为等待操作不会重复发送消息，也不会取消目标会话。

你也可以把复制的 ID 粘贴到另一个对话里，让它调用 `session_read` 读取内容，或调用 `session_archive` 归档该会话。调用 `session_archive` 时省略 `session_id`，就会归档当前对话自己。

插件插入复制项后会让原生菜单重新计算位置；即使来源会话靠近屏幕底部，四个菜单项也都会留在可视区域内。

## 更新

安装目标版本标签，然后重启 DSH Web：

```sh
dsh plugin --profile web add github:Unintendedz/dsh-session-tools#v0.2.2
```

## 卸载

```sh
dsh plugin --profile web remove dsh-session-tools
```

## 安全与数据行为

- `session_read` 使用 DSH 原生的会话引用解析器；返回文本受宿主限长，并明确作为不可信上下文处理。
- `session_send` 和 `session_wait` 要求来源与目标是两个不同的普通会话。插件会拒绝向自己发送；子 agent 会话仍须使用 DSH 内置的 `send_message` 工具。
- 只有创建请求的来源会话可以等待该请求的结果。
- `session_wait` 只返回请求所对应精确 turn 中对用户可见的 assistant 文本；不包含推理和工具轨迹，返回的 UTF-8 文本最多为 65,536 字节。
- 等待超时只会返回 `running`，不会重发请求，也不会取消目标；跨会话等待环会被拒绝。
- `session_archive` 只隐藏会话并保留日志，不会删除对话数据。
- 工具参数要求精确、非空的 ID，未知字段会被拒绝。

## 开发

```sh
npm install
npm test
```

将 `DSH_NATIVE_ROOT` 指向已安装的 DSH 包根目录（包含其 `node_modules` 的目录），并设置全新临时 `DSH_HOME`，即可运行真实 Session 轮询回归测试。它使用合成数据，不启动 profile。

宿主入口是 `lib/index.js`，浏览器源码位于 `src/client.jsx`。`npm test` 会重新构建 `lib/client.js`，然后运行宿主与浏览器包测试。

## 请求生命周期与原生输出

`session_wait` 会将 inbox 领取记录关联到当前轮次。如果该轮次在用户消息写入前被取消、报错或阻止，等待会返回 `failed` 及相应原因。轮次仍在执行时，已领取的请求继续返回 `running`；请求所有权和排队请求的取消检查仍然有效。原生工具输出始终包含请求状态及终态原因，然后附上最多 64 KiB UTF-8 的已有回复文本，因此部分回复也会明确显示失败或运行中状态。
