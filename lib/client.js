window.__ModuleLoader__.load({id:"dsh-session-tools",factory:(require)=>{var module={exports:{}};var exports=module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  sessionIdFromElement: () => sessionIdFromElement,
  writeClipboard: () => writeClipboard
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var NS = "dsh-session-tools";
var STYLE_ID = "dsh-session-tools-style";
var zh = {
  "copy.aria": "\u590D\u5236\u5BF9\u8BDD ID\uFF1A{id}",
  "copy.title": "\u590D\u5236\u5BF9\u8BDD ID",
  "copy.menu": "\u590D\u5236\u4F1A\u8BDD ID",
  "copy.copied": "\u5DF2\u590D\u5236\u5BF9\u8BDD ID",
  "copy.failed": "\u590D\u5236\u5931\u8D25"
};
var en = {
  "copy.aria": "Copy session ID: {id}",
  "copy.title": "Copy session ID",
  "copy.menu": "Copy session ID",
  "copy.copied": "Session ID copied",
  "copy.failed": "Copy failed"
};
var inject = ["slots", "locale"];
async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  const exec = typeof document.execCommand === "function" ? document.execCommand.bind(document) : void 0;
  if (exec === void 0) return false;
  const element = document.createElement("textarea");
  element.value = text;
  element.setAttribute("readonly", "");
  element.style.position = "fixed";
  element.style.left = "-9999px";
  document.body.appendChild(element);
  element.select();
  try {
    return exec("copy");
  } catch {
    return false;
  } finally {
    element.remove();
  }
}
function sessionIdFromElement(element) {
  const key = Object.getOwnPropertyNames(element).find((name) => name.startsWith("__reactFiber$"));
  let fiber = key === void 0 ? void 0 : element[key];
  for (let depth = 0; fiber !== void 0 && fiber !== null && depth < 64; depth += 1) {
    const sessionId = fiber.memoizedProps?.node?.id;
    if (typeof sessionId === "string" && sessionId.trim() !== "") return sessionId;
    fiber = fiber.return;
  }
  return void 0;
}
function nearestMenu(anchor) {
  const anchorRect = anchor.getBoundingClientRect();
  return Array.from(document.querySelectorAll('[role="menu"]')).filter((menu) => {
    const rect = menu.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && menu.querySelector('[role="menuitem"]') !== null;
  }).sort((left, right) => {
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    const aDistance = Math.abs(a.left - anchorRect.left) + Math.abs(a.top - anchorRect.bottom);
    const bDistance = Math.abs(b.left - anchorRect.left) + Math.abs(b.top - anchorRect.bottom);
    return aDistance - bDistance;
  })[0];
}
function svgElement(name, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}
function menuIcon(copied) {
  const svg = svgElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": "true"
  });
  if (copied) {
    svg.appendChild(svgElement("path", {
      d: "m3.5 8.2 2.8 2.8 6.2-6.2",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }));
    return svg;
  }
  svg.appendChild(svgElement("rect", {
    x: "5.1",
    y: "5.1",
    width: "7.4",
    height: "7.4",
    rx: "1.4",
    stroke: "currentColor",
    "stroke-width": "1.5"
  }));
  svg.appendChild(svgElement("path", {
    d: "M10.7 5.1V4.2A1.7 1.7 0 0 0 9 2.5H4.2a1.7 1.7 0 0 0-1.7 1.7V9a1.7 1.7 0 0 0 1.7 1.7h.9",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  }));
  return svg;
}
function mountSessionMenuItem(anchor, sessionId, t) {
  const menu = nearestMenu(anchor);
  if (menu === void 0) return false;
  if (menu.querySelector("[data-dsh-session-tools-copy]") !== null) return true;
  const template = menu.querySelector('[role="menuitem"]');
  if (template === null) return false;
  const item = template.cloneNode(false);
  item.classList.add("dsh-session-tools-menu-item");
  item.dataset.dshSessionToolsCopy = sessionId;
  const icon = document.createElement("span");
  icon.className = template.firstElementChild?.className ?? "";
  icon.appendChild(menuIcon(false));
  const label = document.createElement("span");
  label.className = template.lastElementChild?.className ?? "";
  label.textContent = t("copy.menu");
  label.setAttribute("aria-live", "polite");
  item.append(icon, label);
  item.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (item.dataset.copying === "true") return;
    item.dataset.copying = "true";
    const accepted = await writeClipboard(sessionId);
    delete item.dataset.copying;
    item.dataset.status = accepted ? "copied" : "failed";
    icon.replaceChildren(menuIcon(accepted));
    label.textContent = t(accepted ? "copy.copied" : "copy.failed");
    if (accepted) {
      setTimeout(() => {
        if (item.isConnected && anchor.isConnected) anchor.click();
      }, 500);
      return;
    }
    setTimeout(() => {
      if (!item.isConnected) return;
      delete item.dataset.status;
      icon.replaceChildren(menuIcon(false));
      label.textContent = t("copy.menu");
    }, 1600);
  });
  menu.insertBefore(item, template.nextSibling);
  window.dispatchEvent(new Event("resize"));
  return true;
}
function installSessionMenuCopy(t) {
  const onClick = (event) => {
    const target = event.target;
    if (typeof target?.closest !== "function") return;
    const button = target.closest("button");
    if (button === null || button.closest('[role="treeitem"]') === null) return;
    const sessionId = sessionIdFromElement(button);
    if (sessionId === void 0) return;
    let attempt = 0;
    const mount = () => {
      if (mountSessionMenuItem(button, sessionId, t)) return;
      attempt += 1;
      if (attempt < 5) setTimeout(mount, 20);
    };
    setTimeout(mount, 0);
  };
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
  };
}
function CopyIcon({ copied }) {
  return copied ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m3.5 8.2 2.8 2.8 6.2-6.2" }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", { x: "5.1", y: "5.1", width: "7.4", height: "7.4", rx: "1.4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.7 5.1V4.2a1.7 1.7 0 0 0-1.7-1.7H4.2a1.7 1.7 0 0 0-1.7 1.7V9A1.7 1.7 0 0 0 4.2 10.7h.9" })
  ] });
}
function CopySessionId({ sessionId, t }) {
  const [status, setStatus] = (0, import_react.useState)("idle");
  const timer = (0, import_react.useRef)();
  (0, import_react.useEffect)(() => () => {
    clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    const accepted = await writeClipboard(String(sessionId));
    setStatus(accepted ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("idle");
    }, 1600);
  };
  const title = status === "copied" ? t("copy.copied") : status === "failed" ? t("copy.failed") : t("copy.title");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      type: "button",
      className: "dsh-session-tools-copy",
      "data-status": status,
      "aria-label": status === "idle" ? t("copy.aria", { id: String(sessionId) }) : title,
      title,
      onClick: () => {
        void copy();
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "ID" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CopyIcon, { copied: status === "copied" })
      ]
    }
  );
}
function installStyles() {
  if (document.querySelector(`#${STYLE_ID}`) !== null) return () => {
  };
  const style = document.createElement("style");
  style.id = STYLE_ID;
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
`;
  document.head.appendChild(style);
  return () => {
    style.remove();
  };
}
function apply(ctx) {
  ctx.effect(installStyles);
  ctx.effect(() => ctx.locale.register(NS, { zh, en }));
  ctx.effect(() => installSessionMenuCopy(ctx.locale.bind(NS)));
  ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
    name: "conversation.session.header.utilities",
    id: "copy-session-id",
    locale: NS
  }, CopySessionId));
}
return module.exports;}});
