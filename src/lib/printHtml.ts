/**
 * RC11: imprime HTML gerado pelo servidor num iframe sandboxed (sem allow-scripts), em vez de abrir um blob URL
 * na origem da aplicacao. Nenhum script contido no HTML corre, e o documento nao acede a sessao guardada.
 */
export function printHtmlSandboxed(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 60_000);
    }
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
