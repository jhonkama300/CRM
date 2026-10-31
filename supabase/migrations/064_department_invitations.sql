-- ============================================================
-- 064_department_invitations.sql
--
-- Attach an invitation to a department and a department-level role.
-- When the invitation is redeemed, a trigger adds the new member to
-- that department automatically. Invitations without a department keep
-- their old account-only behavior.
-- ============================================================

ALTER TABLE account_invitations
  ADD COLUMN IF NOT EXISTS department_id uuid
    REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE account_invitations
  ADD COLUMN IF NOT EXISTS department_role text
    CHECK (department_role IN ('manager', 'supervisor', 'agent', 'viewer'));

CREATE INDEX IF NOT EXISTS idx_account_invitations_department
  ON account_invitations(department_id)
  WHERE accepted_at IS NULL;

CREATE OR REPLACE FUNCTION public.apply_invitation_department()
RETURNS trigger AS $$
BEGIN
  IF NEW.accepted_at IS NOT NULL
     AND OLD.accepted_at IS NULL
     AND NEW.department_id IS NOT NULL
     AND NEW.accepted_by_user_id IS NOT NULL THEN
    INSERT INTO public.department_members (
      account_id,
      department_id,
      user_id,
      role
    ) VALUES (
      NEW.account_id,
      NEW.department_id,
      NEW.accepted_by_user_id,
      COALESCE(NEW.department_role, 'agent')
    )
    ON CONFLICT (department_id, user_id)
    DO UPDATE SET role = EXCLUDED.role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS account_invitations_apply_department
  ON account_invitations;
CREATE TRIGGER account_invitations_apply_department
  AFTER UPDATE OF accepted_at ON account_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_invitation_department();
