import { useEffect, useRef, useState } from 'react'

const NS = 'dsh-session-tools'
const STYLE_ID = 'dsh-session-tools-style'
const FLAT_SESSION_ORDER_KEY = '__flat_session_order__'
const PINNED_STORAGE_KEY = 'dsh-session-tools.pinned-session-ids.v1'

const zh = {
  'copy.aria': '复制对话 ID：{id}',
  'copy.title': '复制对话 ID',
  'copy.menu': '复制会话 ID',
  'copy.copied': '已复制对话 ID',
  'copy.failed': '复制失败',
  'pin.aria': '置顶会话“{title}”',
  'unpin.aria': '取消置顶会话“{title}”',
  'archive.aria': '归档会话“{title}”',
  'archive.failed': '归档失败',
}

const en = {
  'copy.aria': 'Copy session ID: {id}',
  'copy.title': 'Copy session ID',
  'copy.menu': 'Copy session ID',
  'copy.copied': 'Session ID copied',
  'copy.failed': 'Copy failed',
  'pin.aria': 'Pin session “{title}”',
  'unpin.aria': 'Unpin session “{title}”',
  'archive.aria': 'Archive session “{title}”',
  'archive.failed': 'Archive failed',
}

export const inject = ['slots', 'locale']

export async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
  const exec = typeof document.execCommand === 'function'
    ? document.execCommand.bind(document)
    : undefined
  if (exec === undefined) return false
  const element = document.createElement('textarea')
  element.value = text
  element.setAttribute('readonly', '')
  element.style.position = 'fixed'
  element.style.left = '-9999px'
  document.body.appendChild(element)
  element.select()
  try {
    return exec('copy')
  } catch {
    return false
  } finally {
    element.remove()
  }
}

export function pinnedSessionOrder(sessionIds, pinnedIds) {
  const sessions = new Set(sessionIds)
  const pinned = pinnedIds.filter((id, index) => sessions.has(id) && pinnedIds.indexOf(id) === index)
  const pinnedSet = new Set(pinned)
  return [...pinned, ...sessionIds.filter(id => !pinnedSet.has(id))]
}

export function readPinnedSessionIds(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(PINNED_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id, index) => (
      typeof id === 'string' && id.trim() !== '' && parsed.indexOf(id) === index
    ))
  } catch {
    return []
  }
}

export function writePinnedSessionIds(storage, pinnedIds) {
  try {
    storage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinnedIds))
    return true
  } catch {
    return false
  }
}

export function syncPinnedSessionOrder(context, pinnedIds) {
  if (typeof context?.setSessionOrder !== 'function' || typeof context?.accountKey !== 'string') return false
  const current = context.sessionOrderByAccount?.[context.accountKey]
  if (!Array.isArray(current)) return false
  const next = pinnedSessionOrder(current, pinnedIds)
  if (next.length === current.length && next.every((id, index) => id === current[index])) return false
  context.setSessionOrder(context.accountKey, next)
  return true
}

/** Resolve the native Session row actions and ordering owner behind a sidebar row. */
export function sessionContextFromElement(element) {
  const key = Object.getOwnPropertyNames(element).find(name => name.startsWith('__reactFiber$'))
  let fiber = key === undefined ? undefined : element[key]
  let sessionId
  let title
  let archiveSession
  let sessionOrderByAccount
  let setSessionOrder
  let workspaces
  for (let depth = 0; fiber !== undefined && fiber !== null && depth < 64; depth += 1) {
    const props = fiber.memoizedProps
    const candidateId = props?.node?.id
    if (sessionId === undefined && typeof candidateId === 'string' && candidateId.trim() !== '') {
      sessionId = candidateId
      title = props.node.title
    }
    if (archiveSession === undefined && typeof props?.archiveSession === 'function') {
      archiveSession = props.archiveSession
    }
    if (setSessionOrder === undefined
      && typeof props?.setSessionOrder === 'function'
      && typeof props?.sessionOrderByAccount === 'object') {
      sessionOrderByAccount = props.sessionOrderByAccount
      setSessionOrder = props.setSessionOrder
      workspaces = props.workspaces
    }
    fiber = fiber.return
  }
  if (sessionId === undefined) return undefined
  const workspace = Array.isArray(workspaces)
    ? workspaces.find(item => item?.sessionIds?.includes(sessionId))
    : undefined
  return {
    sessionId,
    title: typeof title === 'string' ? title : sessionId,
    archiveSession,
    sessionOrderByAccount,
    setSessionOrder,
    workspaces,
    accountKey: Array.isArray(workspaces) ? (workspace?.workspaceId ?? '') : FLAT_SESSION_ORDER_KEY,
  }
}

