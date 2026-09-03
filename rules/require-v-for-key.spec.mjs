import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import rule from "./require-v-for-key.mjs";

let counter = 0;
const tmpFiles = [];

// Write an arbitrary SFC to a temp file and run the rule against it. Use this directly when a test
// needs control over block order — e.g. a template-first SFC with a non-empty script (the repo
// norm), the only layout that exercises reportAtFileOffset's negative-offset [template L:C] path.
function lintSource(source, options) {
    const filename = path.join(os.tmpdir(), `rvfk-${process.pid}-${counter++}.vue`);
    fs.writeFileSync(filename, source, "utf8");
    tmpFiles.push(filename);
    const reports = [];
    rule.create({ filename, options, report: (d) => reports.push(d) }).Program?.();
    return reports;
}

// Convenience wrapper: lint `templateInner` inside a minimal script-first SFC.
function lintTemplate(templateInner, options) {
    return lintSource(
        `<script setup lang="ts"></script>\n<template>\n    ${templateInner}\n</template>\n`,
        options,
    );
}

afterEach(() => {
    while (tmpFiles.length) {
        try {
            fs.unlinkSync(tmpFiles.pop());
        } catch {
            // best-effort temp cleanup
        }
    }
});

describe("vue-require-v-for-key", () => {
    it("reports v-for with no key", () => {
        assert.equal(lintTemplate('<li v-for="item in items">{{ item }}</li>').length, 1);
    });

    it("passes v-for with :key", () => {
        assert.equal(
            lintTemplate('<li v-for="item in items" :key="item.id">{{ item }}</li>').length,
            0,
        );
    });

    it("passes v-for with v-bind:key longhand", () => {
        assert.equal(
            lintTemplate('<li v-for="item in items" v-bind:key="item.id">x</li>').length,
            0,
        );
    });

    it("passes v-for with a static key attribute", () => {
        // Not useful in practice (a constant key defeats the purpose) but it IS a key, and
        // flagging it would be a different rule's job — lock in that we don't.
        assert.equal(lintTemplate('<li v-for="item in items" key="fixed">x</li>').length, 0);
    });

    it("reports v-for on a component, not just a plain element", () => {
        assert.equal(lintTemplate('<MyRow v-for="row in rows" :row="row" />').length, 1);
    });

    it("reports each unkeyed v-for independently", () => {
        assert.equal(
            lintTemplate(
                '<div><li v-for="a in as">x</li><li v-for="b in bs">y</li></div>',
            ).length,
            2,
        );
    });

    it("reports the inner v-for of a nested pair when only the outer is keyed", () => {
        assert.equal(
            lintTemplate(
                '<ul v-for="g in groups" :key="g.id"><li v-for="i in g.items">x</li></ul>',
            ).length,
            1,
        );
    });

    it("passes `<template v-for>` keyed on the template itself (Vue 3 idiom)", () => {
        assert.equal(
            lintTemplate('<template v-for="i in items" :key="i.id"><li>x</li></template>').length,
            0,
        );
    });

    it("passes `<template v-for>` with every direct element child keyed (Vue 2 idiom, still valid)", () => {
        assert.equal(
            lintTemplate(
                '<template v-for="i in items"><li :key="i.a">a</li><li :key="i.b">b</li></template>',
            ).length,
            0,
        );
    });

    it("reports `<template v-for>` when only SOME children are keyed", () => {
        assert.equal(
            lintTemplate(
                '<template v-for="i in items"><li :key="i.a">a</li><li>b</li></template>',
            ).length,
            1,
        );
    });

    it("reports `<template v-for>` with text-only children and no key", () => {
        // No element child can carry the key, so the template is judged on its own key alone.
        assert.equal(lintTemplate('<template v-for="i in items">{{ i }}</template>').length, 1);
    });

    it("ignores elements without v-for", () => {
        assert.equal(lintTemplate('<li :key="x">no v-for here</li>').length, 0);
    });

    it("finds v-for inside v-if / v-else branches", () => {
        // v-if chains keep branches off `children`, so this guards walkTemplate's branch walk.
        assert.equal(
            lintTemplate(
                '<div><ul v-if="a"><li v-for="i in as">x</li></ul>' +
                    '<ul v-else><li v-for="i in bs">y</li></ul></div>',
            ).length,
            2,
        );
    });

    it("prepends the real [template line:column] for a template-first SFC (the repo norm)", () => {
        const reports = lintSource(
            '<template>\n    <li v-for="i in items">x</li>\n</template>\n' +
                '<script setup lang="ts">\nconst items = [];\n</script>\n',
        );
        assert.equal(reports.length, 1);
        // The `<li` starts on template line 2, column 5 (4-space indent).
        assert.match(reports[0].message, /^\[template 2:5\] /);
        assert.match(reports[0].message, /v-for without a :key/);
    });

    it("returns no visitor for non-.vue files (the rule is registered globally)", () => {
        const visitor = rule.create({ filename: "foo.ts", options: undefined, report() {} });
        assert.deepEqual(Object.keys(visitor), []);
    });

    it("does nothing for a script-only SFC (no template AST)", () => {
        assert.equal(lintSource('<script setup lang="ts">\nconst x = 1;\n</script>\n').length, 0);
    });

    it("still prefixes the position when <script setup> is EMPTY", () => {
        // Regression: an empty script block makes @vue/compiler-sfc report `scriptSetup` as null.
        // Reading that as offset 0 silently took the range path with the file offset unadjusted,
        // dropping the real template position from the message.
        const reports = lintSource(
            '<template>\n    <li v-for="r in rows" />\n</template>\n<script setup lang="ts"></script>\n',
        );
        assert.equal(reports.length, 1);
        assert.match(reports[0].message, /\[template 2:5\]/);
    });
});
