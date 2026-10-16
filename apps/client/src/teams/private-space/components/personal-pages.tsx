import { useEffect } from "react";
import { Tabs, Text } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import RecentChanges from "@/components/common/recent-changes";
import { homeTabAtom } from "@/features/home/atoms/home-tab-atom";
import { useMyPersonalSpacesQuery } from "../queries/private-space-query";

const PERSONAL_TAB = "personal";

// The Home tab for recent pages in the user's own private spaces. It only
// appears while they have one, since it would always be empty otherwise.
export function PersonalPagesTab() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useAtom(homeTabAtom);
  const { data: spaces, isSuccess } = useMyPersonalSpacesQuery();
  const hidden = isSuccess && spaces.length === 0;

  // The remembered tab may point here after the last private space is gone.
  useEffect(() => {
    if (hidden && activeTab === PERSONAL_TAB) setActiveTab("recent");
  }, [hidden, activeTab, setActiveTab]);

  if (!spaces?.length) return null;

  return (
    <Tabs.Tab value={PERSONAL_TAB} leftSection={<IconLock size={18} />}>
      <Text size="sm" fw={500}>
        {t("Personal")}
      </Text>
    </Tabs.Tab>
  );
}

export function PersonalPagesPanel() {
  return (
    <Tabs.Panel value={PERSONAL_TAB}>
      <RecentChanges personalOnly />
    </Tabs.Panel>
  );
}
