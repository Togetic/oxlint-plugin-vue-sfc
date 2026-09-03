import {
    NODE_ELEMENT,
    PROP_ATTRIBUTE,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "oxlint-vue-sfc-harness";

/**
 * Replacement for `vue/no-duplicate-attributes` (no native oxlint equivalent — oxc#15761).
 *
 * Two attributes with the same name on one element: the browser/compiler keeps one and
 * drops the other silently, so the dropped one is dead code that reads as live. Usually a
 * bad merge or a copy-paste.
 *
 * Name resolution, and why it is not just `prop.name`:
 * - A static attribute contributes its own name (`class`, `id`).
 * - A `v-bind` directive contributes its ARGUMENT (`:class` → `class`), not "bind".
 * - `v-bind="obj"` (no argument) is a spread; it has no single name and is skipped.
 * - Non-bind directives (`v-if`, `v-on`, `v-model`) are out of scope: duplicates there
 *   mean different things (two `@click` handlers both fire) and belong to other rules.
 *
 * `class` and `style` are deliberately exempt from the static+bound pair, matching
 * eslint-plugin-vue's `allowCoexistClass`/`allowCoexistStyle` defaults: Vue MERGES
 * `class="a" :class="b"` rather than dropping one, so it is idiomatic, not a bug. Two
 * static `class` attributes, or two bound `:class`, are still flagged — merging only
 * applies across the static/bound boundary.
 */

const MERGEABLE = new Set(["class", "style"]);

/** Resolved attribute name for duplicate purposes, or null when it has none. */
function attributeName(prop) {
    if (prop.type === PROP_ATTRIBUTE) {
        return prop.name;
    }
    if (
        prop.type === PROP_DIRECTIVE &&
        prop.name === "bind" &&
        prop.arg?.type === 4 /* SIMPLE_EXPRESSION */ &&
        prop.arg.isStatic !== false
    ) {
        return prop.arg.content;
    }
    return null;
}

export default {
    meta: {
        type: "problem",
        docs: {
            description: "disallow duplication of attributes on the same element",
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
                const ast = entry.descriptor.template?.ast;
                if (!ast) {
                    return;
                }
                walkTemplate(ast, (node) => {
                    if (node.type !== NODE_ELEMENT) {
                        return;
                    }
                    // Track static and bound occurrences separately so the class/style
                    // merge exemption can apply across the boundary but not within it.
                    const seen = new Map();
                    for (const prop of node.props ?? []) {
                        const name = attributeName(prop);
                        if (name === null) {
                            continue;
                        }
                        const isStatic = prop.type === PROP_ATTRIBUTE;
                        const bucket = seen.get(name);
                        if (!bucket) {
                            seen.set(name, { static: isStatic, bound: !isStatic });
                            continue;
                        }
                        const sameKind = isStatic ? bucket.static : bucket.bound;
                        const exempt = MERGEABLE.has(name) && !sameKind;
                        if (!exempt) {
                            reportAtFileOffset(
                                context,
                                entry,
                                prop.loc.start.offset,
                                prop.loc.end.offset,
                                `Duplicate attribute \`${name}\` on <${node.tag}>. Only one survives compilation, so the other is silently ignored.`,
                            );
                        }
                        bucket.static ||= isStatic;
                        bucket.bound ||= !isStatic;
                    }
                });
            },
        };
    },
};
