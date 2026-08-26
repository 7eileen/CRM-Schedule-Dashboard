import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadDashboard() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.find(script => script.includes("function specialDetailSection"));
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

function renderContentDemand(run) {
  return run(`(() => {
    const groupIndex = specialDetailGroups.findIndex(group => group.supportKey === "content");
    return detailCard(specialDetailGroups[groupIndex], groupIndex);
  })()`);
}

test("内容需求按基本信息和内容信息分区，并完整呈现新增采集项", () => {
  const run = loadDashboard();
  const markup = renderContentDemand(run);

  assert.match(markup, /class="content-requirement-layout"/);
  assert.match(markup, />基本信息</);
  assert.match(markup, />内容信息</);

  const expectedLabels = [
    "过往合作",
    "星图合作",
    "首播 / 复播",
    "达人近期行程",
    "可拍摄时间地点",
    "脚本交付时间",
    "近期舆论热点",
    "实拍尺度",
    "外景拍摄可行性",
    "出镜人员",
    "内容形式",
    "内容禁忌（重要）",
    "星图发布时间",
    "对应脚本",
    "拍摄总条数",
    "主页发布数量",
    "需支援剪辑条数"
  ];

  expectedLabels.forEach(label => {
    assert.equal(markup.split(`>${label}<`).length - 1, 1, `${label} 应且仅应出现一次`);
  });
  assert.doesNotMatch(markup, /达人内容方向禁忌|达人热点与背景|预估拍摄时间、地点|有无种草星图单|种草星图单链接/);
});

test("内容需求复用专场信息生成同步摘要，不重复创建共用输入框", () => {
  const run = loadDashboard();
  const markup = run(`(() => {
    const special = specialDetailGroups.find(group => group.title === "专场信息");
    const values = {
      "达人 UID": "dy-test-001",
      "专场排期（时间）": "2026-07-08T19:30",
      "主推机制": "买二送一，前 20 分钟加赠",
      "福袋需求": "马年礼盒（价值1499元）",
      "目标销售额": "¥99万"
    };
    special.fields.forEach(field => {
      if (Object.hasOwn(values, field.label)) field.value = values[field.label];
    });
    const contentIndex = specialDetailGroups.findIndex(group => group.supportKey === "content");
    return detailCard(specialDetailGroups[contentIndex], contentIndex);
  })()`);

  [
    ["达人账号", "dy-test-001"],
    ["直播时间", "2026-07-08 19:30"],
    ["直播机制", "买二送一，前 20 分钟加赠"],
    ["福袋", "马年礼盒（价值1499元）"],
    ["预估销售额", "¥99万"]
  ].forEach(([label, value]) => {
    assert.match(markup, new RegExp(`<span>${label}<\\/span><strong>${value}<\\/strong>`));
  });

  assert.equal((markup.match(/data-content-shared-summary/g) || []).length, 1);
  assert.doesNotMatch(markup, /data-special-detail="[^"]+"[^>]*>[^<]*(达人账号|直播时间|直播机制|福袋|预估销售额)/);
});

test("切换星图合作后立即重绘并更新依赖字段", () => {
  const run = loadDashboard();
  const result = run(`(() => {
    const groupIndex = specialDetailGroups.findIndex(group => group.supportKey === "content");
    const fieldIndex = specialDetailGroups[groupIndex].fields.findIndex(field => field.label === "星图合作");
    const listeners = {};
    const input = {
      dataset: { specialDetail: groupIndex + ":" + fieldIndex },
      type: "select-one",
      value: "无",
      addEventListener(name, listener) { listeners[name] = listener; }
    };
    document.querySelectorAll = selector => selector === "[data-special-detail]" ? [input] : [];
    let renderCount = 0;
    render = () => { renderCount += 1; };
    bind();
    listeners.change({ type: "change" });
    const scriptField = specialDetailGroups[groupIndex].fields.find(field => field.label === "对应脚本");
    return {
      renderCount,
      selectedValue: specialDetailGroups[groupIndex].fields[fieldIndex].value,
      scriptVisible: shouldShowDetailField(groupIndex, scriptField)
    };
  })()`);

  assert.equal(result.selectedValue, "无");
  assert.equal(result.renderCount, 1);
  assert.equal(result.scriptVisible, false);
});

test("编辑共用专场字段后刷新内容需求同步摘要", () => {
  const run = loadDashboard();
  const result = run(`(() => {
    const groupIndex = specialDetailGroups.findIndex(group => group.title === "专场信息");
    const fieldIndex = specialDetailGroups[groupIndex].fields.findIndex(field => field.label === "主推机制");
    const listeners = {};
    const input = {
      dataset: { specialDetail: groupIndex + ":" + fieldIndex },
      type: "textarea",
      value: "直播前 20 分钟买二送一",
      addEventListener(name, listener) { listeners[name] = listener; }
    };
    document.querySelectorAll = selector => selector === "[data-special-detail]" ? [input] : [];
    let renderCount = 0;
    render = () => { renderCount += 1; };
    bind();
    listeners.change({ type: "change" });
    return {
      renderCount,
      fieldValue: specialDetailGroups[groupIndex].fields[fieldIndex].value
    };
  })()`);

  assert.equal(result.fieldValue, "直播前 20 分钟买二送一");
  assert.equal(result.renderCount, 1);
});
