import type { D1TargetAdapter, D1Sql, TargetRow } from '../../modules/import-kit/src/d1/index';

const sql = (sql: string, ...params: unknown[]): D1Sql => ({ sql, params });
const row = (destination: string, party: any): TargetRow => ({
  destination, targetKind: 'party', targetId: party.id, revision: party.revision,
  value: { name: party.name, aliases: party.aliases, email: party.email, source: party.source },
});
function scope(destination: string, kind = 'party') {
  if (destination !== 'main' || kind !== 'party') throw new Error('Invalid Satchel import target');
}

/** Every target is the actual conflict-searchable party, never a shadow row. */
export const partyTargets: D1TargetAdapter = {
  async read(db, destination, kind, id) {
    scope(destination, kind);
    const party = await db.prepare('SELECT * FROM s_parties WHERE id=?').bind(id).first();
    return party ? row(destination, party) : undefined;
  },
  matches(current, destination, kind, id) {
    scope(destination, kind);
    if (!current) return sql('NOT EXISTS(SELECT 1 FROM s_parties WHERE id=?)', id);
    const value = current.value as Record<string, string>;
    return sql('EXISTS(SELECT 1 FROM s_parties WHERE id=? AND revision=? AND name=? AND aliases=? AND email=? AND source=?)', id, current.revision, value.name, value.aliases, value.email, value.source);
  },
  matchesCount(count, destination) { scope(destination); return sql('(SELECT COUNT(*) FROM s_parties)=?', count); },
  matchesMany(rows, destination) { return [this.matchesCount!(rows.length, destination), ...rows.map(current => this.matches(current, destination, current.targetKind, current.targetId))]; },
  async preparePreservedUndo(db, destination, effects) {
    scope(destination);
    // Query the affected set in bulk so large files remain within D1's request
    // budget. Counts plus exact rows catch newly linked matters at publication.
    const ids = JSON.stringify(effects.map(effect => effect.expected.targetId));
    const [parties, relations] = await Promise.all([
      db.prepare('SELECT * FROM s_parties WHERE id IN (SELECT value FROM json_each(?))').bind(ids).all(),
      db.prepare('SELECT matter_id,party_id,relation FROM s_matter_parties WHERE party_id IN (SELECT value FROM json_each(?)) ORDER BY matter_id,party_id').bind(ids).all<{ matter_id: string; party_id: string; relation: string }>(),
    ]);
    const byId = new Map(parties.results.map(party => [party.id, row(destination, party)]));
    const observations = [], dependencies = [], guards: D1Sql[] = [];
    for (const effect of effects) {
      const id = effect.expected.targetId;
      const current = byId.get(id) ?? null;
      const links = relations.results.filter(link => link.party_id === id);
      observations.push({ effectId: effect.provenance.id, current, entity: { table: 's_parties', recordId: id }, evidence: { reason: 'Exact party fields and revision; all incoming matter links' } });
      guards.push(this.matches(current, destination, 'party', id), sql('(SELECT COUNT(*) FROM s_matter_parties WHERE party_id=?)=?', id, links.length));
      for (const link of links) {
        guards.push(sql('EXISTS(SELECT 1 FROM s_matter_parties WHERE matter_id=? AND party_id=? AND relation=?)', link.matter_id, id, link.relation));
        dependencies.push({ requiredEffectId: effect.provenance.id, cause: { table: 's_matter_parties', recordId: link.matter_id, field: 'party_id', targetId: id }, evidence: { matterId: link.matter_id, relation: link.relation, reason: 'A matter still references this party' } });
      }
    }
    // A zero-effect job still requires a nonempty native observation fence.
    if (!guards.length) {
      const meta = await db.prepare('SELECT party_revision FROM s_meta WHERE id=1').first<{ party_revision: number }>();
      if (!meta) throw new Error('Satchel party revision is missing');
      guards.push(sql('(SELECT party_revision FROM s_meta WHERE id=1)=?', meta.party_revision));
    }
    return { observations, dependencies, guards };
  },
  write(current) {
    scope(current.destination, current.targetKind);
    const value = current.value as Record<string, string>;
    // No expectedRevision is emitted by our mapping: Base rejects an existing
    // target instead of overwriting it. Exact source replays reuse provenance.
    return [sql('INSERT INTO s_parties(id,name,aliases,email,source,revision) VALUES(?,?,?,?,?,?)', current.targetId, value.name, value.aliases, value.email, value.source, current.revision)];
  },
  remove(destination, kind, id) {
    scope(destination, kind);
    return [sql('DELETE FROM s_parties WHERE id=? AND NOT EXISTS(SELECT 1 FROM s_matter_parties WHERE party_id=?)', id, id)];
  },
  async list(db, destination) {
    scope(destination);
    return (await db.prepare('SELECT * FROM s_parties ORDER BY id').all()).results.map(party => row(destination, party));
  },
};
