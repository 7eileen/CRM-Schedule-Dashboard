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
    "区分首播 / 复播",
    "达人近期行程",
    "预计拍摄时间",
    "拍摄地点",
    "脚本交付时间",
    "近期舆论热点 / 达人热点与背景",
    "实拍尺度（暴力测评可接受范围）",
    "外景拍摄可行性",
    "出镜人员",
    "内容形式",
    "内容禁忌（重要）",
    "星图发布时间",
    "星图对应脚本",
    "有无种草星图单",
    "脚本需求",
    "内容交付时间",
    "拍摄总条数",
    "主页发布数量",
    "主页发布渠道",
    "需支援剪辑条数"
  ];

  expectedLabels.forEach(label => {
    assert.equal(markup.split(`>${label}<`).length - 1, 1, `${label} 应且仅应出现一次`);
  });
  assert.match(markup, /data-content-section="basic"/);
  assert.match(markup, /data-content-section="content"/);
  assert.equal((markup.match(/content-form-grid/g) || []).length, 2);
  assert.doesNotMatch(markup, />可拍摄时间地点<|>近期舆论热点<|>实拍尺度<|>对应脚本<|>首播 \/ 复播</);
});

test("五项内容采集字段默认显示灰色问询提示而非演示答案", () => {
  const run = loadDashboard();
  const fields = JSON.parse(run(`(() => {
    const labels = ["实拍尺度（暴力测评可接受范围）", "外景拍摄可行性", "出镜人员", "内容形式", "内容禁忌（重要）"];
    const contentGroup = specialDetailGroups.find(group => group.supportKey === "content");
    return JSON.stringify(labels.map(label => {
      const field = contentGroup.fields.find(item => item.label === label);
      return { label, value: field.value, placeholder: field.placeholder };
    }));
  })()`));

  assert.deepEqual(fields, [
    {
      label: "实拍尺度（暴力测评可接受范围）",
      value: "",
      placeholder: "能否接受暴力测评（喷水 / 花洒 / 酱油 / 胶带 / 食用油 / 暴汗实测）、素颜瑕疵 & 妆后强反差、斑驳卡粉痛点图，具体哪种不接受？"
    },
    {
      label: "外景拍摄可行性",
      value: "",
      placeholder: "户外暴晒、运动暴汗、泳池等实景拍摄是否可接受？"
    },
    {
      label: "出镜人员",
      value: "",
      placeholder: "家人 / 助理能否出镜，明确人物同框禁忌"
    },
    {
      label: "内容形式",
      value: "",
      placeholder: "是否接受剧情类、演绎类"
    },
    {
      label: "内容禁忌（重要）",
      value: "",
      placeholder: "禁止拍摄画面、敏感话术、抵触拍摄形式、账号避雷内容"
    }
  ]);
});

test("内容需求不展示与专场信息重复的摘要字段", () => {
  const run = loadDashboard();
  const markup = renderContentDemand(run);

  assert.doesNotMatch(markup, /data-content-shared-summary|已同步专场信息|达人账号|直播时间|直播机制|>福袋<|预估销售额/);
});

test("切换有无种草星图单后立即重绘并更新依赖字段", () => {
  const run = loadDashboard();
  const result = run(`(() => {
    const groupIndex = specialDetailGroups.findIndex(group => group.supportKey === "content");
    const fieldIndex = specialDetailGroups[groupIndex].fields.findIndex(field => field.label === "有无种草星图单");
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
    const scriptField = specialDetailGroups[groupIndex].fields.find(field => field.label === "星图对应脚本");
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

test("编辑专场信息不再为内容需求摘要触发整体重绘", () => {
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
  assert.equal(result.renderCount, 0);
});