/** Resolve the SessionNode owned by the clicked sidebar row. */
export function sessionIdFromElement(element) {
  return sessionContextFromElement(element)?.sessionId
}

function nearestMenu(anchor) {
  const anchorRect = anchor.getBoundingClientRect()
  return Array.from(document.querySelectorAll('[role="menu"]'))
    .filter((menu) => {
      const rect = menu.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && menu.querySelector('[role="menuitem"]') !== null
    })
    .sort((left, right) => {
      const a = left.getBoundingClientRect()
      const b = right.getBoundingClientRect()
      const aDistance = Math.abs(a.left - anchorRect.left) + Math.abs(a.top - anchorRect.bottom)
      const bDistance = Math.abs(b.left - anchorRect.left) + Math.abs(b.top - anchorRect.bottom)
      return aDistance - bDistance
    })[0]
}

function svgElement(name, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  return element
}

function menuIcon(copied) {
  const svg = svgElement('svg', {
    width: '16', height: '16', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
  })
  if (copied) {
    svg.appendChild(svgElement('path', {
      d: 'm3.5 8.2 2.8 2.8 6.2-6.2',
      stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }))
    return svg
  }
  svg.appendChild(svgElement('rect', {
    x: '5.1', y: '5.1', width: '7.4', height: '7.4', rx: '1.4',
    stroke: 'currentColor', 'stroke-width': '1.5',
  }))
  svg.appendChild(svgElement('path', {
    d: 'M10.7 5.1V4.2A1.7 1.7 0 0 0 9 2.5H4.2a1.7 1.7 0 0 0-1.7 1.7V9a1.7 1.7 0 0 0 1.7 1.7h.9',
    stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }))
  return svg
}

function quickActionIcon(kind, active = false) {
  const svg = svgElement('svg', {
    width: '16', height: '16', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
  })
  if (kind === 'pin') {
    svg.appendChild(svgElement('path', {
      d: 'M5.2 2.5h5.6l-.9 3.2 1.8 1.8v1H8.8V13L8 14l-.8-1V8.5H4.3v-1l1.8-1.8-.9-3.2Z',
      fill: active ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': '1.3',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }))
    return svg
  }
  svg.appendChild(svgElement('path', {
    d: 'M2.5 4.5h11M3.5 4.5l.8-2h7.4l.8 2v7.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V4.5ZM6 7.5h4',
    stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }))
  return svg
}

export function mountSessionQuickActions(row, context, pinnedIds, t, onTogglePin) {
  if (typeof context?.archiveSession !== 'function') return false
  const nativeButton = row.querySelector('button')
  if (nativeButton === null) return false
  let actionHost = nativeButton.parentElement
  while (actionHost !== null && actionHost.parentElement !== row) actionHost = actionHost.parentElement
  if (actionHost === null) return false

  const pinned = pinnedIds.includes(context.sessionId)
  const existing = actionHost.querySelector('[data-dsh-session-tools-actions]')
  if (existing !== null) {
    const pin = existing.children[0]
    const archive = existing.children[1]
    const pinChanged = pin.getAttribute('aria-pressed') !== String(pinned)
    pin.setAttribute('aria-pressed', String(pinned))
    row.dataset.dshSessionToolsPinned = String(pinned)
    const pinLabel = t(pinned ? 'unpin.aria' : 'pin.aria', { title: context.title })
    pin.setAttribute('aria-label', pinLabel)
    pin.setAttribute('title', pinLabel)
    if (pinChanged) pin.replaceChildren(quickActionIcon('pin', pinned))
    const archiveLabel = t('archive.aria', { title: context.title })
    archive.setAttribute('aria-label', archiveLabel)
    if (archive.dataset.status !== 'failed') archive.setAttribute('title', archiveLabel)
    return true
  }

  row.classList.add('dsh-session-tools-row')
  row.dataset.dshSessionToolsPinned = String(pinned)
  actionHost.classList.add('dsh-session-tools-row-actions-host')
  actionHost.previousElementSibling?.classList.add('dsh-session-tools-row-time')

  const actions = document.createElement('span')
  actions.classList.add('dsh-session-tools-row-actions')
  actions.setAttribute('data-dsh-session-tools-actions', context.sessionId)

  const pin = document.createElement('button')
  pin.setAttribute('type', 'button')
  pin.classList.add('dsh-session-tools-row-action')
  pin.setAttribute('data-dsh-session-tools-action', 'pin')
  pin.setAttribute('aria-pressed', String(pinned))
  const pinLabel = t(pinned ? 'unpin.aria' : 'pin.aria', { title: context.title })
  pin.setAttribute('aria-label', pinLabel)
  pin.setAttribute('title', pinLabel)
  pin.appendChild(quickActionIcon('pin', pinned))
  pin.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onTogglePin(context.sessionId)
  })

  const archive = document.createElement('button')
  archive.setAttribute('type', 'button')
  archive.classList.add('dsh-session-tools-row-action')
  archive.setAttribute('data-dsh-session-tools-action', 'archive')
  const archiveLabel = t('archive.aria', { title: context.title })
  archive.setAttribute('aria-label', archiveLabel)
  archive.setAttribute('title', archiveLabel)
  archive.appendChild(quickActionIcon('archive'))
  archive.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (archive.disabled) return
    archive.disabled = true
    try {
      await context.archiveSession(context.sessionId)
    } catch (reason) {
      archive.disabled = false
      archive.dataset.status = 'failed'
      archive.setAttribute('title', t('archive.failed'))
      console.warn('session archive rejected:', reason)
    }
  })

  actions.append(pin, archive)
  actionHost.insertBefore(actions, actionHost.firstChild)
  return true
}

