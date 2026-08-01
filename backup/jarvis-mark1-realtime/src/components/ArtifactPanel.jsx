import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

function MermaidChart({ code }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !code) return;
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    mermaid.render(id, code).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch(() => {
      if (ref.current) ref.current.textContent = code;
    });
  }, [code]);

  return <div ref={ref} className="mermaid-container" />;
}

function WebResults({ content }) {
  let results = [];
  try { results = JSON.parse(content); } catch { /* empty */ }
  return (
    <ul className="web-results">
      {results.map((r, i) => (
        <li key={i}>
          <strong>{r.title}</strong>
          {r.url && <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a>}
          <p>{r.snippet}</p>
        </li>
      ))}
    </ul>
  );
}

function DataTable({ content }) {
  let rows = [];
  try { rows = JSON.parse(content); } catch { /* empty */ }
  if (!rows.length) return <p>No rows</p>;
  const cols = Object.keys(rows[0]);
  return (
    <table className="data-table">
      <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{cols.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function NotesList({ content }) {
  let notes = [];
  try { notes = JSON.parse(content); } catch { /* empty */ }
  return (
    <ul className="notes-list">
      {notes.map((n) => (
        <li key={n.id}>
          <span className="note-emoji">{n.emoji || '📝'}</span>
          <div>
            <strong>{n.title}</strong>
            <p>{n.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TaskProgress({ content }) {
  let tasks = [];
  try { tasks = JSON.parse(content); } catch { tasks = [{ label: content, done: false }]; }
  return (
    <ul className="task-list">
      {tasks.map((t, i) => (
        <li key={i} className={t.done ? 'done' : ''}>
          <span className="task-check">{t.done ? '✓' : '○'}</span> {t.label || t}
        </li>
      ))}
    </ul>
  );
}

function ArtifactCard({ artifact }) {
  const { type, title, content, language } = artifact;

  return (
    <article className={`artifact-card type-${type}`}>
      <header><h3>{title}</h3><span className="type-badge">{type}</span></header>
      <div className="artifact-body">
        {type === 'image' && (
          <img src={content.startsWith('file://') ? content : content} alt={title} className="artifact-image" />
        )}
        {type === 'mermaid' && <MermaidChart code={content} />}
        {type === 'web_results' && <WebResults content={content} />}
        {type === 'table' && <DataTable content={content} />}
        {type === 'notes_list' && <NotesList content={content} />}
        {type === 'task_progress' && <TaskProgress content={content} />}
        {type === 'code' && (
          <pre><code className={language ? `language-${language}` : ''}>{content}</code></pre>
        )}
        {(type === 'markdown' || type === 'text' || type === 'note') && (
          <ReactMarkdown>{content}</ReactMarkdown>
        )}
        {type === 'menu' && (
          <ul className="menu-list">
            {(content.split('\n').filter(Boolean)).map((item, i) => (
              <li key={i}>{item.replace(/^[-*]\s*/, '')}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export default function ArtifactPanel({ artifacts }) {
  if (!artifacts.length) {
    return (
      <div className="artifact-empty">
        <p>Nothing here yet.</p>
        <p className="muted">Ask Jarvis to search, draw, take notes, or show progress — it will appear here.</p>
      </div>
    );
  }

  return (
    <div className="artifact-list">
      {[...artifacts].reverse().map((a, i) => (
        <ArtifactCard key={`${a.title}-${i}`} artifact={a} />
      ))}
    </div>
  );
}
