import { useState } from 'react';

interface Props {
  value: string;
  /** When set, offers a .txt download with this file name. */
  downloadName?: string;
  downloadText?: string;
}

export function SecretBox({ value, downloadName, downloadText }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob([downloadText ?? value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName!;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="secret-box">
      <code className="secret-value clay-inset">{value}</code>
      <div className="form-actions center">
        <button type="button" className="clay-btn" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
        {downloadName && (
          <button type="button" className="clay-btn" onClick={download}>Download .txt</button>
        )}
      </div>
    </div>
  );
}
