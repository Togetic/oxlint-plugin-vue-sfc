import {
    NODE_ELEMENT,
    NODE_INTERPOLATION,
    parseSfc,
    reportAtFileOffset,
    walkTemplate,
} from "../utils/vue-sfc.mjs";

/**
 * Replacement for `vue/no-textarea-mustache` (no native oxlint equivalent — oxc#15761).
 *
 * `<textarea>{{ value }}</textarea>` does not work the way it reads. The interpolation
 * sets the element's initial child text, but a textarea's displayed value comes from its
 * `value` property, and Vue does not keep the two in sync — so the field stops updating
 * as soon as `value` changes. `v-model` (or `:value`) is the working form.
 *
 * Scope: only interpolations that are DIRECT children of the `<textarea>`. A nested
 * element cannot legally appear inside a textarea, so there is nothing deeper to check,
 * and walking deeper would risk flagging malformed markup twice.
 */

export default {
    meta: {
        type: "problem",
        docs: {
            description: "disallow mustaches in `<textarea>`",
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
                    if (node.type !== NODE_ELEMENT || node.tag !== "textarea") {
                        return;
                    }
                    for (const child of node.children ?? []) {
                        if (child.type !== NODE_INTERPOLATION) {
                            continue;
                        }
                        reportAtFileOffset(
                            context,
                            entry,
                            child.loc.start.offset,
                            child.loc.end.offset,
                            "Interpolation inside `<textarea>` only sets the initial text and then stops tracking the value. Use `v-model` (or `:value`) instead.",
                        );
                    }
                });
            },
        };
    },
};
