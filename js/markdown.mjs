export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function safeUrl(url, resolveLink) {
  const trimmed = String(url || "").trim();
  if (!trimmed || /^\s*javascript:/i.test(trimmed) || /^\s*data:/i.test(trimmed) || /^\s*vbscript:/i.test(trimmed)) {
    return null;
  }
  if (trimmed.startsWith("#/")) return trimmed;
  if (trimmed.startsWith("#")) return trimmed;
  const resolved = resolveLink ? resolveLink(trimmed) : trimmed;
  if (resolved.startsWith("#/")) return resolved;
  if (/^[a-z]+:/i.test(resolved) && !/^https?:/i.test(resolved)) return null;
  if (/^https?:\/\//i.test(resolved)) return resolved;
  if (resolved.startsWith("/") || resolved.startsWith("./") || resolved.startsWith("../") || /^[\w./-]+$/.test(resolved)) {
    return resolved;
  }
  return null;
}

function renderInline(raw, resolveLink) {
  const re = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  const parts = [];
  let last = 0;
  let match;
  while ((match = re.exec(raw))) {
    parts.push(escapeHtml(raw.slice(last, match.index)));
    if (match[1]) {
      parts.push(`<code>${escapeHtml(match[1].slice(1, -1))}</code>`);
    } else if (match[2]) {
      const url = safeUrl(match[4], resolveLink);
      const text = escapeHtml(match[3]);
      parts.push(url ? `<a href="${escapeHtml(url)}">${text}</a>` : text);
    } else if (match[5]) {
      parts.push(`<strong>${escapeHtml(match[6])}</strong>`);
    } else if (match[7]) {
      parts.push(`<em>${escapeHtml(match[8])}</em>`);
    }
    last = match.index + match[0].length;
  }
  parts.push(escapeHtml(raw.slice(last)));
  return parts.join("");
}

function isTableLine(line) {
  return line.trim().startsWith("|");
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isDividerRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function renderMarkdown(source, options = {}) {
  const resolveLink = options.resolveLink;
  const offset = options.headingOffset || 0;
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(6, heading[1].length + offset);
      blocks.push(`<h${level}>${renderInline(heading[2], resolveLink)}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }
    if (isTableLine(line)) {
      const rows = [];
      while (index < lines.length && isTableLine(lines[index])) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      if (rows.length >= 2 && isDividerRow(rows[1])) {
        const head = rows[0].map((cell) => `<th>${renderInline(cell, resolveLink)}</th>`).join("");
        const body = rows.slice(2).map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, resolveLink)}</td>`).join("")}</tr>`).join("");
        blocks.push(`<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      } else {
        blocks.push(`<p>${rows.map((row) => renderInline(row.join(" | "), resolveLink)).join("<br>")}</p>`);
      }
      continue;
    }
    if (line.startsWith(">")) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote><p>${quote.map((item) => renderInline(item, resolveLink)).join("<br>")}</p></blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^[-*]\s+/, ""), resolveLink)}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\d+\.\s+/, ""), resolveLink)}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() !== "" && !/^(#{1,6}\s|```|>|[-*]\s+|\d+\.\s+)/.test(lines[index]) && !isTableLine(lines[index]) && !/^(-{3,}|\*{3,})$/.test(lines[index].trim())) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(" "), resolveLink)}</p>`);
  }
  return blocks.join("\n");
}
