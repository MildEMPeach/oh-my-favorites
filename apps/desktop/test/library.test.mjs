import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Exercise the editor's handlers without adding a DOM or test-renderer dependency.
function renderer(component, props, api) {
  const hooks = [];
  let cursor = 0;
  const react = {
    useMemo: (calculate) => calculate(),
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, (value) => { hooks[index].value = typeof value === "function" ? value(hooks[index].value) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!hooks[index] || deps.some((value, i) => !Object.is(value, hooks[index].deps[i]))) {
        hooks[index]?.cleanup?.();
        hooks[index] = { deps, cleanup: effect() };
      }
    }
  };
  const exports = {};
  const source = readFileSync(new URL(`../src/renderer/src/${component}.tsx`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  runInNewContext(outputText, {
    exports, Error,
    localStorage: { getItem: () => null, setItem() {} },
    window: { favorites: { hideBrowser() {}, showBrowser() {} }, addEventListener() {}, removeEventListener() {} },
    document: { documentElement: { style: {} } },
    require: (name) => name === "react" ? react : name === "./api" ? api : name === "./LibraryEditor" ? { LibraryEditor: () => null } : name.endsWith(".css") ? {} : require(name)
  });
  let tree;
  function render() { cursor = 0; tree = exports[component](props); }
  function find(predicate, node = tree) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children ?? []].flat(Infinity)) {
      if (child === undefined) continue;
      const result = find(predicate, child);
      if (result) return result;
    }
    return null;
  }
  render();
  return {
    render, find,
    change(predicate, value) { find(predicate).props.onChange({ target: { value } }); render(); },
    submit() { find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); render(); },
    unmount() { hooks.forEach((hook) => hook.cleanup?.()); }
  };
}

const editor = (props, api) => renderer("LibraryEditor", props, api);

test("favorite view ignores late collected responses and global tags include both areas", async () => {
  const requests = [];
  const tag = { id: 1, name: "reading" };
  const page = { id: 1, area: "inbox", title: "Collected page", url: "https://example.com/", readStatus: "unread", isFavorite: false, notes: "", tags: [tag], createdAt: "2026-01-01" };
  const favorite = { ...page, id: 2, area: "library", isFavorite: true, title: "Favorite page" };
  const view = renderer("App", {}, {
    listItems: (filter, tag) => new Promise((resolve) => requests.push({ filter, tag, resolve })),
    listTags: async () => ({ tags: [tag] })
  });
  requests[0].resolve({ items: [page] }); await settle(); view.render();
  view.find((node) => node.props?.title === "Refresh").props.onClick(); await settle();
  view.find((node) => node.props?.label === "Favorites").props.onClick(); await settle(); view.render();
  requests[2].resolve({ items: [favorite] }); await settle(); view.render();
  requests[1].resolve({ items: [page] }); await settle(); view.render();
  assert.ok(view.find((node) => node.type === "strong" && node.props.children === "Favorite page"));
  assert.equal(view.find((node) => node.type === "strong" && node.props.children === "Collected page"), null);
  view.find((node) => node.props?.label === "Tags").props.onClick(); await settle(); view.render();
  view.find((node) => node.props?.className === "tag-browser-item").props.onClick(); await settle(); view.render();
  const latest = requests.at(-1);
  assert.equal(latest.filter, "tagged"); assert.equal(latest.tag, "reading");
  latest.resolve({ items: [page, favorite] }); await settle(); view.render();
  assert.ok(view.find((node) => node.type === "strong" && node.props.children === "Collected page"));
  assert.ok(view.find((node) => node.type === "strong" && node.props.children === "Favorite page"));
  assert.equal(view.find((node) => node.props?.label === "Gallery"), null);
  view.unmount();
});

test("new favorites require a page URL and preserve notes", async () => {
  const calls = [], dirty = [], saved = [];
  const view = editor({ item: null, collections: [], onDirty: (value) => dirty.push(value), onSaved: (item) => saved.push(item) }, { createRecord: async (input) => { calls.push(input); return { id: 1 }; } });
  assert.equal(view.find((node) => node.type === "input" && node.props.type === "url").props.required, true);
  view.change((node) => node.type === "input" && node.props.maxLength === 300, "A useful page");
  view.change((node) => node.type === "input" && node.props.type === "url", "https://example.com/");
  view.change((node) => node.type === "textarea", "# My notes");
  assert.equal(dirty.at(-1), true);
  view.submit(); assert.equal(view.find((node) => node.type === "fieldset").props.disabled, true);
  await settle(); view.render();
  assert.equal(calls[0].url, "https://example.com/"); assert.equal(calls[0].notes, "# My notes");
  assert.equal(saved.length, 1); assert.equal(dirty.at(-1), false);
  view.unmount();
});

test("failed note saves preserve the draft and allow retry", async () => {
  const dirty = [], calls = [];
  let fail = true;
  const view = editor({ item: { id: 2, title: "Page", area: "inbox", url: "https://example.com/", collection: "CS", contentDate: "2026-10-14" }, collections: [], onDirty: (value) => dirty.push(value), onSaved() {} }, {
    saveDetails: async (id, input) => { calls.push({ id, input }); if (fail) throw new Error("Server unavailable"); return { id }; }
  });
  view.change((node) => node.type === "textarea", "Unsaved notes"); view.submit(); await settle(); view.render();
  assert.equal(view.find((node) => node.props?.role === "alert").props.children, "Server unavailable");
  assert.equal(view.find((node) => node.type === "textarea").props.value, "Unsaved notes"); assert.equal(dirty.at(-1), true);
  fail = false; view.submit(); await settle(); view.render();
  assert.equal(calls[1].input.collection, "CS"); assert.equal(calls[1].input.contentDate, "2026-10-14"); assert.equal(dirty.at(-1), false);
  view.unmount();
});

test("a save finishing after leaving cannot select an old record or clear a new draft", async () => {
  let finish;
  const dirty = [], saved = [];
  const view = editor({ item: null, collections: [], onDirty: (value) => dirty.push(value), onSaved: (item) => saved.push(item) }, { createRecord: () => new Promise((resolve) => { finish = resolve; }) });
  view.change((node) => node.type === "input" && node.props.maxLength === 300, "A page");
  view.submit(); view.unmount(); const count = dirty.length;
  finish({ id: 3 }); await settle();
  assert.equal(saved.length, 0); assert.equal(dirty.length, count); assert.equal(dirty.at(-1), false);
});
