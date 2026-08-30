-- Ticket 09: the Event stream is append-only. `applyStockChange` is the only
-- writer and it only ever INSERTs; this makes that a guarantee the database
-- enforces rather than a convention (ADR-0003 — "the event stream is
-- append-only"; spec story 23 — history cannot be rewritten to hide a
-- mistake). TRUNCATE is unaffected: it fires only BEFORE TRUNCATE triggers,
-- so the seed's re-seed reset still works.
CREATE FUNCTION "events_reject_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'events is append-only (ADR-0003): % is not permitted', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "events_append_only" BEFORE UPDATE OR DELETE ON "events"
	FOR EACH ROW EXECUTE FUNCTION "events_reject_mutation"();
