#!/usr/bin/env node
/*
 * check-jsx-defined.cjs — build guard against the "icon/component not imported" crash class.
 *
 * Scans every .jsx/.js under client/src, parses it, and fails (exit 1) if any JSX element
 * whose tag starts with an uppercase letter (i.e. a component, not a DOM intrinsic) is used
 * without being imported or declared in that file. This is the exact bug that took down
 * AddAllocation ("Calculator is not defined"), Alerts/AssetScan ("Tooltip"), AddServiceProvider
 * ("Users"), etc. — a ReferenceError at render that a user only hits when they open the page.
 *
 * Dependency-free: uses @babel/parser, already a project dependency. No eslint-plugin-react.
 * Run: node scripts/check-jsx-defined.cjs   (wired into `npm run check:jsx` and CI ui-tests)
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..', 'src');

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx|js)$/.test(e.name)) files.push(p);
  }
})(ROOT);

// Names that are always available in the JSX runtime / are not real components to resolve.
const IMPLICIT = new Set(['React', 'Fragment']);

function bindNames(node, def) {
  if (!node) return;
  switch (node.type) {
    case 'Identifier': def.add(node.name); break;
    case 'ObjectPattern':
      for (const p of node.properties) {
        if (p.type === 'RestElement') bindNames(p.argument, def);
        else bindNames(p.value, def);
      }
      break;
    case 'ArrayPattern':
      for (const el of node.elements) el && bindNames(el, def);
      break;
    case 'AssignmentPattern': bindNames(node.left, def); break;
    case 'RestElement': bindNames(node.argument, def); break;
  }
}

const violations = [];

for (const file of files) {
  let ast;
  try {
    ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    violations.push({ file, name: '(parse error)', detail: e.message.split('\n')[0] });
    continue;
  }
  const defined = new Set();
  const used = {};
  (function visit(node) {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
      case 'ImportDefaultSpecifier':
      case 'ImportSpecifier':
      case 'ImportNamespaceSpecifier':
        if (node.local) defined.add(node.local.name);
        break;
      case 'VariableDeclarator': bindNames(node.id, defined); break;
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        if (node.id) defined.add(node.id.name);
        break;
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        for (const p of node.params || []) bindNames(p, defined);
        break;
      case 'JSXOpeningElement': {
        let n = node.name;
        while (n && n.type === 'JSXMemberExpression') n = n.object; // <Foo.Bar> -> Foo
        if (n && n.type === 'JSXIdentifier' && /^[A-Z]/.test(n.name) && !(n.name in used)) {
          used[n.name] = node.loc && node.loc.start.line;
        }
        break;
      }
    }
    for (const k in node) {
      if (k === 'loc') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  })(ast);

  for (const name in used) {
    if (IMPLICIT.has(name)) continue;
    if (!defined.has(name)) {
      violations.push({ file: path.relative(ROOT, file), name, detail: 'line ' + used[name] });
    }
  }
}

if (violations.length === 0) {
  console.log(`check-jsx-defined: CLEAN — no undefined JSX components across ${files.length} files.`);
  process.exit(0);
}
console.error(`check-jsx-defined: FAILED — ${violations.length} undefined JSX component(s):`);
for (const v of violations) console.error(`  ${v.file}  <${v.name}>  ${v.detail}`);
console.error('\nFix: import or define each component above before using it in JSX.');
process.exit(1);