function mountSessionMenuItem(anchor, sessionId, t) {
  const menu = nearestMenu(anchor)
  if (menu === undefined) return false
  if (menu.querySelector('[data-dsh-session-tools-copy]') !== null) return true
  const template = menu.querySelector('[role="menuitem"]')
  if (template === null) return false

  const item = template.cloneNode(false)
  item.classList.add('dsh-session-tools-menu-item')
  item.dataset.dshSessionToolsCopy = sessionId
  const icon = document.createElement('span')
  icon.className = template.firstElementChild?.className ?? ''
  icon.appendChild(menuIcon(false))
  const label = document.createElement('span')
  label.className = template.lastElementChild?.className ?? ''
  label.textContent = t('copy.menu')
  label.setAttribute('aria-live', 'polite')
  item.append(icon, label)

  item.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (item.dataset.copying === 'true') return
    item.dataset.copying = 'true'
    const accepted = await writeClipboard(sessionId)
    delete item.dataset.copying
    item.dataset.status = accepted ? 'copied' : 'failed'
    icon.replaceChildren(menuIcon(accepted))
    label.textContent = t(accepted ? 'copy.copied' : 'copy.failed')
    if (accepted) {
      setTimeout(() => {
        if (item.isConnected && anchor.isConnected) anchor.click()
      }, 500)
      return
    }
    setTimeout(() => {
      if (!item.isConnected) return
      delete item.dataset.status
      icon.replaceChildren(menuIcon(false))
      label.textContent = t('copy.menu')
    }, 1600)
  })

  menu.insertBefore(item, template.nextSibling)
  window.dispatchEvent(new Event('resize'))
  return true
}

function installSessionMenuCopy(t) {
  const onClick = (event) => {
    const target = event.target
    if (typeof target?.closest !== 'function') return
    const button = target.closest('button')
    if (button === null || button.closest('[role="treeitem"]') === null) return
    const sessionId = sessionIdFromElement(button)
    if (sessionId === undefined) return

    let attempt = 0
    const mount = () => {
      if (mountSessionMenuItem(button, sessionId, t)) return
      attempt += 1
      if (attempt < 5) setTimeout(mount, 20)
    }
    setTimeout(mount, 0)
  }
  document.addEventListener('click', onClick, true)
  return () => { document.removeEventListener('click', onClick, true) }
}

function installSessionQuickActions(t) {
  let pinnedIds = readPinnedSessionIds(window.localStorage)
  let timer

  const togglePin = (sessionId) => {
    const next = pinnedIds.includes(sessionId)
      ? pinnedIds.filter(id => id !== sessionId)
      : [sessionId, ...pinnedIds]
    if (!writePinnedSessionIds(window.localStorage, next)) return
    pinnedIds = next
    sync()
  }

  const sync = () => {
    const seen = new Map()
    for (const row of document.querySelectorAll('[role="treeitem"]')) {
      const context = sessionContextFromElement(row)
      if (context === undefined || typeof context.archiveSession !== 'function') continue
      mountSessionQuickActions(row, context, pinnedIds, t, togglePin)
      if (typeof context.setSessionOrder !== 'function') continue
      let accounts = seen.get(context.setSessionOrder)
      if (accounts === undefined) {
        accounts = new Set()
        seen.set(context.setSessionOrder, accounts)
      }
      if (accounts.has(context.accountKey)) continue
      accounts.add(context.accountKey)
      syncPinnedSessionOrder(context, pinnedIds)
    }
  }

  const schedule = () => {
    if (timer !== undefined) return
    timer = setTimeout(() => {
      timer = undefined
      sync()
    }, 0)
  }
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : undefined
  observer?.observe(document.body, { childList: true, subtree: true })
  const onStorage = (event) => {
    if (event.key !== null && event.key !== PINNED_STORAGE_KEY) return
    pinnedIds = readPinnedSessionIds(window.localStorage)
    sync()
  }
  window.addEventListener?.('storage', onStorage)
  sync()

  return () => {
    if (timer !== undefined) clearTimeout(timer)
    observer?.disconnect()
    window.removeEventListener?.('storage', onStorage)
  }
}

