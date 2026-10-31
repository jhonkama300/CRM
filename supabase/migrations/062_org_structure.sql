-- ============================================================
-- 062_org_structure.sql
--
-- Phase 1 of the company-structure work: departments and department
-- membership. This is intentionally additive — nothing in the existing
-- inbox, WhatsApp config, flows, automations, AI or templates changes.
--
-- The account remains the tenant/company. Departments form a tree via
-- parent_id; department_members attaches existing account users with a
-- scoped internal role.
--
-- Phase 3 will add channel/department routing and restrictive RLS by
-- area. For now all account members can read the structure and admins+
-- can edit it.
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES departments(id) ON DELETE SET NULL,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6366f1',
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_account
  ON departments(account_id, position, created_at);

CREATE INDEX IF NOT EXISTS idx_departments_parent
  ON departments(parent_id);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select ON departments;
CREATE POLICY departments_select ON departments FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS departments_insert ON departments;
CREATE POLICY departments_insert ON departments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS departments_update ON departments;
CREATE POLICY departments_update ON departments FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS departments_delete ON departments;
CREATE POLICY departments_delete ON departments FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS departments_updated_at ON departments;
CREATE TRIGGER departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- department_members
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS department_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  department_id  uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role           text NOT NULL DEFAULT 'agent'
                   CHECK (role IN ('manager', 'supervisor', 'agent', 'viewer')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_department_members_department
  ON department_members(department_id);

CREATE INDEX IF NOT EXISTS idx_department_members_user
  ON department_members(user_id);

CREATE INDEX IF NOT EXISTS idx_department_members_account
  ON department_members(account_id);

ALTER TABLE department_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS department_members_select ON department_members;
CREATE POLICY department_members_select ON department_members FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS department_members_insert ON department_members;
CREATE POLICY department_members_insert ON department_members FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS department_members_update ON department_members;
CREATE POLICY department_members_update ON department_members FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS department_members_delete ON department_members;
CREATE POLICY department_members_delete ON department_members FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ------------------------------------------------------------
-- Integrity triggers
-- ------------------------------------------------------------

-- A department cannot parent itself, cross accounts, or create a cycle.
CREATE OR REPLACE FUNCTION public.validate_department_parent()
RETURNS trigger AS $$
DECLARE
  v_parent_account uuid;
  v_cursor uuid;
  v_depth integer := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'a department cannot be its own parent';
  END IF;

  SELECT account_id INTO v_parent_account
  FROM public.departments
  WHERE id = NEW.parent_id;

  IF v_parent_account IS NULL OR v_parent_account <> NEW.account_id THEN
    RAISE EXCEPTION 'parent department must belong to the same account';
  END IF;

  v_cursor := NEW.parent_id;
  WHILE v_cursor IS NOT NULL LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'department hierarchy cycle detected';
    END IF;
    SELECT parent_id INTO v_cursor
    FROM public.departments
    WHERE id = v_cursor;
    v_depth := v_depth + 1;
    IF v_depth > 64 THEN
      RAISE EXCEPTION 'department hierarchy is too deep';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS departments_validate_parent ON departments;
CREATE TRIGGER departments_validate_parent
  BEFORE INSERT OR UPDATE OF parent_id, account_id ON departments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_department_parent();

-- Membership rows must point at a department in the same account and at
-- a user who is actually a member of that account.
CREATE OR REPLACE FUNCTION public.validate_department_member()
RETURNS trigger AS $$
DECLARE
  v_department_account uuid;
BEGIN
  SELECT account_id INTO v_department_account
  FROM public.departments
  WHERE id = NEW.department_id;

  IF v_department_account IS NULL OR v_department_account <> NEW.account_id THEN
    RAISE EXCEPTION 'department must belong to the same account';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = NEW.user_id
      AND account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'user is not a member of this account';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS department_members_validate ON department_members;
CREATE TRIGGER department_members_validate
  BEFORE INSERT OR UPDATE OF department_id, account_id, user_id ON department_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_department_member();
