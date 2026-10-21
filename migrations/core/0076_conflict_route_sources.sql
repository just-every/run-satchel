-- Multiple hidden matters with the same custodian expose one opaque route.
CREATE TABLE s_conflict_route_sources(search_id TEXT NOT NULL REFERENCES s_conflicts(id),route_id TEXT NOT NULL,wall_id TEXT NOT NULL REFERENCES s_ethical_walls(id),PRIMARY KEY(search_id,wall_id));
CREATE TRIGGER s_conflict_route_sources_update BEFORE UPDATE ON s_conflict_route_sources BEGIN SELECT RAISE(ABORT,'Route sources are immutable'); END;
CREATE TRIGGER s_conflict_route_sources_delete BEFORE DELETE ON s_conflict_route_sources BEGIN SELECT RAISE(ABORT,'Route sources are immutable'); END;
