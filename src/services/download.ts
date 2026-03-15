export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function downloadText(text: string, filename: string, mimeType = 'application/json;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}
