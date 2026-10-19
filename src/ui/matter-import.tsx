import { useEffect, useState } from 'react';
import { api, Empty, Field, Form, type Row, type Run } from './common';

export function MatterImport({ run, tick }: { run: Run; tick: number }) {
  const [csv, setCsv] = useState(''), [filename, setFilename] = useState('clio-matters.csv');
  const [preview, setPreview] = useState<Row>(), [search, setSearch] = useState<Row>();
  const [imports, setImports] = useState<Row[]>([]), [journal, setJournal] = useState<Row>();
  useEffect(() => { api('/matter-import').then(result => setImports(result.imports)).catch(error => run(async () => { throw error; })); }, [tick]);
  function change(value: string, name = filename) { setCsv(value); setFilename(name); setPreview(undefined); setSearch(undefined); }
  async function refresh() { setPreview(await api('/matter-import/preview', { csv, filename })); setSearch(undefined); }
  const blocked = preview?.summary.errors.length > 0;
  return <section className="panel" style={{overflowWrap:'anywhere'}}>
    <h2>Clio matters</h2>
    <p>Preserve each source matter number. Prepare the CSV columns described in IMPORTING.md, then review and open one matter at a time.</p>
    <label>Matters CSV<input type="file" accept=".csv,text/csv" onChange={event => {
      const file = event.target.files?.[0];
      if (file) run(async () => change(await file.text(), file.name));
    }} /></label>
    <label>Matter CSV contents<textarea rows={7} value={csv} onChange={event => change(event.target.value)} /></label>
    <button disabled={!csv} onClick={() => run(refresh, 'Matter preview complete; no matters were changed')}>Preview matters</button>
    {preview && <div className="review">
      <h3>Review source matters</h3>
      <p>{preview.summary.imported} already imported · {preview.summary.pending} pending · {preview.summary.total} source rows</p>
      {preview.diagnostics.map((diagnostic: Row, index: number) => <p key={index} role={diagnostic.severity === 'error' ? 'alert' : undefined}>{diagnostic.message}</p>)}
      {preview.rows.map((row: Row) => <article className="record" key={row.sourceId}>
        <strong>{row.number} · {row.title}</strong>
        <p>{row.client} · Adverse party: {row.adverse}</p>
        <small>Clio ID {row.sourceId} · {row.status === 'imported' ? 'Imported; replay will keep the existing matter' : row.status}</small>
        {row.status === 'imported' ? <button className="quiet" disabled={blocked} onClick={() => run(async () => {
          await api('/matter-import/resume', { csv, filename, fingerprint: preview.fingerprint, sourceId: row.sourceId }); await refresh();
        }, 'Existing matter retained; no duplicate created')}>Verify existing import</button> : <>
          <button disabled={blocked} onClick={() => run(async () => {
            setSearch({ ...(await api('/conflicts', { client: row.client, adverse: row.adverse })), sourceId: row.sourceId });
          }, 'Search recorded. Review possible matches and record your conclusion.')}>Search conflicts for {row.number}</button>
          {search && search.sourceId === row.sourceId && <div className="review">
            <h4>{search.matches.length} possible matches</h4>
            <p>This search covers firm records. The principal must assess conflicts and any required clearance.</p>
            {search.matches.map((match: Row) => <p key={match.id}><strong>{match.name}</strong> {match.aliases}</p>)}
            <Form label={`Import reviewed matter ${row.number}`} submit={data => run(async () => {
              await api('/matter-import/commit', { csv, filename, fingerprint: preview.fingerprint, sourceId: row.sourceId, conflictId: search!.id, confirmed: data.confirmed === 'on', reviewNote: data.reviewNote });
              await refresh();
            }, 'Matter imported with its source number and recorded human review')}>
              <Field label="Conflict conclusion and any clearance" name="reviewNote" />
              <label className="check"><input type="checkbox" name="confirmed" required />I reviewed these results and am authorized to open this matter.</label>
            </Form>
          </div>}
        </>}
      </article>)}
    </div>}
    <h3>Matter import journal</h3>
    {!imports.length && <Empty>No matters imported yet.</Empty>}
    {imports.map(item => <article className="record" key={item.fingerprint}>
      <strong>{item.filename}</strong><p>{item.imported} / {item.total} rows first imported from this file</p>
      <button className="quiet" onClick={() => run(async () => {
        const result = await api('/matter-import/status', { fingerprint: item.fingerprint }); setJournal(result);
      }, 'Matter provenance opened')}>View matter provenance</button>
      <button className="quiet" onClick={() => run(async () => {
        const result = await api('/matter-import/status', { fingerprint: item.fingerprint });
        const bytes = Uint8Array.from(atob(result.original.original_base64), value => value.charCodeAt(0));
        const contents = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
        change(contents, result.original.filename);
        setPreview(await api('/matter-import/preview', { csv: contents, filename: result.original.filename }));
      }, 'Original CSV loaded. Review each remaining matter before importing.')}>Resume from original CSV</button>
    </article>)}
    {journal && <details open><summary>Source identities and reviews</summary>
      <p>{journal.original.filename} · SHA-256 {journal.original.sha256}</p>
      {journal.rows.map((row: Row) => <article className="record" key={row.source_id}><strong>{row.source_number} · Clio ID {row.source_id}</strong><p>{row.review_note}</p><small>{row.reviewed_by} · {row.imported_at} · source row {row.source_line}</small></article>)}
    </details>}
  </section>;
}
