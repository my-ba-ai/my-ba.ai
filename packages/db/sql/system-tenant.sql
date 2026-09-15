-- The tenant that owns reference data (D38). Must exist before RLS is forced,
-- because the policies that follow would otherwise block this insert.
INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000000', 'System', 'system')
ON CONFLICT (id) DO NOTHING;
