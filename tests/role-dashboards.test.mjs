import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadDashboard() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const source = scripts.find(script => script.includes("function pageDataCenter"));
  const browserBindingIndex = source.indexOf('    $("#drawerClose").addEventListener');
  const dashboardSource = source.slice(0, browserBindingIndex);
  const context = vm.createContext({
    Blob: class Blob {},
    URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => {} },
    cancelAnimationFrame: () => {},
    clearTimeout,
    console,
    Date,
    document: {
      body: { appendChild: () => {} },
      createElement: () => ({ click: () => {}, remove: () => {} }),
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
  return expression => vm.runInContext(expression, context);
}

test("月度统计提供综合及五个角色看板入口", () => {
  const run = loadDashboard();
  const result = JSON.parse(run(`JSON.stringify({
    selected: state.monthlyRole,
    definitions: monthlyRoleDefinitions(),
    markup: monthlyRoleTabs()
  })`));

  assert.equal(result.selected, "overview");
  assert.deepEqual(
    result.definitions.map(item => [item.id, item.label]),
    [
      ["overview", "综合"],
      ["service", "客服"],
      ["supply", "供应链"],
      ["content", "内容"],
      ["ads", "投放"],
      ["business", "商务"]
    ]
  );
  assert.equal((result.markup.match(/data-monthly-role=/g) || []).length, 6);
});

test("常规角色看板不显示备注小页卡", () => {
  const run = loadDashboard();
  const contexts = JSON.parse(run(`JSON.stringify({
    overview: monthlyRoleContext("overview"),
    service: monthlyRoleContext("service"),
    supply: monthlyRoleContext("supply"),
    content: monthlyRoleContext("content"),
    business: monthlyRoleContext("business"),
    ads: monthlyRoleContext("ads")
  })`));

  assert.equal(contexts.overview, "");
  assert.equal(contexts.service, "");
  assert.equal(contexts.supply, "");
  assert.equal(contexts.content, "");
  assert.equal(contexts.business, "");
  assert.match(contexts.ads, /投放费用与佣金口径/);
});

test("各角色看板严格显示需求中的字段", () => {
  const run = loadDashboard();
  const headers = JSON.parse(run(`JSON.stringify(Object.fromEntries(
    ["service", "supply", "content", "ads", "business"].map(role => [
      role,
      monthlyRoleColumns(role).map(column => column.label)
    ])
  ))`));

  assert.deepEqual(headers.service, ["达人UID", "达人昵称", "专场排期时间", "开播时间", "负责商务", "状态", "等级", "主推产品", "目标销售额", "查看详情"]);
  assert.deepEqual(headers.supply, ["达人UID", "达人昵称", "专场排期时间", "负责商务", "状态", "等级", "主推产品", "主推机制", "目标销售额", "查看详情"]);
  assert.deepEqual(headers.content, ["达人UID", "达人昵称", "专场排期时间", "负责商务", "负责编导", "编导进度", "状态", "等级", "主推产品", "直播场地", "目标销售额", "实际销售额", "达标率", "查看详情"]);
  assert.deepEqual(headers.ads, ["达人UID", "达人昵称", "专场排期时间", "负责商务", "负责投放", "主推产品", "线上佣金", "星图费用", "坑位费", "福袋费用", "消耗", "直接支付ROI", "直接成交金额", "综合佣金", "投放占比", "投放目标销售额", "实际销售额", "达标率"]);
  assert.deepEqual(headers.business, ["达人UID", "达人昵称", "专场排期时间", "负责商务", "负责编导", "负责投放", "状态", "等级", "主推产品", "主推机制", "目标销售额", "实际销售额", "达标率", "查看详情"]);
});

test("退款率按产品品类匹配指定标准", () => {
  const run = loadDashboard();
  const rates = JSON.parse(run(`JSON.stringify([
    refundRateForProduct("油皮气垫pro"),
    refundRateForProduct("联名款定妆喷雾-紫瓶"),
    refundRateForProduct("防晒素颜霜（化学款）"),
    refundRateForProduct("未配置新品")
  ])`));

  assert.deepEqual(rates, [0.38, 0.22, 0.3, null]);
});

test("投放占比、其它费用占比和综合佣金均按退款后销售额计算", () => {
  const run = loadDashboard();
  const metrics = JSON.parse(run(`JSON.stringify(adsCostMetrics({
    id: "TEST-ADS",
    product: "油皮气垫pro",
    actualGmv: "¥100万",
    expectedGmv: "¥120万",
    adsForecastGmv: "¥90万",
    onlineCommissionRate: 0.2,
    starMapFeeWan: 5,
    boothFeeWan: 3,
    lotteryFeeWan: 2,
    adsSpendWan: 10,
    directPayRoi: 2.5,
    directSalesWan: 25
  }))`));

  assert.equal(metrics.refundRate, 0.38);
  assert.equal(metrics.netSalesWan, 62);
  assert.equal(metrics.otherFeeRate, 16.1);
  assert.equal(metrics.adsRate, 16.1);
  assert.equal(metrics.combinedRate, 52.2);
  assert.equal(metrics.directPayRoi, 2.5);
  assert.equal(metrics.directSalesWan, 25);
});

test("投放看板标明CRM、人工填写和千川T加1数据来源及计算公式", () => {
  const run = loadDashboard();
  const markup = run(`monthlyRoleContext("ads")`);

  assert.match(markup, /CRM拉取/);
  assert.match(markup, /人工填写/);
  assert.match(markup, /千川T\+1同步/);
  assert.match(markup, /投放占比=消耗÷\[实际销售额×\(1-退款率\)\]/);
  assert.match(markup, /综合佣金=线上佣金\+其它费用占比\+投放占比/);
});

test("导出月报新增剪辑、投放、运营负责人和主推机制", () => {
  const run = loadDashboard();
  const result = JSON.parse(run(`(() => {
    const item = monthlySpecialRows()[0];
    return JSON.stringify({ headers: monthlyReportHeaders(), row: monthlyReportRow(item) });
  })()`));

  ["负责剪辑", "负责投放", "负责运营", "主推机制"].forEach(header => {
    assert.ok(result.headers.includes(header), `缺少月报字段：${header}`);
  });
  assert.equal(result.headers.length, result.row.length);
  assert.notEqual(result.row[result.headers.indexOf("负责剪辑")], "");
  assert.notEqual(result.row[result.headers.indexOf("负责投放")], "");
  assert.notEqual(result.row[result.headers.indexOf("负责运营")], "");
  assert.notEqual(result.row[result.headers.indexOf("主推机制")], "");
});

test("角色看板宽表具有独立横向滚动和移动端入口样式", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /\.monthly-role-tabs\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(html, /\.monthly-special-panel\s*\{[^}]*min-width:\s*0/);
  assert.match(html, /\.monthly-toolbar > \*\s*\{[^}]*min-width:\s*0/);
  assert.match(html, /\.monthly-toolbar \.input,\s*\.monthly-toolbar \.select\s*\{[^}]*min-width:\s*0/);
  assert.match(html, /\.role-table-scroll\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/);
  assert.match(html, /\.role-dashboard-table\.role-ads\s*\{[^}]*min-width:\s*2200px/);
  assert.match(html, /@media \(max-width: 1440px\)[\s\S]*\.monthly-toolbar\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(150px, 1fr\)\)/);
  assert.match(html, /@media \(max-width: 1180px\)[\s\S]*\.monthly-special-panel \.panel-head\s*\{[^}]*flex-direction:\s*column/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*\.monthly-role-tab\s*\{[^}]*flex:\s*0 0 auto/);
});
