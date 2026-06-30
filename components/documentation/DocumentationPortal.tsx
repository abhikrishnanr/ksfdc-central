'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  GitBranch,
  HeartPulse,
  Info,
  ListChecks,
  Network,
  Search,
  ShieldCheck,
  TerminalSquare,
  Timer,
  Wrench
} from 'lucide-react';
import type { DocCallout, DocCode, DocDiagram, DocSection, DocTable, TechnicalManual } from '../../lib/documentation/version-2';
import CopyButton from './CopyButton';

function sectionText(section: DocSection) {
  return JSON.stringify(section).toLowerCase();
}

function calloutIcon(tone: DocCallout['tone']) {
  if (tone === 'danger' || tone === 'warning') return <AlertTriangle size={18} aria-hidden="true" />;
  if (tone === 'success') return <CheckCircle2 size={18} aria-hidden="true" />;
  return <Info size={18} aria-hidden="true" />;
}

function sectionIcon(id: string) {
  const props = { size: 18, 'aria-hidden': true as const };
  if (id.includes('architecture')) return <Network {...props} />;
  if (id.includes('timing')) return <Timer {...props} />;
  if (id.includes('heartbeat')) return <HeartPulse {...props} />;
  if (id.includes('sync')) return <GitBranch {...props} />;
  if (id.includes('database')) return <Database {...props} />;
  if (id.includes('security')) return <ShieldCheck {...props} />;
  if (id.includes('deployment') || id.includes('installation')) return <TerminalSquare {...props} />;
  if (id.includes('troubleshooting')) return <Wrench {...props} />;
  if (id.includes('duplicate') || id.includes('booking')) return <ListChecks {...props} />;
  return <BookOpen {...props} />;
}

