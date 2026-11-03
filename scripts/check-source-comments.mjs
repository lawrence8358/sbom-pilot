import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(path));
    else if (entry.name.endsWith('.ts')) result.push(path);
  }
  return result;
}

// 取得具名常數自行實作的函式，也涵蓋注入介面的 ?? fallback。
function callableBody(node) {
  if (!node) return;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
  if (ts.isParenthesizedExpression(node)) return callableBody(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    return callableBody(node.right);
  }
}

// 依 AST 找到實際具名函式體，排除只有型別的宣告及短匿名回呼。
function implementation(node, source) {
  if (ts.isFunctionDeclaration(node) && node.body && node.name) {
    return { name: node.name.text, body: node, anchor: node };
  }
  if ((ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
       ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.body) {
    return { name: node.name?.getText(source) ?? 'constructor', body: node, anchor: node };
  }
  if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) && node.initializer &&
      callableBody(node.initializer)) {
    const anchor = ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent) &&
      ts.isVariableStatement(node.parent.parent) ? node.parent.parent : node;
    return { name: node.name.getText(source), body: callableBody(node.initializer), anchor };
  }
}

// 計算本函式自己的分支；巢狀實作另列，避免把拆分後的責任重複計算。
function decisions(body) {
  let count = 1;
  function visit(node) {
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForOfStatement(node) ||
        ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) ||
        ts.isCaseClause(node) || ts.isCatchClause(node) || ts.isConditionalExpression(node) ||
        (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind))) count++;
    ts.forEachChild(node, visit);
  }
  visit(body);
  return count;
}

const inventory = [];
for (const file of await sourceFiles('src')) {
  const text = await readFile(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    const found = implementation(node, source);
    if (found) {
      const ranges = ts.getLeadingCommentRanges(text, found.anchor.getFullStart()) ?? [];
      const comments = ranges.map(range => text.slice(range.pos, range.end)).join('\n');
      inventory.push({ file: relative('.', file).replaceAll('\\', '/'), name: found.name,
        line: source.getLineAndCharacterOfPosition(found.anchor.getStart(source)).line + 1,
        decisions: decisions(found.body), documented: /[\u3400-\u9fff]/u.test(comments) &&
          comments.replace(/[\s/*]/g, '').length >= 8 });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

if (process.argv.includes('--inventory')) {
  console.log(JSON.stringify(inventory, null, 2));
} else {
  const missing = inventory.filter(item => !item.documented);
  for (const item of missing) console.error(`${item.file}:${item.line} ${item.name} 缺少中文用途註解`);
  console.log(`Source comments: ${inventory.length - missing.length}/${inventory.length} named implementations documented.`);
  if (missing.length) process.exitCode = 1;
}
