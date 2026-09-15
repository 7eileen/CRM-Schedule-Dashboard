import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const dashboardHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function loadDashboard() {
  const scripts = [...dashboardHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.find(script => script.includes("function applySpecialInfoValues"));
  const browserBindingIndex = source.indexOf('    $("#drawerClose").addEventListener');
  const dashboardSource = source.slice(0, browserBindingIndex);
  const domNodes = new Map();
  const nodeFor = selector => {
    if (!domNodes.has(selector)) {
      domNodes.set(selector, {
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        innerHTML: "",
        textContent: ""
      });
    }
    return domNodes.get(selector);
  };
  const context = vm.createContext({
    cancelAnimationFrame: () => {},
    clearTimeout,
    console,
    Date,
    document: {
      querySelector: selector => nodeFor(selector),
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
    nodeFor,
    run: expression => vm.runInContext(expression, context)
  };
}

test("开播时间仅在真实修改时追加历史", () => {
  const { run } = loadDashboard();
  const result = JSON.parse(run(`(() => {
    const record = {
      id: "HISTORY-TEST",
      title: "梓慧儿专场",
      specialName: "梓慧儿专场",
      uid: "dy-history-test",
      talent: "梓慧儿",
      liveTime: "2026-06-01 21:00",
      business: "谭燕琳",
      status: "已排期",
      product: "常规款定妆喷雾-橙瓶",
      expectedGmv: "¥68万",
      progress: 0
    };
    const values = {
      specialName: record.specialName,
      uid: record.uid,
      talent: record.talent,
      liveTime: record.liveTime,
      business: record.business,
      scheduleStatus: "已排期",
      type: "专场",
      liveRoom: "直播间A",
      product: record.product,
      mechanism: "按商务文档机制执行",
      expectedGmv: record.expectedGmv
    };

    applySpecialInfoValues(record, values);
    values.liveTime = "2026-06-01 21:30";
    applySpecialInfoValues(record, values);
    applySpecialInfoValues(record, values);

    const initialRecord = { ...record, liveTime: "", liveTimeHistory: undefined };
    applySpecialInfoValues(initialRecord, { ...values, liveTime: "2026-06-02 20:00" });
    return JSON.stringify({
      history: record.liveTimeHistory,
      initialHistory: initialRecord.liveTimeHistory
    });
  })()`));

  assert.equal(result.history.length, 1);
  assert.deepEqual(
    {
      from: result.history[0].from,
      to: result.history[0].to,
      changedBy: result.history[0].changedBy
    },
    {
      from: "2026-06-01 21:00",
      to: "2026-06-01 21:30",
      changedBy: "谭燕琳"
    }
  );
  assert.match(result.history[0].changedAt, /^\d{4}-\d{1,2}-\d{1,2}/);
  assert.equal(result.initialHistory, undefined);
});

test("日期时间分隔符不同但时间相同时不记录为修改", () => {
  const { run } = loadDashboard();
  const history = JSON.parse(run(`(() => {
    const record = {
      id: "NORMALIZED-HISTORY",
      title: "格式归一专场",
      uid: "dy-normalized-history",
      talent: "达人甲",
      liveTime: "2026-06-01T21:00",
      business: "商务甲",
      status: "已排期",
      product: "常规款定妆喷雾-橙瓶",
      expectedGmv: "¥10万",
      progress: 0
    };
    applySpecialInfoValues(record, {
      specialName: record.title,
      uid: record.uid,
      talent: record.talent,
      liveTime: "2026-06-01 21:00",
      business: record.business,
      scheduleStatus: "已排期",
      type: "专场",
      liveRoom: "直播间A",
      product: record.product,
      expectedGmv: record.expectedGmv
    });
    return JSON.stringify(record.liveTimeHistory || []);
  })()`));

  assert.deepEqual(history, []);
});

test("开播时间历史标记仅在有记录时显示且按修改时间倒序排列", () => {
  const { run } = loadDashboard();
  const result = JSON.parse(run(`JSON.stringify({
    unchanged: liveTimeField({ id: "UNCHANGED", liveTime: "2026-06-01 21:00" }),
    changed: liveTimeField({
      id: "CHANGED",
      liveTime: "2026-06-01 22:00",
      liveTimeHistory: [
        {
          from: "2026-06-01 21:00",
          to: "2026-06-01 21:30",
          changedBy: "谭燕琳",
          changedAt: "2026-05-28 10:00:00"
        },
        {
          from: "2026-06-01 21:30",
          to: "2026-06-01 22:00",
          changedBy: "刘曼曼",
          changedAt: "2026-05-29 11:00:00"
        }
      ]
    })
  })`));

  assert.doesNotMatch(result.unchanged, /已修改|live-time-history-trigger|role="tooltip"/);
  assert.match(result.changed, /<strong>2026-06-01 22:00<\/strong>/);
  assert.match(result.changed, /class="live-time-history-trigger"[^>]*aria-label="开播时间已修改，悬停或聚焦查看历史"/);
  assert.match(result.changed, /role="tooltip"/);
  assert.ok(
    result.changed.indexOf("2026-06-01 21:30 → 2026-06-01 22:00")
      < result.changed.indexOf("2026-06-01 21:00 → 2026-06-01 21:30"),
    "最新一次修改应显示在历史列表最前"
  );
  assert.match(result.changed, /刘曼曼 · 2026-05-29 11:00:00/);
  assert.match(result.changed, /谭燕琳 · 2026-05-28 10:00:00/);
});

test("项目详情与原始记录统一展示开播时间修改历史", () => {
  const { run } = loadDashboard();
  const result = JSON.parse(run(`(() => {
    const record = records.find(item => item.id === "ZC-0606-1");
    record.liveTimeHistory = [{
      from: "2026-06-06 19:30",
      to: "2026-06-06 20:00",
      changedBy: "欧阳婉怡",
      changedAt: "2026-05-28 14:32:10"
    }];
    state.selected = record.id;
    const detail = projectDetailPanel(record);
    openRecordDrawer();
    return JSON.stringify({
      detail,
      original: document.querySelector("#drawerBody").innerHTML
    });
  })()`));

  assert.equal((result.detail.match(/live-time-history-trigger/g) || []).length, 1);
  assert.equal((result.original.match(/live-time-history-trigger/g) || []).length, 1);
  [result.detail, result.original].forEach(markup => {
    assert.match(markup, /2026-06-06 19:30 → 2026-06-06 20:00/);
    assert.match(markup, /欧阳婉怡 · 2026-05-28 14:32:10/);
  });
});

test("开播时间修改历史支持鼠标悬停和键盘聚焦查看", () => {
  assert.match(
    dashboardHtml,
    /\.live-time-history-trigger\s*\{[^}]*color:\s*var\(--orange\)[^}]*background:\s*var\(--orange-soft\)/
  );
  assert.match(
    dashboardHtml,
    /\.live-time-history-popover\s*\{[^}]*width:\s*min\(380px, calc\(100vw - 72px\)\)[^}]*opacity:\s*0[^}]*visibility:\s*hidden/
  );
  assert.match(
    dashboardHtml,
    /\.live-time-history:hover \.live-time-history-popover,\s*\.live-time-history:focus-within \.live-time-history-popover\s*\{[^}]*opacity:\s*1[^}]*visibility:\s*visible/
  );
});
