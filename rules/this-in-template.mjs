import { eachTemplateExpression, parseSfc, reportAtFileOffset } from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/this-in-template` (no native oxlint equivalent — oxc#15761).
 *
 * Template expressions are already evaluated against the component instance, so `{{ this.x }}`
 * is at best redundant. In `<script setup>` it is worse than redundant: there is no `this`
 * bound the way an Options API component has one, so `this.x` reads from the wrong object (or
 * `undefined`) while looking correct. It is a common artefact of pasting Options API code.
 *
 * Detection strips string literals before testing, which matters more than it sounds: a naive
 * `\bthis\b` scan flags `:title="'use this instead'"` — user-facing copy containing the word
 * "this" is common, and a rule that reports prose gets turned off. Template literals are
 * stripped too, but their `${...}` substitutions are KEPT, since real `this` can hide there.
 *
 * Reduced scope vs eslint-plugin-vue: this is a lexical scan, not an AST walk, so it cannot
 * tell `this.x` from a `this` inside a nested arrow function that legitimately rebinds it.
 * In a template expression that distinction is vanishingly rare, and the failure mode is a
 * false positive on `@click="() => this.x"` — which is itself the pattern the rule targets.
 * Documented rather than silently approximated; see OXLINT_MIGRATION.md.
 */

/**
 * Blank out the CONTENTS of string literals AND comments, preserving length so offsets stay
 * valid. Template-literal `${...}` substitutions are preserved (real `this` can live there).
 *
 * Comments are not a hypothetical: this repo has a `v-if` whose multi-line `/* … *\/` comment
 * explains tab behaviour in prose containing the word "this". Scanning it produced the rule's
 * only corpus hit, and it was entirely spurious.
 */
function stripStringContents(source) {
    const out = [...source];
    let quote = null;
    let depth = 0;
    let comment = null; // "line" | "block" | null
    for (let i = 0; i < out.length; i += 1) {
        const ch = out[i];
        if (comment === "line") {
            out[i] = " ";
            continue;
        }
        if (comment === "block") {
            if (ch === "*" && out[i + 1] === "/") {
                out[i] = " ";
                out[i + 1] = " ";
                i += 1;
                comment = null;
                continue;
            }
            out[i] = " ";
            continue;
        }
        if (quote === null) {
            if (ch === "/" && out[i + 1] === "/") {
                comment = "line";
                out[i] = " ";
                continue;
            }
            if (ch === "/" && out[i + 1] === "*") {
                comment = "block";
                out[i] = " ";
                out[i + 1] = " ";
                i += 1;
                continue;
            }
            if (ch === "'" || ch === '"' || ch === "`") {
                quote = ch;
            }
            continue;
        }
        if (ch === "\\") {
            // Blank the escape pair so `\'` cannot be mistaken for a terminator.
            out[i] = " ";
            if (i + 1 < out.length) {
                out[i + 1] = " ";
            }
            i += 1;
            continue;
        }
        if (quote === "`" && ch === "$" && out[i + 1] === "{") {
            depth += 1;
            i += 1;
            continue;
        }
        if (depth > 0) {
            if (ch === "}") {
                depth -= 1;
            }
            continue; // inside ${...}: keep it intact
        }
        if (ch === quote) {
            quote = null;
            continue;
        }
        out[i] = " ";
    }
    return out.join("");
}

const THIS_RE = /\bthis\b/;

export default {
    meta: {
        type: "suggestion",
        docs: {
            description: "disallow usage of `this` in template",
            recommended: false,
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
                const ast = entry.descriptor.template?.ast;
                if (!ast) {
                    return;
                }
                eachTemplateExpression(ast, (expression) => {
                    const source = expression.content ?? "";
                    const match = THIS_RE.exec(stripStringContents(source));
                    if (!match) {
                        return;
                    }
                    const start = expression.loc.start.offset + match.index;
                    reportAtFileOffset(
                        context,
                        entry,
                        start,
                        start + 4,
                        "`this` is unnecessary in a template expression — bindings are already resolved against the component. Under `<script setup>` it does not refer to the setup state at all.",
                    );
                });
            },
        };
    },
};
