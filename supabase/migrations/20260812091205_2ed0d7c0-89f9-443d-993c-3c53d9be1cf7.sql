DO $$
DECLARE
  r record;
  v_notnull text[] := '{}';
  v_ref text;
BEGIN
  FOR r IN
    SELECT c.oid, c.conname, c.conrelid::regclass AS tbl, c.confrelid,
           a.attname AS col, a.attnotnull AS is_notnull
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f'
       AND c.confrelid IN ('public.profiles'::regclass, 'auth.users'::regclass)
       AND c.confdeltype IN ('a','r')
       AND array_length(c.conkey, 1) = 1
  LOOP
    IF r.is_notnull THEN
      v_notnull := v_notnull || format('%s.%s (%s)', r.tbl, r.col, r.conname);
      CONTINUE;
    END IF;

    v_ref := CASE WHEN r.confrelid = 'public.profiles'::regclass
                  THEN 'public.profiles' ELSE 'auth.users' END;

    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(id) ON DELETE SET NULL',
      r.tbl, r.conname, r.col, v_ref
    );
  END LOOP;

  IF array_length(v_notnull, 1) > 0 THEN
    RAISE WARNING 'FKs NOT NULL por decidir manualmente: %', array_to_string(v_notnull, ', ');
  END IF;
END $$;