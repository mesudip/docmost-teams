// Page verification is not part of docmost-teams.

type PageVerificationBadgeProps = {
  readOnly?: boolean;
};

type PageVerificationMenuItemProps = {
  pageId: string;
  onClick: () => void;
};

type PageVerificationModalProps = {
  pageId: string;
  opened: boolean;
  onClose: () => void;
};

export function PageVerificationBadge(_props: PageVerificationBadgeProps) {
  return null;
}

export function PageVerificationMenuItem(
  _props: PageVerificationMenuItemProps,
) {
  return null;
}

export function PageVerificationModal(_props: PageVerificationModalProps) {
  return null;
}
