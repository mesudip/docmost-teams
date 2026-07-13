import WorkspaceAbilityFactory from './workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../interfaces/workspace-ability.type';
import { UserRole } from '../../../common/helpers/types/permission';

describe('WorkspaceAbilityFactory', () => {
  const factory = new WorkspaceAbilityFactory();

  it('allows members to create private spaces without allowing team-space creation', () => {
    const ability = factory.createForUser(
      { role: UserRole.MEMBER } as any,
      null,
    );

    expect(
      ability.can(
        WorkspaceCaslAction.Create,
        WorkspaceCaslSubject.PrivateSpace,
      ),
    ).toBe(true);
    expect(
      ability.can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Space),
    ).toBe(false);
  });
});