function CopyIcon({ copied }) {
  return copied
    ? (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m3.5 8.2 2.8 2.8 6.2-6.2" />
        </svg>
      )
    : (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="5.1" y="5.1" width="7.4" height="7.4" rx="1.4" />
          <path d="M10.7 5.1V4.2a1.7 1.7 0 0 0-1.7-1.7H4.2a1.7 1.7 0 0 0-1.7 1.7V9A1.7 1.7 0 0 0 4.2 10.7h.9" />
        </svg>
      )
}

function CopySessionId({ sessionId, t }) {
  const [status, setStatus] = useState('idle')
  const timer = useRef()

  useEffect(() => () => { clearTimeout(timer.current) }, [])

  const copy = async () => {
    const accepted = await writeClipboard(String(sessionId))
    setStatus(accepted ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setStatus('idle') }, 1600)
  }

  const title = status === 'copied'
    ? t('copy.copied')
    : status === 'failed' ? t('copy.failed') : t('copy.title')

  return (
    <button
      type="button"
      className="dsh-session-tools-copy"
      data-status={status}
      aria-label={status === 'idle' ? t('copy.aria', { id: String(sessionId) }) : title}
      title={title}
      onClick={() => { void copy() }}
    >
      <span>ID</span>
      <CopyIcon copied={status === 'copied'} />
    </button>
  )
}

function installStyles() {
  if (document.querySelector(`#${STYLE_ID}`) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.dsh-session-tools-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  min-width: 56px;
  padding: 6px 12px;
  gap: 5px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 18px;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  font: 400 13px/20px var(--dsw-font-family);
  cursor: pointer;
}
.dsh-session-tools-copy:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-session-tools-copy:focus-visible { outline: 2px solid var(--dsw-alias-label-primary-bluish); outline-offset: 2px; }
.dsh-session-tools-copy[data-status="copied"],
.dsh-session-tools-menu-item[data-status="copied"] { color: var(--dsw-alias-label-primary-bluish); }
.dsh-session-tools-copy[data-status="failed"],
.dsh-session-tools-menu-item[data-status="failed"] { color: var(--dsw-alias-label-error); }
.dsh-session-tools-copy span { white-space: nowrap; }
.dsh-session-tools-copy svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.dsh-session-tools-row-actions-host {
  display: inline-flex !important;
  align-items: center;
  gap: 4px !important;
  width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition: opacity 120ms var(--ds-ease-in-out);
}
.dsh-session-tools-row:hover .dsh-session-tools-row-actions-host,
.dsh-session-tools-row:focus-within .dsh-session-tools-row-actions-host {
  width: auto;
  opacity: 1;
  overflow: visible;
  pointer-events: auto;
}
.dsh-session-tools-row:hover .dsh-session-tools-row-time,
.dsh-session-tools-row:focus-within .dsh-session-tools-row-time { display: none; }
.dsh-session-tools-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.dsh-session-tools-row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
  cursor: pointer;
}
.dsh-session-tools-row-action:hover { color: var(--dsw-alias-label-primary); }
.dsh-session-tools-row-action:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary-bluish);
  outline-offset: 1px;
}
.dsh-session-tools-row-action[aria-pressed="true"] {
  color: var(--dsw-alias-state-business-primary);
}
.dsh-session-tools-row-action:disabled {
  opacity: .45;
  cursor: default;
}
.dsh-session-tools-row-action[data-status="failed"] {
  color: var(--dsw-alias-label-error);
}
.dsh-session-tools-row-action svg {
  width: 16px;
  height: 16px;
  flex: none;
}
@media (hover: none) and (pointer: coarse) {
  .dsh-session-tools-row .dsh-session-tools-row-actions-host {
    width: auto;
    opacity: 1;
    overflow: visible;
    pointer-events: auto;
  }
  .dsh-session-tools-row .dsh-session-tools-row-time { display: none; }
}
`
  document.head.appendChild(style)
  return () => { style.remove() }
}

export function apply(ctx) {
  ctx.effect(installStyles)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))
  ctx.effect(() => installSessionMenuCopy(ctx.locale.bind(NS)))
  ctx.effect(() => installSessionQuickActions(ctx.locale.bind(NS)))
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'copy-session-id',
    locale: NS,
  }, CopySessionId))
}
