-- INTAKE-005: the actual search population, retained with the exact matches.
-- Earlier searches remain explicitly unrecorded rather than inferred today.
ALTER TABLE s_conflicts ADD COLUMN search_summary TEXT CHECK(search_summary IS NULL OR json_valid(search_summary));
