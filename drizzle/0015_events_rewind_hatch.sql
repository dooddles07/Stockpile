-- A sanctioned escape hatch for the append-only guard (0009).
--
-- The domain check scripts (lib/domain/*.checks.ts) drive the real write path
-- and then roll it back, which means deleting the events they just appended.
-- 0009 already exempted TRUNCATE (that is how the seed resets); this adds a
-- second, narrower exemption for a partial rollback.
--
-- A transaction that has run
--   SET LOCAL stockpile.allow_events_rewind = 'on'
-- may UPDATE or DELETE events. Every other caller still hits the exception. The
-- GUC is transaction-scoped (SET LOCAL), opt-in per block, and greppable, so an
-- app-code path cannot rewrite history by accident (ADR-0003, spec story 23).
CREATE OR REPLACE FUNCTION "events_reject_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF current_setting('stockpile.allow_events_rewind', true) = 'on' THEN
		RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
	END IF;
	RAISE EXCEPTION 'events is append-only (ADR-0003): % is not permitted', TG_OP;
END;
$$;
