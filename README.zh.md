# dsh-session-tools

[English](./README.md) | 中文

一个用于跨对话管理会话的 DSH Web 插件：

- `session_archive`：归档当前会话，或按精确 ID 归档另一个会话。
- `session_read`：按精确 ID 读取另一个会话经过 DSH 限长处理的不可信文本快照。
- 悬停已有内容的会话行时，右侧直接显示 **置顶/取消置顶** 和 **归档** 按钮。
- 每个已有内容的会话行都在“三个点”菜单中提供 **复制会话 ID**。
- 当前已打开会话的顶部提供 **ID** 按钮，可复制其精确 ID。

归档是持久但非破坏性的：会话会从普通列表中消失，但日志仍然保留。跨会话读取复用 DSH 的会话引用投影，因此不会暴露工具轨迹和模型推理，并继续遵守宿主配置的字节上限。

## 要求

- DSH `0.1.1-rc.2`
- Web profile（下面以 `web` 为例）

## 安装

```sh
dsh plugin --profile web add github:Unintendedz/dsh-session-tools#v0.2.0
```

随后重启正在运行的 DSH Web 服务。插件只会在服务启动时装载。

## 使用

悬停已有内容的会话行即可直接置顶或归档。置顶项会留在当前分组或单列表的顶部；再次点击 Pin 即可取消。Pin 偏好保存在当前浏览器中，不会写入会话日志。归档沿用 DSH 原生的非破坏性归档操作。

在会话行的“三个点”菜单中选择 **复制会话 ID**，也可以打开会话后点击顶部的 **ID**。把 ID 粘贴到另一个对话里，让它调用 `session_read` 读取内容，或调用 `session_archive` 归档该会话。调用 `session_archive` 时省略 `session_id`，就会归档当前对话自己。

插件插入复制项后会让原生菜单重新计算位置；即使来源会话靠近屏幕底部，四个菜单项也都会留在可视区域内。

## 更新

安装目标版本标签，然后重启 DSH Web：

```sh
dsh plugin --profile web add github:Unintendedz/dsh-session-tools#v0.2.0
```

## 卸载

```sh
dsh plugin --profile web remove dsh-session-tools
```

## 安全与数据行为

- `session_read` 使用 DSH 原生的会话引用解析器；返回文本受宿主限长，并明确作为不可信上下文处理。
- 跨会话快照不会包含工具轨迹和模型推理。
- `session_archive` 只隐藏会话并保留日志，不会删除对话数据。
- Pin 只保存会话 ID 和浏览器侧排序偏好；不会读取或复制会话内容。
- 工具参数只接受精确、非空的 `session_id`，未知字段会被拒绝。

## 开发

```sh
npm install
npm test
```

宿主入口是 `lib/index.js`，浏览器源码位于 `src/client.jsx`。`npm test` 会重新构建 `lib/client.js`，然后运行宿主与浏览器包测试。
