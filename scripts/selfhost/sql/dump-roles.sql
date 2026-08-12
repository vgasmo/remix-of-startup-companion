-- Emits GRANT statements for public-schema objects so the destination project
-- can be verified against the source (Supabase manages the roles themselves).
select format(
         'GRANT %s ON TABLE public.%I TO %I;',
         string_agg(distinct privilege_type, ', ' order by privilege_type),
         table_name,
         grantee
       )
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
