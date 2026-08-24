import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadDashboard() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.find(script => script.includes("function pageDispatch"));
  const browserBindingIndex = source.indexOf('    $("#drawerClose").addEventListener');
  const dashboardSource = source.slice(0, browserBindingIndex);
  const context = vm.createContext({
    cancelAnimationFrame: () => {},
    clearTimeout,
    console,
    Date,
    document: { querySelectorAll: () => [] },
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
  return expression => vm.runInContext(expression, context);
}

test("需求派发以横向页卡工作条呈现，不再输出月历网格", () => {
  const run = loadDashboard();
  const markup = run(`(() => {
    state.taskScope = "manager";
    state.taskWorkspace = "dispatch";
    state.module = "content";
    state.taskMonth = "2026-06";
    return pageDispatch({ embedded: true });
  })()`);

  assert.match(markup, /data-dispatch-workstrip/);
  assert.match(markup, /data-dispatch-workstrip-viewport/);
  assert.match(markup, /data-dispatch-workstrip-prev/);
  assert.match(markup, /data-dispatch-workstrip-next/);
  assert.match(markup, /role="list"/);
  assert.doesNotMatch(markup, /calendar-grid|calendar-weekday|周一|周日/);
});

test("工作页卡按预计完成日期排序，并仅展示所选月份", () => {
  const run = loadDashboard();
  const markup = run(`(() => {
    state.taskScope = "manager";
    state.taskWorkspace = "dispatch";
    state.module = "content";
    state.taskMonth = "2026-06";
    const setDue = (recordId, due) => tasksFor(recordId, "content").forEach(task => {
      task.due = due;
      delete task.delayDue;
    });
    setDue("ZC-0620-3", "2026-06-20");
    setDue("ZC-0603-2", "2026-06-03");
    setDue("ZC-0605-1", "2026-07-05");
    setDue("ZC-0607-1", "2026-06-07");
    return pageDispatch({ embedded: true });
  })()`);

  const juneThird = markup.indexOf('data-toggle-dispatch="ZC-0603-2:content"');
  const juneSeventh = markup.indexOf('data-toggle-dispatch="ZC-0607-1:content"');
  const juneTwentieth = markup.indexOf('data-toggle-dispatch="ZC-0620-3:content"');

  assert.ok(juneThird >= 0, "6 月 3 日任务应显示");
  assert.ok(juneSeventh > juneThird, "6 月 7 日任务应排在 6 月 3 日之后");
  assert.ok(juneTwentieth > juneSeventh, "6 月 20 日任务应排在 6 月 7 日之后");
  assert.doesNotMatch(markup, /data-toggle-dispatch="ZC-0605-1:content"/);
  assert.match(markup, /预计完成/);
  assert.match(markup, /子任务/);
});

test("工作条翻页按钮移动横向视口并同步当前位置", () => {
  const run = loadDashboard();
  const result = run(`(() => {
    const listeners = {};
    const viewport = {
      clientWidth: 1188,
      scrollLeft: 0,
      scrollWidth: 1696,
      addEventListener(type, handler) { listeners[type] = handler; },
      scrollTo({ left }) {
        this.scrollLeft = left;
        if (listeners.scroll) listeners.scroll();
      }
    };
    const cards = [3, 429, 854, 1280].map(offsetLeft => ({
      closest: () => ({ offsetLeft })
    }));
    const previous = {
      addEventListener(type, handler) { this[type] = handler; },
      disabled: false
    };
    const next = {
      addEventListener(type, handler) { this[type] = handler; },
      disabled: false
    };
    const status = { textContent: "" };
    const workstrip = {
      querySelector(selector) {
        return {
          "[data-dispatch-workstrip-viewport]": viewport,
          "[data-dispatch-workstrip-prev]": previous,
          "[data-dispatch-workstrip-next]": next,
          "[data-dispatch-workstrip-status]": status
        }[selector];
      },
      querySelectorAll: () => cards
    };
    document.querySelectorAll = () => [workstrip];

    bindDispatchWorkstrip();
    const initiallyDisabled = previous.disabled;
    next.click();

    return {
      initiallyDisabled,
      nextDisabled: next.disabled,
      position: status.textContent,
      scrollLeft: viewport.scrollLeft
    };
  })()`);

  assert.equal(result.initiallyDisabled, true);
  assert.equal(result.nextDisabled, false);
  assert.equal(result.position, "2 / 3 页");
  assert.equal(Math.round(result.scrollLeft), 426);
});

test("移动端工作条限制在可视宽度内并保留横向滑动", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const mobileStyles = html.match(/@media \(max-width: 720px\) \{([\s\S]*?)\n    \}\n\n  <\/style>/)?.[1] || "";

  assert.match(mobileStyles, /\.dispatch-workstrip\s*\{[^}]*max-width:\s*calc\(100vw - 28px\)/);
  assert.match(html, /\.dispatch-workstrip-viewport\s*\{[^}]*overflow-x:\s*auto/);
});
