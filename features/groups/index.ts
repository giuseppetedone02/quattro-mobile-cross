export {
  useGroups,
  usePersonalGroup,
  useGroup,
  useGroupMembers,
  useCreateGroup,
  useUpdateGroup,
  useLeaveGroup,
  useDeleteGroup,
  useRemoveMember,
  useChangeMemberRole,
  isPersonalGroup,
  canEditGroup,
  canDeleteGroup,
  canLeaveGroup,
  canManageMembers,
  PERSONAL_GROUP_LOCKED,
  type GroupSummary,
  type GroupMemberWithProfile,
  type MemberProfile,
  type CreateGroupInput,
  type UpdateGroupInput,
} from './hooks/useGroups';

export { GroupCard, type GroupCardProps } from './components/GroupCard';
export { GroupSwitcher, type GroupSwitcherProps } from './components/GroupSwitcher';
export { GroupForm, type GroupFormProps, type GroupFormSubmit } from './components/GroupForm';

export {
  groupSchema,
  groupNameSchema,
  groupDescriptionSchema,
  firstError,
  GROUP_NAME_MIN,
  GROUP_NAME_MAX,
  GROUP_DESCRIPTION_MAX,
  type GroupFormValues,
} from './schema';
