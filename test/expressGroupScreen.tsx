import GroupScreen from "@/app/express/group/[id]";
import * as api from "@/lib/api";
import { useExpressGroup } from "@/store/expressGroup";
import { useSession } from "@/store/session";
import { renderScreen } from "@/test/renderScreen";

/**
 * Shared set-up for the group screen tests. Each test file mocks
 * `expo-router`, `@/hooks/useLiveRefresh`, `@/components/DeliveryMap` and the
 * group reads in `@/lib/api` itself (jest hoists `jest.mock` per file).
 */
export async function renderGroup(
  as: string,
  group: api.ExpressGroup | null,
  tracking: api.ExpressGroupTracking | null = null,
  failure: unknown = null,
) {
  useExpressGroup.getState().reset();
  useSession.setState({ user: { id: as } as never });
  if (failure) jest.mocked(api.getExpressGroup).mockRejectedValue(failure);
  else jest.mocked(api.getExpressGroup).mockResolvedValue(group as api.ExpressGroup);
  if (tracking) jest.mocked(api.getExpressGroupTracking).mockResolvedValue(tracking);
  return renderScreen(<GroupScreen />);
}
