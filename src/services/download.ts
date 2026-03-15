export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(href);
  }, 1000);
}

export function downloadText(text: string, filename: string, mimeType = 'application/json;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}
