import type { CSSProperties } from 'react';

const containerStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid rgba(23, 23, 19, 0.12)',
  borderRadius: 18,
  marginTop: 10,
  overflow: 'hidden',
  width: '100%',
};

const frameStyle: CSSProperties = {
  border: 0,
  display: 'block',
  height: 'min(760px, 172vw)',
  minHeight: 620,
  width: '100%',
};

export function InstagramSourceViewer({ sourceUrl }: { onDismiss: () => void; sourceUrl: string }) {
  return (
    <div style={containerStyle}>
      <iframe
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        src={sourceUrl}
        style={frameStyle}
        title="Original Instagram Reel"
      />
    </div>
  );
}
