import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadDrawer() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.find(script => script.includes("function openDrawer"));
  const browserBindingIndex = source.indexOf('    $("#drawerClose").addEventListener');
  const dashboardSource = source.slice(0, browserBindingIndex);
  const classList = () => ({ add() {}, remove() {}, toggle() {} });
  const nodes = Object.fromEntries(
    ["drawerTitle", "drawerBody", "drawerFoot", "drawer", "mask"].map(id => [
      id,
      { classList: classList(), innerHTML: "", textContent: "" }
    ])
  );
  const context = vm.createContext({
    cancelAnimationFrame: () => {},
    clearTimeout,
    console,
    Date,
    document: {
      getElementById: id => nodes[id] || null,
      querySelector: selector => selector.startsWith("#") ? nodes[selector.slice(1)] || null : null,
      querySelectorAll: () => []
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    requestAnimationFrame: callback => {
      callback();
      return 1;
    },
    setTimeout,
    window: {}
  });

  vm.runInContext(dashboardSource, context);
  return {
    nodes,
    run: expression => vm.runInContext(expression, context)
  };
}

test("弹窗默认页脚不再显示关闭按钮", () => {
  const { nodes, run } = loadDrawer();

  run('openDrawer("测试弹窗", "<p>内容</p>")');

  assert.equal(nodes.drawerFoot.innerHTML, "");
});

test("弹窗页脚移除关闭按钮但保留业务操作", () => {
  const { nodes, run } = loadDrawer();

  run(`openDrawer(
    "测试弹窗",
    "<p>内容</p>",
    '<button class="btn ghost" data-close>关闭</button><button class="btn primary" data-action="downloadOrders">下载订单</button>'
  )`);

  assert.doesNotMatch(nodes.drawerFoot.innerHTML, /data-close|>关闭</);
  assert.match(nodes.drawerFoot.innerHTML, /data-action="downloadOrders"[^>]*>下载订单</);
});
