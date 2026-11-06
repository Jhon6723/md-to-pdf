export function imageKey(reference: string): string {
  let decoded = reference;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    decoded = reference;
  }
  const base = decoded.split(/[\\/]/).pop() ?? "";
  return base.replace(/[^\w.-]+/g, "_");
}

export function imageMarkdown(name: string): string {
  const alt = name.replace(/\.[^.]+$/, "").replace(/([\\[\]])/g, "\\$1");
  const destination = /[<>\n]/.test(name) ? encodeURIComponent(name) : /[\s()]/.test(name) ? `<${name}>` : name;
  return `![${alt}](${destination})`;
}
