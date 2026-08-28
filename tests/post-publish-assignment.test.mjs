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

test("已发布任务详情提供追加派工入口", () => {
  const run = loadDashboard();
  const markup = run(`(() => {
    const key = myTaskGroupKey("ZC-0601", "content");
    return myTaskCalendarDetailBody(taskActionItems(key));
  })()`);

  assert.match(markup, /data-calendar-add-assignee="group\|ZC-0601\|content"/);
  assert.match(markup, />追加派工</);
});

test("普通执行人不能在已发布任务详情中继续追加派工", () => {
  const run = loadDashboard();
  const result = JSON.parse(run(`(() => {
    state.taskScope = "mine";
    state.taskUser = "毛毛";
    const key = myTaskGroupKey("ZC-0601", "content");
    const list = tasksFor("ZC-0601", "content");
    const markup = myTaskCalendarDetailBody(taskActionItems(key));
    const before = list.length;
    const created = createPostPublishTask(key, {
      title: "越权新增任务",
      owner: "叶子",
      due: "2026-06-05"
    });
    return JSON.stringify({ markup, before, after: list.length, created });
  })()`));

  assert.doesNotMatch(result.markup, /data-calendar-add-assignee/);
  assert.equal(result.created.ok, false);
  assert.equal(result.created.error, "当前身份无追加派工权限");
  assert.equal(result.after, result.before);
});

test("追加派工表单保留当前专场与支持类型并采集新任务字段", () => {
  const run = loadDashboard();
  const markup = run(`typeof postPublishAssignmentFormBody === "function"
    ? postPublishAssignmentFormBody(myTaskGroupKey("ZC-0601", "content"))
    : ""`);

  assert.match(markup, /温格夫妇/);
  assert.match(markup, /内容支持/);
  assert.match(markup, /data-post-publish-task-title/);
  assert.match(markup, /data-post-publish-task-owner/);
  assert.match(markup, /data-post-publish-task-due/);
  assert.match(markup, /data-save-post-publish-task/);
  assert.match(markup, /data-cancel-post-publish-task/);
});

test("发布后追加派工创建独立待办任务且保留原任务", () => {
  const run = loadDashboard();
  const result = JSON.parse(run(`(() => {
    if (typeof createPostPublishTask !== "function") return JSON.stringify({ missing: true });
    const key = myTaskGroupKey("ZC-0601", "content");
    const list = tasksFor("ZC-0601", "content");
    const originalTitle = list[0].title;
    const before = list.length;
    const created = createPostPublishTask(key, {
      title: "新增复盘短视频脚本",
      owner: "叶子",
      due: "2026-06-05"
    });
    const task = list[list.length - 1];
    return JSON.stringify({
      ok: created.ok,
      before,
      after: list.length,
      originalTitle,
      originalStillThere: list[0].title,
      task
    });
  })()`));

  assert.equal(result.ok, true);
  assert.equal(result.after, result.before + 1);
  assert.equal(result.originalStillThere, result.originalTitle);
  assert.deepEqual(
    {
      title: result.task.title,
      owner: result.task.owner,
      due: result.task.due,
      status: result.task.status,
      workflowStatus: result.task.workflowStatus,
      businessNotice: result.task.businessNotice,
      source: result.task.source
    },
    {
      title: "新增复盘短视频脚本",
      owner: "叶子",
      due: "2026-06-05",
      status: "进行中",
      workflowStatus: "编写中",
      businessNotice: "new",
      source: "追加派工"
    }
  );
});

test("追加派工缺少必填信息时不创建任务", () => {
  const run = loadDashboard();
  const result = JSON.parse(run(`(() => {
    if (typeof createPostPublishTask !== "function") return JSON.stringify({ missing: true });
    const key = myTaskGroupKey("ZC-0601", "content");
    const list = tasksFor("ZC-0601", "content");
    const before = list.length;
    const created = createPostPublishTask(key, {
      title: "",
      owner: "叶子",
      due: "2026-06-05"
    });
    return JSON.stringify({ ...created, before, after: list.length });
  })()`));

  assert.equal(result.ok, false);
  assert.equal(result.error, "请完整填写任务名称、执行人和预计截止日期");
  assert.equal(result.after, result.before);
});

test("追加派工交互在移动端保持单列布局", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const mobileStyles = html.match(/@media \(max-width: 720px\) \{([\s\S]*?)\n    \}\n\n  <\/style>/)?.[1] || "";

  assert.match(html, /\.post-publish-assignment-form\s*\{[^}]*grid-template-columns:/);
  assert.match(mobileStyles, /\.post-publish-assignment-form\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(mobileStyles, /\.task-calendar-detail-list-head\s*\{[^}]*flex-direction:\s*column/);
  assert.match(mobileStyles, /\.task-calendar-detail-list-head\s+\.btn\s*\{[^}]*width:\s*100%/);
});
