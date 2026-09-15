import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const dashboardHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function loadDashboard() {
  const scripts = [...dashboardHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.find(script => script.includes("function pageList"));
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

test("专场列表不再提供已延期统计入口", () => {
  const run = loadDashboard();
  const result = JSON.parse(run(`(() => {
    state.listMonth = "2026-06";
    state.listStart = "2026-06-01";
    state.listEnd = "2026-06-30";
    state.listFilter = "all";
    return JSON.stringify({
      keys: Object.keys(listStatGroups()),
      markup: pageList()
    });
  })()`));

  assert.deepEqual(result.keys, ["all", "running", "completed", "canceled"]);
  assert.equal((result.markup.match(/data-list-stat=/g) || []).length, 4);
  assert.doesNotMatch(result.markup, /data-list-stat="delayed"|>已延期<|筛选已延期日历/);
  assert.match(dashboardHtml, /\.list-stats\s*\{[^}]*grid-template-columns:\s*repeat\(4,/);
});

test("延期专场日历卡使用橙色且取消专场仍保留红色", () => {
  const run = loadDashboard();
  const cards = JSON.parse(run(`JSON.stringify({
    delayed: calendarEvent({
      id: "DELAYED",
      title: "延期专场",
      talent: "达人甲",
      liveTime: "2026-06-06 20:00",
      scheduleStatus: "已延期",
      progress: 30,
      expectedGmv: "¥10万",
      business: "商务甲"
    }),
    canceled: calendarEvent({
      id: "CANCELED",
      title: "取消专场",
      talent: "达人乙",
      liveTime: "2026-06-07 20:00",
      scheduleStatus: "已取消",
      progress: 30,
      expectedGmv: "¥10万",
      business: "商务乙"
    })
  })`));

  assert.match(cards.delayed, /class="calendar-event delayed"/);
  assert.doesNotMatch(cards.delayed, /class="calendar-event[^\"]*\bdelay\b/);
  assert.match(cards.canceled, /class="calendar-event delay"/);
  assert.match(dashboardHtml, /\.calendar-event\.delayed\s*\{[^}]*border-color:\s*#ffd8ae[^}]*background:\s*#fff2e4[^}]*color:\s*#8a4a00/);
});
