import { Group, Skeleton, Stack } from "@mantine/core";

type BaseTableSkeletonProps = {
  rows?: number;
  columns?: number;
};

// A header row plus `rows` rows of `columns` cells.
export function BaseTableSkeleton({
  rows = 3,
  columns = 3,
}: BaseTableSkeletonProps) {
  const rowCount = Math.max(0, rows) + 1;
  const columnCount = Math.max(1, columns);

  return (
    <Stack gap={6} p="xs" aria-hidden>
      {Array.from({ length: rowCount }, (_, row) => (
        <Group key={row} gap={6} wrap="nowrap">
          {Array.from({ length: columnCount }, (_, column) => (
            <Skeleton
              key={column}
              height={row === 0 ? 26 : 32}
              radius="sm"
              style={{ flex: 1 }}
            />
          ))}
        </Group>
      ))}
    </Stack>
  );
}
