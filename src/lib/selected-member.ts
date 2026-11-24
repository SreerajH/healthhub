import { useEffect } from 'react';
import { create } from 'zustand';

import { useMembers } from '@/hooks';

/** The family member whose health Home is showing. Empty until the family loads, then the account holder. */
type SelectedMember = { memberId: string; select: (id: string) => void };

export const useSelectedMember = create<SelectedMember>((set) => ({
  memberId: '',
  select: (memberId) => set({ memberId }),
}));

/**
 * Keeps the selection pointing at someone real: the account holder on first load, and
 * back to them if whoever was selected is removed.
 */
export function useSelectedMemberSync() {
  const { data: members = [] } = useMembers();
  const { memberId, select } = useSelectedMember();
  useEffect(() => {
    if (!members.length) return;
    if (members.some((m) => m.id === memberId)) return;
    const next = members.find((m) => m.relation === 'self') ?? members[0];
    if (next) select(next.id);
  }, [members, memberId, select]);
}
