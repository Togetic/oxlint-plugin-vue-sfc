import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseSync } from "oxc-parser";

/**
 * Shared harness for custom-plugin rule specs.
 *
 * The first two rule specs (vue-no-raw-text, tailwind-no-unknown-classes) each carry their
 * own copy of this boilerplate. That was fine at two; the Vue-template port adds ~20 more
 * rule specs, so the copies are extracted here instead. Deliberately NOT named `*.spec.mjs`
 * (the test glob would run it as an empty suite) and deliberately NOT imported by index.mjs
 * (oxlint loads that, and this pulls in node:os/fs for temp files).
 *
 * Rules under test read the SFC off disk via parseSfc(context.filename), so specs need a real
 * file — hence temp files rather than in-memory strings.
 */

let counter = 0;

/**
 * Harness for SCRIPT-side rules (those that use oxlint's real script AST via `Program(node)`
 * rather than self-parsing the SFC). Parsed with `oxc-parser` — the same parser oxlint uses —
 * so the AST shape the spec exercises matches the one the rule sees in production.
 */
export function createScriptLinter(rule) {
    /** Lint a `<script setup>` body. Returns the reports, each with its node. */
    function lintScript(source) {
        const { program } = parseSync("spec.ts", source, { sourceType: "module" });
        const reports = [];
        rule.create({
            filename: "spec.vue",
            options: undefined,
            report: (d) => reports.push(d),
        }).Program?.(program);
        return reports;
    }
    return { lintScript };
}

/**
 * Harness for CORRELATION rules — those that need both halves of the SFC: the template (read off
 * disk by `parseSfc(context.filename)`) and the script AST (handed in via `Program(node)`).
 * Writes a real temp `.vue` file AND parses its `<script setup>` block with oxc-parser, so the
 * rule sees the same pair it sees in production.
 */
export function createSfcLinter(rule, prefix) {
    const tmpFiles = [];

    function lintSfc(source) {
        const filename = path.join(os.tmpdir(), `${prefix}-${process.pid}-${counter++}.vue`);
        fs.writeFileSync(filename, source, "utf8");
        tmpFiles.push(filename);
        // Extract the script block the way oxlint does, so offsets and content match.
        const match = /<script[^>]*>([\s\S]*?)<\/script>/.exec(source);
        const { program } = parseSync("spec.ts", match ? match[1] : "", {
            sourceType: "module",
        });
        const reports = [];
        rule.create({
            filename,
            options: undefined,
            report: (d) => reports.push(d),
        }).Program?.(program);
        return reports;
    }

    function cleanup() {
        while (tmpFiles.length) {
            try {
                fs.unlinkSync(tmpFiles.pop());
            } catch {
                // best-effort temp cleanup
            }
        }
    }

    return { lintSfc, cleanup };
}

/**
 * Build a lint harness bound to one rule.
 * @param rule the rule module's default export
 * @param prefix short slug used in temp filenames, to keep parallel runs distinct
 */
export function createLinter(rule, prefix) {
    const tmpFiles = [];

    /**
     * Lint an arbitrary SFC source. Use this when a test needs control over block order —
     * e.g. a template-first SFC with a non-empty script (the repo norm), the only layout
     * that exercises reportAtFileOffset's negative-offset [template L:C] path.
     */
    function lintSource(source, options) {
        const filename = path.join(os.tmpdir(), `${prefix}-${process.pid}-${counter++}.vue`);
        fs.writeFileSync(filename, source, "utf8");
        tmpFiles.push(filename);
        const reports = [];
        rule.create({ filename, options, report: (d) => reports.push(d) }).Program?.();
        return reports;
    }

    /** Lint `templateInner` inside a minimal script-first SFC (positions stay positive). */
    function lintTemplate(templateInner, options) {
        return lintSource(
            `<script setup lang="ts"></script>\n<template>\n    ${templateInner}\n</template>\n`,
            options,
        );
    }

    /** Pass to `afterEach`. Best-effort temp cleanup. */
    function cleanup() {
        while (tmpFiles.length) {
            try {
                fs.unlinkSync(tmpFiles.pop());
            } catch {
                // best-effort temp cleanup
            }
        }
    }

    return { lintSource, lintTemplate, cleanup };
}
