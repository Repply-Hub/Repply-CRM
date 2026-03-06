
-- 1. Create trigger function to auto-create vendedor on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.vendedores (user_id, nome, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    'vendedor'
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Create the trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Link existing orphan auth users to vendedores
UPDATE vendedores SET user_id = (SELECT id FROM auth.users WHERE email = vendedores.email)
WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM auth.users WHERE email = vendedores.email);

-- 4. Create vendedor records for auth users without one
INSERT INTO vendedores (user_id, nome, email, role)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)), u.email, 'vendedor'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM vendedores v WHERE v.user_id = u.id)
ON CONFLICT DO NOTHING;
