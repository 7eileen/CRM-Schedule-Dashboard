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

test("需求派发直接呈现单列宽页卡，不再输出列表说明栏、月历或横向翻页控件", () => {
  const run = loadDashboard();
  const markup = run(`(() => {
    state.taskScope = "manager";
    state.taskWorkspace = "dispatch";
    state.module = "content";
    state.taskMonth = "2026-06";
    return pageDispatch({ embedded: true });
  })()`);

  assert.match(markup, /data-dispatch-worklist/);
  assert.match(markup, /data-dispatch-worklist-list/);
  assert.equal((markup.match(/class="dispatch-worklist-item"/g) || []).length, 4);
  assert.doesNotMatch(markup, /dispatch-worklist-toolbar|dispatch-worklist-summary|dispatch-worklist-count/);
  assert.doesNotMatch(markup, /待派发任务列表|按预计完成时间排列|4 个专场/);
  assert.doesNotMatch(markup, /data-dispatch-workstrip-viewport|data-dispatch-workstrip-prev|data-dispatch-workstrip-next/);
  assert.doesNotMatch(markup, /calendar-grid|calendar-weekday|周一|周日/);
});

test("工作页卡按预计完成日期排序，同日再按开播时间排序，并仅展示所选月份", () => {
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
    records.find(record => record.id === "ZC-0603-2").liveTime = "2026-06-03 22:00";
    setDue("ZC-0605-1", "2026-06-03");
    records.find(record => record.id === "ZC-0605-1").liveTime = "2026-06-03 19:00";
    setDue("ZC-0607-1", "2026-07-07");
    return pageDispatch({ embedded: true });
  })()`);

  const juneThirdEarly = markup.indexOf('data-toggle-dispatch="ZC-0605-1:content"');
  const juneThird = markup.indexOf('data-toggle-dispatch="ZC-0603-2:content"');
  const juneTwentieth = markup.indexOf('data-toggle-dispatch="ZC-0620-3:content"');

  assert.ok(juneThirdEarly >= 0, "同为 6 月 3 日、19:00 开播的任务应显示");
  assert.ok(juneThird > juneThirdEarly, "同一天的任务应按开播时间从早到晚排列");
  assert.ok(juneThird >= 0, "6 月 3 日任务应显示");
  assert.ok(juneTwentieth > juneThird, "6 月 20 日任务应排在 6 月 3 日之后");
  assert.doesNotMatch(markup, /data-toggle-dispatch="ZC-0607-1:content"/);
  assert.doesNotMatch(markup, /预计完成|完成 \d+月\d+日|子任务/);
  assert.match(markup, /目标销售额/);
});

test("待派发页卡仅显示达人、排期、商务、产品和目标销售额", () => {
  const run = loadDashboard();
  const markup = run(`dispatchWorklistCard(records.find(record => record.id === "ZC-0620-3"), "content", 0)`);

  assert.doesNotMatch(markup, /dispatch-worklist-marker|<time|预计完成/);
  assert.match(markup, /<small>达人昵称<\/small><strong>梓慧儿<\/strong>/);
  assert.match(markup, /<small>专场排期<\/small><strong>2026-06-01 21:00<\/strong>/);
  assert.match(markup, /<small>负责商务<\/small><strong>谭燕琳<\/strong>/);
  assert.match(markup, /<small>主推产品<\/small><strong>常规款定妆喷雾-橙瓶<\/strong>/);
  assert.match(markup, /<small>目标销售额<\/small><strong>¥68万<\/strong>/);
  assert.doesNotMatch(markup, /完成 6月1日|子任务|内容支持|WORK 01|待派发|专场任务|查看派工/);
  assert.doesNotMatch(markup, /dispatch-worklist-main|dispatch-worklist-product|dispatch-worklist-side/);
});

test("任务列表与任务页卡使用单列全宽布局", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /\.dispatch-worklist-list\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(html, /\.dispatch-worklist-item\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(html, /\.dispatch-worklist-card\s*\{[^}]*width:\s*100%[^}]*grid-template-columns:/);
  assert.doesNotMatch(html, /\.dispatch-worklist-marker(?:\s|:|\{)/);
  assert.doesNotMatch(html, /function bindDispatchWorkstrip\s*\(/);
});

test("移动端任务页卡保持单列并将内部信息折行", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const mobileStyles = html.match(/@media \(max-width: 720px\) \{([\s\S]*?)\n    \}\n\n  <\/style>/)?.[1] || "";

  assert.match(mobileStyles, /\.dispatch-worklist\s*\{[^}]*width:\s*calc\(100vw - 68px\)[^}]*max-width:\s*calc\(100vw - 68px\)/);
  assert.match(mobileStyles, /\.dispatch-worklist-item\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(mobileStyles, /\.dispatch-worklist-card\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(mobileStyles, /\.dispatch-worklist-card-summary\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(html, /\.dispatch-workstrip-viewport\s*\{[^}]*overflow-x:\s*auto/);
});
