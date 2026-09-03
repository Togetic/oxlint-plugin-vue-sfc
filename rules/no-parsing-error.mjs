import { parseSfc, reportAtFileOffset } from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/no-parsing-error` (no native oxlint equivalent — oxc#15761).
 *
 * Uniquely cheap among the ported rules: we already run `@vue/compiler-sfc`'s parser to get
 * the template AST, and it already collects every syntax error it recovered from. This rule
 * is just surfacing `errors` instead of discarding them — no traversal, no heuristics.
 *
 * Why it earns its place rather than being redundant with the build: the compiler RECOVERS
 * from these and carries on, so a malformed attribute or an unclosed tag can ship silently
 * and only show up as markup that renders slightly wrong. Reporting at lint time makes it a
 * gate instead of a surprise.
 *
 * Errors without a location are still reported, anchored at the start of the file rather
 * than dropped — a parse error we cannot place is more important to surface, not less.
 */

export default {
    meta: {
        type: "problem",
        docs: {
            description: "disallow parsing errors in `<template>`",
            recommended: true,
        },
        schema: [],
        messages: { m: "" },
    },
    create(context) {
        if (!context.filename.endsWith(".vue")) {
            return {};
        }
        return {
            Program() {
                const entry = parseSfc(context.filename);
                for (const error of entry.errors ?? []) {
                    const start = error.loc?.start?.offset ?? 0;
                    const end = error.loc?.end?.offset ?? start + 1;
                    const message = error.message ?? String(error);
                    reportAtFileOffset(
                        context,
                        entry,
                        start,
                        end,
                        `Vue template parsing error: ${message} The compiler recovers from this, so it can ship as subtly wrong markup rather than a build failure.`,
                    );
                }
            },
        };
    },
};
