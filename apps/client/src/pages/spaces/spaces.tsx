import { Container, Title, Text, Group, Box } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { SpaceCreationAction } from "@/teams/private-space/components/space-creation-action";
import { AllSpacesList } from "@/features/space/components/spaces-page";
import FavoriteSpacesGrid from "@/features/space/components/spaces-page/favorite-spaces-grid";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search";
import { DocumentTitle } from "@/components/ui/document-title.tsx";

export default function Spaces() {
  const { t } = useTranslation();
  const { search, cursor, goNext, goPrev, handleSearch } =
    usePaginateAndSearch();

  const { data, isLoading } = useGetSpacesQuery({
    cursor,
    limit: 30,
    query: search,
  });

  return (
    <>
      <DocumentTitle title={t("Spaces")} />

      <Container size={"800"} pt="xl">
        <Group justify="space-between" mb="xl">
          <Title order={1} size="h3">
            {t("Spaces")}
          </Title>
          <SpaceCreationAction />
        </Group>

        <FavoriteSpacesGrid />

        <Box>
          <Text size="sm" c="dimmed" mb="md">
            {t("All spaces")}
          </Text>

          <AllSpacesList
            spaces={data?.items || []}
            onSearch={handleSearch}
            hasPrevPage={data?.meta?.hasPrevPage}
            hasNextPage={data?.meta?.hasNextPage}
            onNext={() => goNext(data?.meta?.nextCursor)}
            onPrev={goPrev}
          />
        </Box>
      </Container>
    </>
  );
}
