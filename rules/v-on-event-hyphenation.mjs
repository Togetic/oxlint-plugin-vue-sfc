import {
    ELEMENT_COMPONENT,
    NODE_ELEMENT,
    PROP_DIRECTIVE,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/v-on-event-hyphenation` (no native oxlint equivalent — oxc#15761).
 *
 * In-DOM templates lower-case attribute names, so `@myEvent` becomes `@myevent` and silently
 * stops matching an `emit("myEvent")`. Hyphenated `@my-event` survives that normalization and
 * Vue maps it back to the camelCase emit. Keeping one convention also stops the same event
 * being listened to two ways in different files.
 *
 * Scope, deliberately narrow to avoid false positives:
 * - COMPONENTS only (parser `tagType`, not a casing heuristic). Native DOM events are all
 *   lowercase already, and a custom element's events are not Vue's to rename.
 * - Static event names only. `@[dynamic]` cannot be checked without evaluating the expression.
 * - `v-on="obj"` (argument-less) has no single name and is skipped.
 *
 * This is `warn` upstream in our config, and stays `warn`: it is a convention with a real
 * failure mode rather than a guaranteed bug, since SFC templates are not DOM-parsed.
 */

/** camelCase / PascalCase detection: any uppercase letter in the event name. */
const HAS_UPPER = /[A-Z]/;

function hyphenate(name) {
    return name.replace(/\B([A-Z])/g, "-$1").toLowerCase();
}

export default {
    meta: {
        type: "suggestion",
        docs: {
            description: "enforce `v-on` event naming style on custom components in template",
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
                walkTemplate(ast, (node) => {
                    if (node.type !== NODE_ELEMENT || node.tagType !== ELEMENT_COMPONENT) {
                        return;
                    }
                    for (const prop of node.props ?? []) {
                        if (prop.type !== PROP_DIRECTIVE || prop.name !== "on") {
                            continue;
                        }
                        const arg = prop.arg;
                        // Argument-less `v-on="obj"`, or a dynamic `@[name]` — nothing static
                        // to judge.
                        if (!arg || arg.type !== 4 /* SIMPLE_EXPRESSION */ || arg.isStatic === false) {
                            continue;
                        }
                        const name = arg.content;
                        if (!HAS_UPPER.test(name)) {
                            continue;
                        }
                        // Anchor on the whole directive so the column lands on the `@`/`v-on`,
                        // matching eslint-plugin-vue (verified at exact column parity).
                        reportAtFileOffset(
                            context,
                            entry,
                            prop.loc.start.offset,
                            prop.loc.end.offset,
                            `Use \`@${hyphenate(name)}\` instead of \`@${name}\` on <${node.tag}>: in-DOM templates lower-case attribute names, so the camelCase form silently stops matching the emit.`,
                        );
                    }
                });
            },
        };
    },
};
