/**
 * Positioned extraction of the variables a Vue template DECLARES — `v-for` aliases and `v-slot`
 * destructuring — shared by vue-no-unused-vars and vue-no-template-shadow.
 *
 * `utils/vue-sfc.mjs` already has `extractBindingNames`, but it returns names only and bails on
 * any pattern containing `:` or `=`. Both rules here need the OFFSET of each binding (reports
 * anchor on the identifier itself) and need to handle renames and defaults, so this is a
 * separate, more capable extractor rather than a change to that one.
 *
 * It is a positioned scan, not a real pattern parse: identifiers in the alias text, minus those
 * immediately followed by `:` (object-pattern KEYS, where the binding is the right-hand name).
 * That covers `item`, `(item, i)`, `{ a, b }`, `[a, b]`, `{ a: renamed }` and `{ a = 1 }` —
 * every shape in this codebase.
 */

const IDENTIFIER_RE = /[A-Za-z_$][\w$]*/g;
/** Words that can appear in alias text but are never bindings. */
const RESERVED = new Set(["in", "of", "true", "false", "null", "undefined"]);

/**
 * Identifiers bound by a `v-for` alias / `v-slot` pattern, with offsets inside `text`.
 * @returns {{name: string, offset: number}[]}
 */
export function bindingsWithOffsets(text) {
    const found = [];
    IDENTIFIER_RE.lastIndex = 0;
    let match = IDENTIFIER_RE.exec(text);
    while (match !== null) {
        const name = match[0];
        const isKey = /^\s*:/.test(text.slice(match.index + name.length));
        if (!isKey && !RESERVED.has(name)) {
            found.push({ name, offset: match.index });
        }
        match = IDENTIFIER_RE.exec(text);
    }
    return found;
}

/** The left-hand alias portion of a `v-for` expression. Returns null if there is no `in`/`of`. */
export function forAliasPart(content) {
    const match = /\s+(?:in|of)\s+/.exec(content);
    if (!match) {
        return null;
    }
    return { text: content.slice(0, match.index), offset: 0 };
}

/**
 * Split a `v-for` alias list into its positional groups, each with its offset in `text`.
 * `(a, i)` -> two groups; `({ a }, i)` -> two, the first a destructuring pattern.
 * Splits only on top-level commas, so nested `{}` / `[]` / `()` stay intact.
 */
export function positionalGroups(text) {
    const trimmed = text.trim();
    const lead = text.indexOf(trimmed);
    const wrapped = trimmed.startsWith("(") && trimmed.endsWith(")");
    const inner = wrapped ? trimmed.slice(1, -1) : trimmed;
    const base = lead + (wrapped ? 1 : 0);

    const groups = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < inner.length; i += 1) {
        const ch = inner[i];
        if (ch === "{" || ch === "[" || ch === "(") {
            depth += 1;
        } else if (ch === "}" || ch === "]" || ch === ")") {
            depth -= 1;
        } else if (ch === "," && depth === 0) {
            groups.push({ text: inner.slice(start, i), offset: base + start });
            start = i + 1;
        }
    }
    groups.push({ text: inner.slice(start), offset: base + start });
    return groups;
}

/**
 * The alias text a directive declares, or null if it declares nothing.
 * `v-for` yields its left-hand side; `v-slot` yields its whole expression.
 */
export function declaredAlias(prop) {
    if (!prop.exp?.content) {
        return null;
    }
    if (prop.name === "for") {
        return forAliasPart(prop.exp.content);
    }
    if (prop.name === "slot") {
        return { text: prop.exp.content, offset: 0 };
    }
    return null;
}

/**
 * Top-level binding names declared by a `<script setup>` program — everything the template can
 * reference. Used by vue-no-template-shadow to know what a template alias would shadow.
 */
export function scriptTopLevelNames(program) {
    const names = new Set();
    const addPattern = (pattern) => {
        if (!pattern || typeof pattern !== "object") {
            return;
        }
        switch (pattern.type) {
            case "Identifier":
                names.add(pattern.name);
                break;
            case "ObjectPattern":
                for (const property of pattern.properties ?? []) {
                    addPattern(property.value ?? property.argument);
                }
                break;
            case "ArrayPattern":
                for (const element of pattern.elements ?? []) {
                    addPattern(element);
                }
                break;
            case "AssignmentPattern":
                addPattern(pattern.left);
                break;
            case "RestElement":
                addPattern(pattern.argument);
                break;
            default:
                break;
        }
    };
    for (const statement of program?.body ?? []) {
        switch (statement.type) {
            case "VariableDeclaration":
                for (const declarator of statement.declarations ?? []) {
                    addPattern(declarator.id);
                }
                break;
            case "FunctionDeclaration":
            case "ClassDeclaration":
                if (statement.id?.type === "Identifier") {
                    names.add(statement.id.name);
                }
                break;
            case "ImportDeclaration":
                for (const specifier of statement.specifiers ?? []) {
                    if (specifier.local?.type === "Identifier") {
                        names.add(specifier.local.name);
                    }
                }
                break;
            default:
                break;
        }
    }
    return names;
}