function TableBlock({ table }: { table: DocTable }) {
  const copyValue = [
    table.title,
    table.columns.join('\t'),
    ...table.rows.map((row) => row.join('\t'))
  ].join('\n');

  return (
    <article className="doc-table-card">
      <div className="doc-table-heading">
        <div>
          <h3>{table.title}</h3>
          {table.description ? <p>{table.description}</p> : null}
        </div>
        <CopyButton value={copyValue} label="Copy table" />
      </div>
      <div className="doc-table-wrap" tabIndex={0}>
        <table>
          <thead>
            <tr>
              {table.columns.map((column) => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={`${table.title}-${rowIndex}`}>
                {row.map((cell, cellIndex) => <td key={`${table.title}-${rowIndex}-${cellIndex}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function DiagramBlock({ diagram }: { diagram: DocDiagram }) {
  return (
    <article className="doc-diagram-card">
      <div className="doc-table-heading">
        <div>
          <h3>{diagram.title}</h3>
          <p>{diagram.description}</p>
        </div>
        <CopyButton value={[diagram.title, diagram.description, ...diagram.steps].join('\n')} label="Copy flow" />
      </div>
      <ol className="doc-flow" aria-label={diagram.title}>
        {diagram.steps.map((step, index) => (
          <li key={`${diagram.title}-${step}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <p>{step}</p>
          </li>
        ))}
      </ol>
      {diagram.notes?.length ? (
        <ul className="doc-note-list">
          {diagram.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : null}
    </article>
  );
}

function CodeBlock({ snippet }: { snippet: DocCode }) {
  return (
    <article className="doc-code-card">
      <div className="doc-table-heading">
        <div>
          <h3>{snippet.title}</h3>
          {snippet.warning ? <p className="doc-code-warning">{snippet.warning}</p> : null}
        </div>
        <CopyButton value={snippet.code} label="Copy command" />
      </div>
      <pre><code>{snippet.code}</code></pre>
    </article>
  );
}

function SectionBlock({ section }: { section: DocSection }) {
  return (
    <section className="doc-section" id={section.id}>
      <div className="doc-section-heading">
        <span className="doc-section-icon">{sectionIcon(section.id)}</span>
        <div>
          {section.kicker ? <p className="eyebrow">{section.kicker}</p> : null}
          <h2>{section.title}</h2>
          <p>{section.summary}</p>
        </div>
      </div>

      {section.body?.length ? (
        <div className="doc-prose">
          {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      ) : null}

      {section.cards?.length ? (
        <div className="doc-card-grid">
          {section.cards.map((card) => (
            <article className={`doc-info-card tone-${card.tone ?? 'neutral'}`} key={card.title}>
              {card.meta ? <span>{card.meta}</span> : null}
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      ) : null}

      {section.callouts?.length ? (
        <div className="doc-callout-grid">
          {section.callouts.map((callout) => (
            <aside className={`doc-callout tone-${callout.tone}`} key={callout.title}>
              {calloutIcon(callout.tone)}
              <div>
                <h3>{callout.title}</h3>
                <p>{callout.body}</p>
              </div>
            </aside>
          ))}
        </div>
      ) : null}

      {section.diagrams?.length ? (
        <div className="doc-stack">
          {section.diagrams.map((diagram) => <DiagramBlock diagram={diagram} key={diagram.title} />)}
        </div>
      ) : null}

      {section.tables?.length ? (
        <div className="doc-stack">
          {section.tables.map((table, index) => index > 0 ? (
            <details className="doc-details" key={table.title}>
              <summary>{table.title}</summary>
              <TableBlock table={table} />
            </details>
          ) : <TableBlock table={table} key={table.title} />)}
        </div>
      ) : null}

      {section.codes?.length ? (
        <div className="doc-code-grid">
          {section.codes.map((snippet) => <CodeBlock snippet={snippet} key={snippet.title} />)}
        </div>
      ) : null}
    </section>
  );
}

export default function DocumentationPortal({ manual }: { manual: TechnicalManual }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!normalizedQuery) return manual.sections;
    return manual.sections.filter((section) => sectionText(section).includes(normalizedQuery));
  }, [manual.sections, normalizedQuery]);

  const counts = useMemo(() => {
    const tableCount = manual.sections.reduce((total, section) => total + (section.tables?.length ?? 0), 0);
    const diagramCount = manual.sections.reduce((total, section) => total + (section.diagrams?.length ?? 0), 0);
    const apiRows = manual.sections
      .flatMap((section) => section.tables ?? [])
      .find((table) => table.title === 'Important API Groups')?.rows.length ?? 0;
    return { tableCount, diagramCount, apiRows };
  }, [manual.sections]);

  return (
    <div className="technical-doc-shell">
      <aside className="doc-sidebar" aria-label="Documentation navigation">
        <div className="doc-version-card">
          <span>{manual.meta.documentationVersion}</span>
          <h1>{manual.meta.productName}</h1>
          <p>{manual.meta.applicationVersion}</p>
          <small>Last reviewed {manual.meta.lastReviewed}</small>
        </div>

        <label className="doc-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter sections, routes, tables"
            aria-label="Filter documentation sections"
          />
        </label>

        <nav className="doc-toc">
          {manual.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {sectionIcon(section.id)}
              <span>{section.title}</span>
            </a>
          ))}
        </nav>
      </aside>

      <main className="doc-content">
        <section className="doc-hero">
          <div>
            <p className="eyebrow">Technical knowledge portal</p>
            <h1>{manual.meta.documentationVersion} Technical Documentation</h1>
            <p>
              Verified engineering manual for the hybrid central and local theatre ticketing architecture,
              generated from the current source code and schema audit.
            </p>
          </div>
          <div className="doc-hero-stats">
            <span><strong>{manual.sections.length}</strong> sections</span>
            <span><strong>{counts.diagramCount}</strong> diagrams</span>
            <span><strong>{counts.tableCount}</strong> tables</span>
            <span><strong>{counts.apiRows}</strong> API rows</span>
          </div>
        </section>

        <section className="doc-audience" aria-label="Intended users">
          {manual.meta.audience.map((item) => <span key={item}>{item}</span>)}
        </section>

        {normalizedQuery && !visibleSections.length ? (
          <section className="doc-empty">
            <h2>No matching documentation sections</h2>
            <p>Try a route name, table name, authority mode, or worker log phrase.</p>
          </section>
        ) : null}

        <div className="doc-sections">
          {visibleSections.map((section) => <SectionBlock section={section} key={section.id} />)}
        </div>
      </main>
    </div>
  );
}
