import fs from "node:fs";

import { parse } from "@vue/compiler-sfc";

/**
 * Helpers for writing oxlint JS-plugin rules against the Vue TEMPLATE AST.
 *
 * oxlint parses only the script block of an SFC and gives JS-plugin rules a
 * script-only view: `context.sourceCode.text` is the script content and
 * line/column locations passed to `context.report()` are validated against the
 * script's line count (template lines are rejected with a RangeError).
 *
 * Two empirically verified escape hatches make template rules possible anyway:
 * 1. `fs.readFileSync(context.filename)` works inside the sidecar, so a rule
 *    can parse the FULL SFC with @vue/compiler-sfc.
 * 2. `context.report({ node: { range: [start, end] } })` accepts raw
 *    script-relative byte offsets WITHOUT line validation and maps them to
 *    file positions by adding the script block's offset. A template offset is
 *    therefore reachable only as `fileOffset - scriptStartOffset` when that is
 *    >= 0 — i.e. when <script> precedes <template>.
 *
 * THIS REPO IS ENTIRELY THE OPPOSITE: every SFC is template-first (verified:
 * 1414 template-first, 0 script-first), so template offsets are always
 * NEGATIVE. oxlint rejects negative ranges (and rejects line/column that fall
 * outside the script block), so a template diagnostic CANNOT be rendered on
 * its real template line — the code frame always falls back to the script
 * block's first line (see reportAtFileOffset). This is an inherent limit of
 * oxlint's script-only JS-plugin view of .vue files, not a bug we can fix
 * here; we surface the true template line:column in the message text instead.
 */

// One parse per file per lint run, shared across rules (module state lives for
// the lifetime of oxlint's JS-plugin sidecar process).
const cache = new Map();

export function parseSfc(filename) {
    let entry = cache.get(filename);
    if (!entry) {
        const text = fs.readFileSync(filename, "utf8");
        const { descriptor, errors } = parse(text, { filename });
        entry = { text, descriptor, errors };
        cache.set(filename, entry);
    }
    return entry;
}

/** Script block content start offset in the file (script setup preferred). */
export function scriptStartOffset(descriptor) {
    const block = descriptor.scriptSetup ?? descriptor.script;
    return block ? block.loc.start.offset : 0;
}

/**
 * Report a diagnostic at an absolute FILE offset range by translating it into
 * the script-relative range oxlint expects. Template positions BEFORE the
 * script block can't be represented as ranges (negative offsets) — the norm in
 * this template-first repo — so those fall back to the script block's first
 * line with the real template line:column PREPENDED to the message, so the
 * editor's problem list and the CLI still point you at the right place even
 * though the squiggle is stuck on the script block.
 */
export function reportAtFileOffset(context, entry, fileStart, fileEnd, message) {
    const base = scriptStartOffset(entry.descriptor);
    const start = fileStart - base;
    if (start >= 0) {
        context.report({
            node: { type: "TemplateDiagnostic", range: [start, fileEnd - base] },
            message,
        });
        return;
    }
    const before = entry.text.slice(0, fileStart);
    const line = before.split("\n").length;
    const column = fileStart - (before.lastIndexOf("\n") + 1) + 1;
    context.report({
        node: { type: "TemplateDiagnostic", range: [0, 1] },
        message: `[template ${line}:${column}] ${message}`,
    });
}

/** Depth-first walk over @vue/compiler-dom template AST element nodes. */
export function walkTemplate(node, visit) {
    if (!node) {
        return;
    }
    visit(node);
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            walkTemplate(child, visit);
        }
    }
    // v-if/v-else chains parsed standalone keep branches as siblings, but walk
    // branches too in case a transformed AST is ever passed in.
    if (Array.isArray(node.branches)) {
        for (const branch of node.branches) {
            walkTemplate(branch, visit);
        }
    }
}

/** @vue/compiler-dom NodeTypes used by rules (avoid importing internals). */
export const NODE_ELEMENT = 1;
export const NODE_TEXT = 2;
export const NODE_INTERPOLATION = 5;
export const PROP_ATTRIBUTE = 6;
export const PROP_DIRECTIVE = 7;
/** @vue/compiler-dom ElementTypes.COMPONENT */
export const ELEMENT_COMPONENT = 1;

/**
 * Visit every expression in the template: interpolations (directiveName null)
 * and directive expressions (directiveName e.g. "model", "bind", "if").
 */
export function eachTemplateExpression(ast, visit) {
    walkTemplate(ast, (node) => {
        if (node.type === NODE_INTERPOLATION && node.content?.content) {
            visit(node.content, null);
        }
        if (node.type === NODE_ELEMENT) {
            for (const p of node.props ?? []) {
                if (p.type === PROP_DIRECTIVE && p.exp?.content) {
                    visit(p.exp, p.name);
                }
            }
        }
    });
}

export function findDirective(el, name) {
    return el.props?.find((p) => p.type === PROP_DIRECTIVE && p.name === name);
}

export function findKeyProp(el) {
    return el.props?.find(
        (p) =>
            (p.type === PROP_ATTRIBUTE && p.name === "key") ||
            (p.type === PROP_DIRECTIVE &&
                p.name === "bind" &&
                p.arg?.type === 4 /* SIMPLE_EXPRESSION */ &&
                p.arg.content === "key"),
    );
}

/**
 * Extract variable names bound by a v-for / v-slot expression ("item",
 * "(item, index)", "{ row }"). Returns null for shapes with renames or
 * defaults (`{ a: b }`, `{ a = 1 }`) — identifying which side is the binding
 * needs a real parser, and a wrong guess produces false positives downstream.
 */
export function extractBindingNames(exprText) {
    const left = exprText.split(/\s+(?:in|of)\s+/)[0] ?? exprText;
    if (/[:=]/.test(left)) {
        return null;
    }
    const names = [...left.matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]);
    return names.length ? names : null;
}

/**
 * Collect every identifier bound by a JS destructuring pattern
 * (`a`, `{ a, b }`, `[a, b]`, `a = 1`, `...rest`) into `into`. Script-side rules use
 * this to know which names a declaration / parameter / catch clause introduces.
 */
export const collectPatternNames = (pattern, into) => {
    if (!pattern) {
        return;
    }
    switch (pattern.type) {
        case "Identifier":
            into.add(pattern.name);
            break;
        case "ObjectPattern":
            for (const p of pattern.properties ?? []) {
                collectPatternNames(p.value ?? p.argument, into);
            }
            break;
        case "ArrayPattern":
            for (const el of pattern.elements ?? []) {
                collectPatternNames(el, into);
            }
            break;
        case "AssignmentPattern":
            collectPatternNames(pattern.left, into);
            break;
        case "RestElement":
            collectPatternNames(pattern.argument, into);
            break;
        default:
            break;
    }
};

