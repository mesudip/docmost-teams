import { ISpace } from "@/features/space/types/space.types";

type SpaceViewerCommentsToggleProps = {
  space: ISpace;
};

// Viewer comments need Feature.VIEWER_COMMENTS, which docmost-teams lacks.
export default function SpaceViewerCommentsToggle(
  _props: SpaceViewerCommentsToggleProps,
) {
  return null;
}
